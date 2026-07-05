const express  = require('express');
const supabase = require('../supabaseClient');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/events — public list of approved events ─────────────────────
// Feature #7: upcoming=true filters to future events only for discover page
router.get('/', async (req, res) => {
  const { status = 'approved', upcoming, club_id, limit = 100, offset = 0, all } = req.query;

  let q = supabase.from('events')
    .select(`
      id, title, description, event_date, end_date, location,
      capacity, is_paid, price, member_price, non_member_price,
      status, banner_url, banner_base64, category, created_at,
      clubs(id, name, logo_url, logo_base64, type, category),
      users!events_created_by_fkey(full_name)
    `)
    .order('event_date', { ascending: true })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  // Admin can request all events; otherwise filter by status
  if (!all) q = q.eq('status', status);
  // Feature #7: only upcoming events on the discover page
  if (upcoming === 'true') q = q.gte('event_date', new Date().toISOString());
  if (club_id) q = q.eq('club_id', club_id);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  // Add registration counts
  const events = await Promise.all(data.map(async (event) => {
    const { count } = await supabase.from('registrations')
      .select('*', { count: 'exact', head: true }).eq('event_id', event.id).eq('status', 'confirmed');
    return { ...event, registration_count: count || 0 };
  }));

  return res.json({ events });
});

// ─── GET /api/events/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { data: event, error } = await supabase.from('events')
    .select('*, clubs(id, name, logo_url, logo_base64, description, type, category), users!events_created_by_fkey(id, full_name, email)')
    .eq('id', req.params.id).single();
  if (error || !event) return res.status(404).json({ error: 'Event not found.' });
  const { count } = await supabase.from('registrations')
    .select('*', { count: 'exact', head: true }).eq('event_id', event.id).neq('status', 'cancelled');
  return res.json({ event: { ...event, registration_count: count } });
});

// ─── POST /api/events — Feature #1: banner_base64 required ────────────────
router.post('/', authenticate, requireRole('club_admin', 'admin'), async (req, res) => {
  const { title, description, club_id, event_date, end_date, location, capacity,
          is_paid, price, member_price, non_member_price, banner_url, banner_base64,
          category, registration_deadline } = req.body;

  if (!title || !event_date || !location)
    return res.status(400).json({ error: 'Title, event date, and location are required.' });

  // Feature #1: photo/banner is mandatory when creating an event
  if (!banner_base64 && !banner_url)
    return res.status(400).json({ error: 'An event poster/banner image is required.' });

  // Prevent creating events with a past date
  if (new Date(event_date) < new Date())
    return res.status(400).json({ error: 'Event date cannot be in the past.' });

  if (banner_base64 && banner_base64.length > 2800000)
    return res.status(400).json({ error: 'Image too large. Please use an image under 2MB.' });

  let resolvedClubId = club_id || null;
  if (req.user.role === 'club_admin') {
    const { data: club } = await supabase.from('clubs').select('id').eq('admin_id', req.user.id).single();
    if (!club) return res.status(403).json({ error: 'You are not assigned to any club.' });
    resolvedClubId = club.id;
  }

  const hasDual   = is_paid && (member_price || non_member_price);
  const status    = req.user.role === 'admin' ? 'approved' : 'pending';

  const { data: event, error } = await supabase.from('events').insert({
    title, description, club_id: resolvedClubId, created_by: req.user.id,
    event_date, end_date: end_date || null, location, capacity: capacity || null,
    category: category || null,
    registration_deadline: registration_deadline || null,
    is_paid: is_paid || false,
    price:  is_paid ? (hasDual ? Number(non_member_price) : Number(price) || 0) : 0,
    member_price:     hasDual ? Number(member_price)     : null,
    non_member_price: hasDual ? Number(non_member_price) : null,
    banner_url: banner_url || null,
    banner_base64: banner_base64 || null,
    status,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });

  // Notify club admin's club members (Feature #15: reminder setup)
  if (status === 'approved' && resolvedClubId) {
    const { data: members } = await supabase.from('club_memberships')
      .select('user_id').eq('club_id', resolvedClubId).eq('status', 'approved');
    if (members?.length) {
      const notifications = members.map(m => ({
        user_id: m.user_id, type: 'event',
        title: `New Event: ${title} 📅`,
        message: `Your club just added a new event on ${new Date(event_date).toLocaleDateString('en-KE', { weekday:'long', day:'numeric', month:'long' })} at ${location}.`,
        related_event_id: event.id,
      }));
      await supabase.from('notifications').insert(notifications);
    }
  }

  return res.status(201).json({
    event,
    message: status === 'pending' ? 'Event submitted for approval.' : 'Event created and published.',
  });
});

// ─── PUT /api/events/:id ───────────────────────────────────────────────────
router.put('/:id', authenticate, requireRole('club_admin', 'admin'), async (req, res) => {
  const updates = req.body;
  if (req.user.role === 'club_admin') {
    const { data: event } = await supabase.from('events').select('created_by').eq('id', req.params.id).single();
    if (!event || event.created_by !== req.user.id)
      return res.status(403).json({ error: 'You can only edit your own events.' });
  }
  if (updates.banner_base64 && updates.banner_base64.length > 2800000)
    return res.status(400).json({ error: 'Image too large. Please use an image under 2MB.' });

  const allowed = ['title','description','event_date','end_date','location','capacity',
                   'is_paid','price','member_price','non_member_price','banner_url','banner_base64',
                   'category','registration_deadline'];
  const safe = {};
  allowed.forEach(f => { if (updates[f] !== undefined) safe[f] = updates[f]; });
  if (req.user.role === 'admin' && updates.status) safe.status = updates.status;

  const { data, error } = await supabase.from('events').update(safe).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ event: data });
});

// ─── PATCH /api/events/:id/status — admin approve/reject ──────────────────
router.patch('/:id/status', authenticate, requireRole('admin'), async (req, res) => {
  const { status } = req.body;
  if (!['approved','rejected','cancelled','completed'].includes(status))
    return res.status(400).json({ error: 'Invalid status.' });

  const { data: event, error } = await supabase.from('events').update({ status })
    .eq('id', req.params.id).select('id, title, status, created_by').single();
  if (error) return res.status(500).json({ error: error.message });

  if (event) {
    await supabase.from('notifications').insert({
      user_id: event.created_by,
      title: status === 'approved' ? 'Event Approved ✅' : 'Event Status Updated',
      message: `Your event "${event.title}" has been ${status}.`,
      type: status === 'approved' ? 'success' : 'info',
      related_event_id: event.id,
    });
  }

  return res.json({ event, message: `Event ${status} successfully.` });
});

// ─── DELETE /api/events/:id ────────────────────────────────────────────────
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { error } = await supabase.from('events').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ message: 'Event deleted.' });
});

module.exports = router;
