const express  = require('express');
const QRCode   = require('qrcode');
const supabase = require('../supabaseClient');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const generateTicketCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand  = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `SE-${rand(4)}-${rand(4)}-${rand(4)}`;
};

const createTicket = async (registration, event, user) => {
  const ticketCode = generateTicketCode();
  const qrPayload  = JSON.stringify({
    ticket_code: ticketCode, event_id: event.id, event_title: event.title,
    user_id: user.id, user_name: user.full_name, admission_number: user.admission_number,
    event_date: event.event_date, location: event.location,
  });
  const qrImageUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: 'H', margin: 2, width: 300, color: { dark: '#17150F', light: '#ffffff' },
  });
  const { data: ticket, error } = await supabase.from('tickets')
    .insert({ registration_id: registration.id, ticket_code: ticketCode, qr_data: qrPayload, qr_image_url: qrImageUrl })
    .select().single();
  if (error) throw new Error('Failed to generate ticket: ' + error.message);
  return ticket;
};

// ─── POST /api/registrations — register for event ─────────────────────────
router.post('/', authenticate, requireRole('student'), async (req, res) => {
  const { event_id } = req.body;
  if (!event_id) return res.status(400).json({ error: 'event_id is required.' });

  const { data: event } = await supabase.from('events').select('*').eq('id', event_id).single();
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (event.status !== 'approved') return res.status(400).json({ error: 'Event is not open for registration.' });

  // Feature #7: past events cannot be registered for on discover (they show in history)
  if (new Date(event.event_date) < new Date())
    return res.status(400).json({ error: 'This event has already passed.' });

  // Registration deadline check
  if (event.registration_deadline && new Date(event.registration_deadline) < new Date())
    return res.status(400).json({ error: 'Registration for this event has closed.' });

  // Member pricing
  let effectivePrice = event.price || 0;
  let isMember = false;
  if (event.is_paid && event.club_id && event.member_price != null && event.non_member_price != null) {
    const { data: membership } = await supabase.from('club_memberships')
      .select('status').eq('user_id', req.user.id).eq('club_id', event.club_id).maybeSingle();
    isMember = membership?.status === 'approved';
    effectivePrice = isMember ? Number(event.member_price) : Number(event.non_member_price);
  }

  // Capacity check
  if (event.capacity) {
    const { count } = await supabase.from('registrations').select('*', { count: 'exact', head: true })
      .eq('event_id', event_id).neq('status', 'cancelled');
    if (count >= event.capacity) return res.status(400).json({ error: 'This event is fully booked.' });
  }

  // Duplicate check — only block if already confirmed or attended.
  // A 'pending' registration means the student opened the flow but never
  // completed payment, so treat it the same as cancelled and let them retry.
  const { data: existing } = await supabase.from('registrations')
    .select('id, status').eq('event_id', event_id).eq('user_id', req.user.id).maybeSingle();
  if (existing && existing.status === 'confirmed')
    return res.status(409).json({ error: 'You are already registered for this event.' });
  if (existing && existing.status === 'attended')
    return res.status(409).json({ error: 'You already attended this event.' });

  const status = event.is_paid ? 'pending' : 'confirmed';
  let registration;
  if (existing) {
    const { data } = await supabase.from('registrations').update({ status }).eq('id', existing.id).select().single();
    registration = data;
  } else {
    const { data, error } = await supabase.from('registrations')
      .insert({ event_id, user_id: req.user.id, status }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    registration = data;
  }

  let ticket = null;
  if (!event.is_paid) {
    const { data: user } = await supabase.from('users').select('*').eq('id', req.user.id).single();
    ticket = await createTicket(registration, event, user);
    // Feature #15: confirmation notification
    await supabase.from('notifications').insert({
      user_id: req.user.id, type: 'ticket',
      title: 'Registration Confirmed 🎉',
      message: `You are registered for "${event.title}". Your ticket is ready! A confirmation email is on its way.`,
      related_event_id: event.id,
    });
  }

  return res.status(201).json({
    registration, ticket,
    message: event.is_paid
      ? 'Registration initiated. Please complete payment to receive your ticket.'
      : 'Registration confirmed! A confirmation email is on its way.',
    requires_payment: event.is_paid,
    amount: effectivePrice,
    is_member_price: isMember,
  });
});

// ─── GET /api/registrations/my ─────────────────────────────────────────────
// Feature #7: returns all regs; frontend splits into upcoming/past by event_date
router.get('/my', authenticate, async (req, res) => {
  const { data, error } = await supabase.from('registrations')
    .select(`
      id, status, registered_at, event_id,
      events(id, title, event_date, end_date, location, is_paid, price,
             status, banner_url, banner_base64, category, clubs(id, name, type, category)),
      tickets(id, ticket_code, qr_image_url, is_used)
    `)
    .eq('user_id', req.user.id)
    .order('registered_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ registrations: data });
});

// ─── GET /api/registrations/event/:eventId ─────────────────────────────────
router.get('/event/:eventId', authenticate, requireRole('club_admin', 'admin'), async (req, res) => {
  const { data, error } = await supabase.from('registrations')
    .select(`
      id, status, registered_at,
      users(id, full_name, email, admission_number, phone_number),
      tickets(id, ticket_code, is_used, used_at)
    `)
    .eq('event_id', req.params.eventId)
    .order('registered_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ registrations: data });
});

// ─── PATCH /api/registrations/:id/attend — Feature #6: manually mark attended
router.patch('/:id/attend', authenticate, requireRole('club_admin', 'admin'), async (req, res) => {
  const { data: reg } = await supabase.from('registrations')
    .select('id, status, event_id, tickets(id)').eq('id', req.params.id).single();
  if (!reg) return res.status(404).json({ error: 'Registration not found.' });

  // Feature #8: check event hasn't ended — don't mark attended on expired tickets
  const { data: event } = await supabase.from('events').select('event_date').eq('id', reg.event_id).single();
  if (event && new Date(event.event_date) < new Date())
    return res.status(400).json({ error: 'Event has ended. Cannot mark attendance.' });

  await supabase.from('registrations').update({ status: 'attended' }).eq('id', req.params.id);
  if (reg.tickets?.[0]?.id) {
    await supabase.from('tickets').update({ is_used: true, used_at: new Date().toISOString() }).eq('id', reg.tickets[0].id);
  }
  return res.json({ message: 'Marked as attended.' });
});

// ─── POST /api/registrations/verify-ticket — QR scan at gate ──────────────
// Feature #6 + #8: marks attended; Feature #8: expired if event ended
router.post('/verify-ticket', authenticate, requireRole('club_admin', 'admin'), async (req, res) => {
  const { ticket_code } = req.body;
  if (!ticket_code) return res.status(400).json({ error: 'ticket_code is required.' });

  const { data: ticket, error } = await supabase.from('tickets')
    .select(`
      id, ticket_code, is_used, used_at,
      registrations(
        id, status, event_id,
        users(full_name, admission_number, email),
        events(id, title, event_date, location)
      )
    `)
    .eq('ticket_code', ticket_code).single();

  if (error || !ticket) return res.status(404).json({ error: 'Ticket not found.', status: 'invalid' });

  const event = ticket.registrations?.events;

  // Feature #8: check if event has ended → expired, do NOT mark attended
  if (event && new Date(event.event_date) < new Date()) {
    return res.status(400).json({
      error: 'This event has ended. Ticket expired — entry not permitted.',
      status: 'expired',
      ticket,
    });
  }

  if (ticket.is_used) {
    return res.status(400).json({ error: 'Ticket already used.', status: 'used', used_at: ticket.used_at, ticket });
  }

  if (ticket.registrations?.status !== 'confirmed') {
    return res.status(400).json({ error: 'Registration not confirmed.', status: 'invalid', ticket });
  }

  // Valid — mark as used and attended
  await supabase.from('tickets').update({ is_used: true, used_at: new Date().toISOString() }).eq('id', ticket.id);
  await supabase.from('registrations').update({ status: 'attended' }).eq('id', ticket.registrations.id);

  return res.json({ valid: true, status: 'success', message: 'Ticket verified. Entry granted! ✅', ticket });
});

module.exports = router;