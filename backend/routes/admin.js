const express  = require('express');
const bcrypt   = require('bcryptjs');
const supabase = require('../supabaseClient');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

// ─── GET /api/admin/dashboard ─────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const [
    { count: totalUsers }, { count: totalEvents },
    { count: pendingEvents }, { count: totalRegistrations }, { count: totalClubs },
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('events').select('*', { count: 'exact', head: true }),
    supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('registrations').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
    supabase.from('clubs').select('*', { count: 'exact', head: true }),
  ]);
  const { data: payments } = await supabase.from('payments').select('amount').eq('status', 'completed');
  const totalRevenue = payments?.reduce((s, p) => s + Number(p.amount), 0) || 0;
  const { data: recentEvents } = await supabase.from('events')
    .select('id, title, status, event_date, clubs(name)').order('created_at', { ascending: false }).limit(5);
  const { data: userRoles } = await supabase.from('users').select('role');
  const roleBreakdown = userRoles?.reduce((a, u) => { a[u.role] = (a[u.role] || 0) + 1; return a; }, {}) || {};
  return res.json({ stats: { totalUsers, totalEvents, pendingEvents, totalRegistrations, totalClubs, totalRevenue }, recentEvents, roleBreakdown });
});

// ─── GET /api/admin/users ──────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const { role, search, limit = 100, offset = 0 } = req.query;
  let q = supabase.from('users')
    .select('id, email, full_name, role, admission_number, phone_number, is_active, avatar_base64, created_at')
    .order('created_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);
  if (role) q = q.eq('role', role);
  if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,admission_number.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ users: data });
});

// ─── POST /api/admin/users ─────────────────────────────────────────────────
router.post('/users', async (req, res) => {
  const { email, password, full_name, role, admission_number, phone_number, club_id } = req.body;
  if (!email || !password || !full_name || !role)
    return res.status(400).json({ error: 'Email, password, full name, and role are required.' });
  if (!['student', 'club_admin', 'admin'].includes(role))
    return res.status(400).json({ error: 'Invalid role.' });
  const { data: existing } = await supabase.from('users').select('id').eq('email', email.toLowerCase()).maybeSingle();
  if (existing) return res.status(409).json({ error: 'Email already registered.' });
  const password_hash = await bcrypt.hash(password, 10);
  const { data: user, error } = await supabase.from('users')
    .insert({ email: email.toLowerCase(), password_hash, full_name, role, admission_number, phone_number })
    .select('id, email, full_name, role, admission_number').single();
  if (error) return res.status(500).json({ error: error.message });
  if (role === 'club_admin' && club_id)
    await supabase.from('clubs').update({ admin_id: user.id }).eq('id', club_id);
  return res.status(201).json({ user, message: 'User created successfully.' });
});

// ─── PUT /api/admin/users/:id — Feature #2: edit user info ────────────────
router.put('/users/:id', async (req, res) => {
  const { full_name, phone_number, role, admission_number, is_active } = req.body;
  const updates = {};
  if (full_name !== undefined)       updates.full_name = full_name;
  if (phone_number !== undefined)    updates.phone_number = phone_number;
  if (role !== undefined)            updates.role = role;
  if (admission_number !== undefined) updates.admission_number = admission_number;
  if (is_active !== undefined)       updates.is_active = is_active;
  const { data, error } = await supabase.from('users').update(updates)
    .eq('id', req.params.id).select('id, email, full_name, role, admission_number, phone_number, is_active').single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ user: data });
});

// ─── DELETE /api/admin/users/:id — Feature #2: delete user with password confirm
router.delete('/users/:id', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Admin password required to delete a user.' });
  // Verify admin password
  const { data: admin } = await supabase.from('users').select('password_hash').eq('id', req.user.id).single();
  const match = await bcrypt.compare(password, admin.password_hash);
  if (!match) return res.status(401).json({ error: 'Incorrect password.' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account.' });

  const targetId = req.params.id;

  // Clean up dependent rows first so the delete never fails on a foreign
  // key constraint, even on databases that haven't run the latest migration.
  // Payment records are preserved for financial history — just detached
  // from the deleted user — everything else tied directly to the account
  // (registrations/tickets cascade, memberships, notifications, feedback)
  // is removed along with it.
  await supabase.from('payments').update({ user_id: null }).eq('user_id', targetId);
  await supabase.from('club_memberships').delete().eq('user_id', targetId);
  await supabase.from('notifications').delete().eq('user_id', targetId);
  await supabase.from('event_feedback').delete().eq('user_id', targetId);
  await supabase.from('registrations').delete().eq('user_id', targetId); // tickets cascade via registration_id

  const { error } = await supabase.from('users').delete().eq('id', targetId);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ message: 'User deleted.' });
});

// ─── PATCH /api/admin/users/:id/toggle ────────────────────────────────────
router.patch('/users/:id/toggle', async (req, res) => {
  const { data: user } = await supabase.from('users').select('is_active, full_name').eq('id', req.params.id).single();
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot deactivate yourself.' });
  const { data: updated } = await supabase.from('users').update({ is_active: !user.is_active })
    .eq('id', req.params.id).select('id, full_name, is_active').single();
  return res.json({ user: updated, message: `User ${updated.is_active ? 'activated' : 'deactivated'}.` });
});

// ─── GET /api/admin/clubs ─────────────────────────────────────────────────
router.get('/clubs', async (req, res) => {
  const { data, error } = await supabase.from('clubs')
    .select('*, users!clubs_admin_id_fkey(id, full_name, email)').order('name');
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ clubs: data });
});

// ─── POST /api/admin/clubs — Feature #11: club/sport with mandatory photo ─
router.post('/clubs', async (req, res) => {
  const { name, description, admin_id, logo_url, logo_base64, type = 'club', category } = req.body;
  if (!name) return res.status(400).json({ error: 'Club name is required.' });
  if (!logo_base64 && !logo_url) return res.status(400).json({ error: 'A logo/photo is required for the club.' });
  const { data, error } = await supabase.from('clubs')
    .insert({ name, description, admin_id, logo_url, logo_base64, type, category }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ club: data });
});

// ─── PUT /api/admin/clubs/:id ──────────────────────────────────────────────
router.put('/clubs/:id', async (req, res) => {
  const { name, description, admin_id, logo_url, logo_base64, is_active, type, category } = req.body;
  const updates = {};
  if (name !== undefined)        updates.name = name;
  if (description !== undefined) updates.description = description;
  if (admin_id !== undefined)    updates.admin_id = admin_id;
  if (logo_url !== undefined)    updates.logo_url = logo_url;
  if (logo_base64 !== undefined) updates.logo_base64 = logo_base64;
  if (is_active !== undefined)   updates.is_active = is_active;
  if (type !== undefined)        updates.type = type;
  if (category !== undefined)    updates.category = category;
  const { data, error } = await supabase.from('clubs').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ club: data });
});

// ─── DELETE /api/admin/clubs/:id — Feature #4: delete club with password confirm
router.delete('/clubs/:id', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Admin password required to delete a club.' });
  const { data: admin } = await supabase.from('users').select('password_hash').eq('id', req.user.id).single();
  const match = await bcrypt.compare(password, admin.password_hash);
  if (!match) return res.status(401).json({ error: 'Incorrect password.' });
  // Remove memberships first, then club
  await supabase.from('club_memberships').delete().eq('club_id', req.params.id);
  const { error } = await supabase.from('clubs').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ message: 'Club deleted.' });
});

// ─── GET /api/admin/clubs/:id/members — Feature #10: view and remove members
router.get('/clubs/:id/members', async (req, res) => {
  const { data, error } = await supabase.from('club_memberships')
    .select('*, users!club_memberships_user_id_fkey(id, full_name, email, admission_number)')
    .eq('club_id', req.params.id).order('requested_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ members: data });
});

// ─── GET /api/admin/events ─────────────────────────────────────────────────
router.get('/events', async (req, res) => {
  const { status, limit = 100, offset = 0 } = req.query;
  let q = supabase.from('events')
    .select('*, clubs(name, type, category), users!events_created_by_fkey(full_name, email)')
    .order('created_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ events: data });
});

// ─── GET /api/admin/analytics ─────────────────────────────────────────────
router.get('/analytics', async (req, res) => {
  const { data: eventStats } = await supabase.from('events').select('status');
  const byStatus = eventStats?.reduce((a, e) => { a[e.status] = (a[e.status] || 0) + 1; return a; }, {}) || {};
  const { data: topEvents } = await supabase.from('registrations').select('event_id, events(title)').eq('status', 'confirmed');
  const ec = {};
  topEvents?.forEach(({ event_id, events }) => {
    if (!ec[event_id]) ec[event_id] = { title: events?.title, count: 0 };
    ec[event_id].count++;
  });
  const topEventsList = Object.values(ec).sort((a, b) => b.count - a.count).slice(0, 5);
  const sixMo = new Date(); sixMo.setMonth(sixMo.getMonth() - 6);
  const { data: monthlyRegs } = await supabase.from('registrations')
    .select('registered_at').gte('registered_at', sixMo.toISOString()).eq('status', 'confirmed');
  const monthly = {};
  monthlyRegs?.forEach(({ registered_at }) => { const k = registered_at.slice(0, 7); monthly[k] = (monthly[k] || 0) + 1; });
  return res.json({ byStatus, topEvents: topEventsList, monthlyRegistrations: monthly });
});

// ─── GET /api/admin/notifications ─────────────────────────────────────────
router.get('/notifications', async (req, res) => {
  const { data } = await supabase.from('notifications')
    .select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(20);
  return res.json({ notifications: data });
});

module.exports = router;
