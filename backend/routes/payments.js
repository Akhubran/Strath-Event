const express = require('express');
const QRCode = require('qrcode');
const supabase = require('../supabaseClient');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─── Helper: get M-Pesa OAuth token ───────────────────────────────────────
const getMpesaToken = async () => {
  const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET } = process.env;
  const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');

  const response = await fetch(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${auth}` } }
  );
  const data = await response.json();
  return data.access_token;
};

// ─── Helper: generate M-Pesa STK password ─────────────────────────────────
const getMpesaPassword = () => {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const raw = `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`;
  return { password: Buffer.from(raw).toString('base64'), timestamp };
};

// ─── Helper: generate ticket after payment ────────────────────────────────
const generateTicketCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `SE-${rand(4)}-${rand(4)}-${rand(4)}`;
};

const issueTicket = async (registration_id) => {
  const { data: reg } = await supabase
    .from('registrations')
    .select(`*, users(id, full_name, admission_number), events(id, title, event_date, location)`)
    .eq('id', registration_id)
    .single();

  if (!reg) return null;

  const ticketCode = generateTicketCode();
  const qrPayload = JSON.stringify({
    ticket_code: ticketCode,
    event_id: reg.events.id,
    event_title: reg.events.title,
    user_id: reg.users.id,
    user_name: reg.users.full_name,
    admission_number: reg.users.admission_number,
    event_date: reg.events.event_date,
    location: reg.events.location,
  });

  const qrImageUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: 'H', margin: 2, width: 300,
    color: { dark: '#1a1a2e', light: '#ffffff' },
  });

  const { data: ticket } = await supabase
    .from('tickets')
    .insert({ registration_id, ticket_code: ticketCode, qr_data: qrPayload, qr_image_url: qrImageUrl })
    .select()
    .single();

  return ticket;
};

// ─── POST /api/payments/stk-push — initiate M-Pesa payment ───────────────
router.post('/stk-push', authenticate, requireRole('student'), async (req, res) => {
  const { registration_id, phone_number } = req.body;

  if (!registration_id || !phone_number)
    return res.status(400).json({ error: 'registration_id and phone_number are required.' });

  // Fetch registration + event
  const { data: reg } = await supabase
    .from('registrations')
    .select('*, events(id, title, price, member_price, non_member_price, is_paid, club_id)')
    .eq('id', registration_id)
    .eq('user_id', req.user.id)
    .single();

  if (!reg) return res.status(404).json({ error: 'Registration not found.' });
  if (!reg.events.is_paid) return res.status(400).json({ error: 'This event is free. No payment required.' });
  if (reg.status === 'confirmed') return res.status(400).json({ error: 'Registration already confirmed.' });

  // Determine correct price (member vs non-member)
  let amount = Math.ceil(reg.events.price || 0);
  if (reg.events.club_id && reg.events.member_price != null && reg.events.non_member_price != null) {
    const { data: membership } = await supabase
      .from('club_memberships')
      .select('status')
      .eq('user_id', req.user.id)
      .eq('club_id', reg.events.club_id)
      .maybeSingle();
    const isMember = membership?.status === 'approved';
    amount = Math.ceil(isMember ? reg.events.member_price : reg.events.non_member_price);
  }

  // Check for existing pending payment
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id, status')
    .eq('registration_id', registration_id)
    .eq('status', 'pending')
    .maybeSingle();

  // Sanitize phone number (254XXXXXXXXX format)
  let phone = phone_number.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '254' + phone.slice(1);
  if (phone.startsWith('+')) phone = phone.slice(1);

  try {
    const token = await getMpesaToken();
    const { password, timestamp } = getMpesaPassword();

    const stkBody = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: `SE-${reg.event_id?.slice(0, 8)?.toUpperCase()}`,
      TransactionDesc: `Payment for ${reg.events.title}`,
    };

    const stkResponse = await fetch(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(stkBody),
      }
    );
    const stkData = await stkResponse.json();

    if (stkData.ResponseCode !== '0') {
      return res.status(400).json({ error: stkData.errorMessage || 'STK push failed.' });
    }

    // Save payment record
    const paymentData = {
      registration_id,
      user_id: req.user.id,
      event_id: reg.event_id,
      amount,
      phone_number: phone,
      mpesa_checkout_request_id: stkData.CheckoutRequestID,
      status: 'pending',
    };

    if (existingPayment) {
      await supabase.from('payments').update(paymentData).eq('id', existingPayment.id);
    } else {
      await supabase.from('payments').insert(paymentData);
    }

    return res.json({
      message: 'STK Push sent! Check your phone to complete payment.',
      checkout_request_id: stkData.CheckoutRequestID,
    });
  } catch (err) {
    console.error('STK Push error:', err);
    return res.status(500).json({ error: 'Failed to initiate payment. Please try again.' });
  }
});

// ─── POST /api/payments/mpesa-callback — M-Pesa server callback ───────────
// This URL is called by Safaricom — no auth required
router.post('/mpesa-callback', async (req, res) => {
  const { Body } = req.body;

  if (!Body?.stkCallback) {
    return res.status(400).json({ ResultCode: 1, ResultDesc: 'Invalid callback' });
  }

  const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = Body.stkCallback;

  // Acknowledge Safaricom immediately
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('mpesa_checkout_request_id', CheckoutRequestID)
    .single();

  if (!payment) return;

  if (ResultCode === 0) {
    // Payment successful — extract transaction details
    const meta = {};
    CallbackMetadata?.Item?.forEach((item) => { meta[item.Name] = item.Value; });

    await supabase.from('payments').update({
      status: 'completed',
      mpesa_transaction_id: meta.MpesaReceiptNumber,
      confirmed_at: new Date().toISOString(),
    }).eq('id', payment.id);

    // Confirm registration
    await supabase.from('registrations').update({ status: 'confirmed' }).eq('id', payment.registration_id);

    // Generate ticket
    const ticket = await issueTicket(payment.registration_id);

    // Notify student
    const { data: reg } = await supabase
      .from('registrations')
      .select('user_id, events(title, id)')
      .eq('id', payment.registration_id)
      .single();

    if (reg) {
      await supabase.from('notifications').insert({
        user_id: reg.user_id,
        title: 'Payment Confirmed & Ticket Ready 🎟️',
        message: `Your payment of KES ${payment.amount} for "${reg.events.title}" is confirmed. Your ticket is ready!`,
        type: 'ticket',
        related_event_id: reg.events.id,
      });
    }
  } else {
    // Payment failed
    await supabase.from('payments').update({ status: 'failed' }).eq('id', payment.id);
    const { data: reg } = await supabase
      .from('registrations')
      .select('user_id, events(title, id)')
      .eq('id', payment.registration_id)
      .single();

    if (reg) {
      await supabase.from('notifications').insert({
        user_id: reg.user_id,
        title: 'Payment Failed ❌',
        message: `Payment for "${reg.events.title}" failed: ${ResultDesc}. Please try again.`,
        type: 'warning',
        related_event_id: reg.events.id,
      });
    }
  }
});

// ─── GET /api/payments/my — student's payment history ─────────────────────
router.get('/my', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('payments')
    .select('*, events(title, event_date)')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ payments: data });
});

// ─── GET /api/payments/event/:eventId — payment summary (club_admin/admin) ─
router.get('/event/:eventId', authenticate, requireRole('club_admin', 'admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('payments')
    .select('*, users(full_name, admission_number, email)')
    .eq('event_id', req.params.eventId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const summary = {
    total: data.length,
    completed: data.filter((p) => p.status === 'completed').length,
    pending: data.filter((p) => p.status === 'pending').length,
    failed: data.filter((p) => p.status === 'failed').length,
    total_revenue: data.filter((p) => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0),
  };

  return res.json({ payments: data, summary });
});

module.exports = router;
