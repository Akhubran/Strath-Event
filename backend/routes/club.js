const express  = require('express');
const supabase = require('../supabaseClient');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('club_admin'));

const getMyClub = async (userId) => {
  const { data } = await supabase.from('clubs').select('*').eq('admin_id', userId).single();
  return data;
};

// ─── GET /api/club/dashboard ──────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const club = await getMyClub(req.user.id);
  if (!club) return res.status(404).json({ error: 'No club assigned to your account.' });
  const { data: events } = await supabase.from('events')
    .select('id, title, status, event_date, is_paid, price, capacity, banner_base64')
    .eq('club_id', club.id).order('event_date', { ascending: false });
  const eventIds = events?.map(e => e.id) || [];
  let regMap = {};
  if (eventIds.length > 0) {
    const { data: regs } = await supabase.from('registrations').select('event_id, status').in('event_id', eventIds);
    regs?.forEach(({ event_id, status }) => {
      if (!regMap[event_id]) regMap[event_id] = { confirmed: 0, attended: 0, pending: 0 };
      if (regMap[event_id][status] !== undefined) regMap[event_id][status]++;
    });
  }
  const eventsWithStats = events?.map(e => ({ ...e, registrations: regMap[e.id] || {}, registration_count: Object.values(regMap[e.id] || {}).reduce((a,b)=>a+b,0) }));
  const { data: payments } = await supabase.from('payments').select('amount, status').in('event_id', eventIds).eq('status', 'completed');
  const totalRevenue = payments?.reduce((s, p) => s + Number(p.amount), 0) || 0;
  return res.json({ club, stats: { totalEvents: events?.length || 0, totalRevenue }, events: eventsWithStats });
});

// ─── GET /api/club/events ─────────────────────────────────────────────────
router.get('/events', async (req, res) => {
  const club = await getMyClub(req.user.id);
  if (!club) return res.status(404).json({ error: 'No club assigned.' });
  const { data, error } = await supabase.from('events')
    .select('*').eq('club_id', club.id).order('event_date', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  // Add registration counts
  const events = await Promise.all(data.map(async e => {
    const { count } = await supabase.from('registrations').select('*',{count:'exact',head:true}).eq('event_id',e.id).neq('status','cancelled');
    return { ...e, registration_count: count || 0 };
  }));
  return res.json({ events, club });
});

// ─── GET /api/club/events/:eventId/attendees ──────────────────────────────
router.get('/events/:eventId/attendees', async (req, res) => {
  const club = await getMyClub(req.user.id);
  if (!club) return res.status(404).json({ error: 'No club assigned.' });
  const { data: event } = await supabase.from('events').select('id, title, club_id, event_date').eq('id', req.params.eventId).single();
  if (!event || event.club_id !== club.id) return res.status(403).json({ error: 'Event does not belong to your club.' });
  const { data, error } = await supabase.from('registrations')
    .select('id, status, registered_at, users(id, full_name, email, admission_number, phone_number), tickets(id, ticket_code, is_used, used_at)')
    .eq('event_id', req.params.eventId).order('registered_at');
  if (error) return res.status(500).json({ error: error.message });
  const summary = { confirmed: data.filter(r=>r.status==='confirmed').length, attended: data.filter(r=>r.status==='attended').length, pending: data.filter(r=>r.status==='pending').length };
  return res.json({ event, attendees: data, summary });
});

// ─── GET /api/club/notifications ──────────────────────────────────────────
router.get('/notifications', async (req, res) => {
  const { data } = await supabase.from('notifications')
    .select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(20);
  const unreadCount = data?.filter(n => !n.is_read).length || 0;
  return res.json({ notifications: data, unreadCount });
});

// ─── PATCH /api/club/notifications/read-all ───────────────────────────────
router.patch('/notifications/read-all', async (req, res) => {
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', req.user.id);
  return res.json({ message: 'All notifications marked as read.' });
});

module.exports = router;
