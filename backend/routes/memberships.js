const express  = require('express');
const supabase = require('../supabaseClient');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/memberships/public-clubs — public list for landing page ────
// No auth required — used by the public landing page to show active clubs
router.get('/public-clubs', async (req, res) => {
  const { data: clubs, error } = await supabase
    .from('clubs')
    .select('id, name, description, logo_url, logo_base64, type, category, is_active')
    .eq('is_active', true)
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ clubs: clubs || [] });
});

// ─── GET /api/memberships/clubs — clubs with user's membership status ─────
// Feature #12: returns type + category for filtering
router.get('/clubs', authenticate, async (req, res) => {
  const { data: clubs, error } = await supabase
    .from('clubs')
    .select('id, name, description, logo_url, logo_base64, type, category, is_active')
    .eq('is_active', true)
    .order('name');
  if (error) return res.status(500).json({ error: error.message });

  const { data: memberships } = await supabase
    .from('club_memberships').select('club_id, status').eq('user_id', req.user.id);
  const membershipMap = {};
  memberships?.forEach(m => { membershipMap[m.club_id] = m.status; });

  return res.json({
    clubs: clubs.map(c => ({ ...c, membership_status: membershipMap[c.id] || null })),
  });
});

// ─── POST /api/memberships/join ────────────────────────────────────────────
router.post('/join', authenticate, requireRole('student'), async (req, res) => {
  const { club_id } = req.body;
  if (!club_id) return res.status(400).json({ error: 'club_id is required.' });

  const { data: club } = await supabase.from('clubs').select('id, name, admin_id').eq('id', club_id).single();
  if (!club) return res.status(404).json({ error: 'Club not found.' });

  const { data: existing } = await supabase.from('club_memberships')
    .select('id, status').eq('user_id', req.user.id).eq('club_id', club_id).maybeSingle();

  if (existing) {
    if (existing.status === 'approved') return res.status(400).json({ error: 'You are already a member.' });
    if (existing.status === 'pending')  return res.status(400).json({ error: 'Your request is already pending.' });
    await supabase.from('club_memberships')
      .update({ status: 'pending', requested_at: new Date().toISOString(), reviewed_at: null }).eq('id', existing.id);
  } else {
    await supabase.from('club_memberships').insert({ user_id: req.user.id, club_id });
  }

  if (club.admin_id) {
    const { data: student } = await supabase.from('users').select('full_name').eq('id', req.user.id).single();
    await supabase.from('notifications').insert({
      user_id: club.admin_id, type: 'info',
      title: 'New Membership Request 🙋',
      message: `${student?.full_name || 'A student'} has requested to join ${club.name}.`,
    });
  }
  return res.json({ message: `Membership request sent to ${club.name}!` });
});

// ─── GET /api/memberships/my ───────────────────────────────────────────────
router.get('/my', authenticate, async (req, res) => {
  const { data, error } = await supabase.from('club_memberships')
    .select('*, clubs(id, name, description, type, category)').eq('user_id', req.user.id)
    .order('requested_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ memberships: data });
});

// ─── GET /api/memberships/club — club admin: see their club's requests ────
router.get('/club', authenticate, requireRole('club_admin'), async (req, res) => {
  const { data: club } = await supabase.from('clubs').select('id').eq('admin_id', req.user.id).single();
  if (!club) return res.status(404).json({ error: 'No club assigned.' });
  const { data, error } = await supabase.from('club_memberships')
    .select('*, users!club_memberships_user_id_fkey(id, full_name, email, admission_number, phone_number)')
    .eq('club_id', club.id).order('requested_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const summary = {
    pending:  data.filter(m => m.status === 'pending').length,
    approved: data.filter(m => m.status === 'approved').length,
    rejected: data.filter(m => m.status === 'rejected').length,
  };
  return res.json({ memberships: data, summary });
});

// ─── PATCH /api/memberships/:id/review ────────────────────────────────────
router.patch('/:id/review', authenticate, requireRole('club_admin'), async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status))
    return res.status(400).json({ error: 'Status must be approved or rejected.' });

  const { data: club } = await supabase.from('clubs').select('id, name').eq('admin_id', req.user.id).single();
  if (!club) return res.status(404).json({ error: 'No club assigned.' });

  const { data: membership } = await supabase.from('club_memberships')
    .select('*, users!club_memberships_user_id_fkey(id, full_name)').eq('id', req.params.id).eq('club_id', club.id).single();
  if (!membership) return res.status(404).json({ error: 'Membership request not found.' });

  const { data: updated, error } = await supabase.from('club_memberships')
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: req.user.id })
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('notifications').insert({
    user_id: membership.user_id,
    title: status === 'approved' ? `Welcome to ${club.name}! 🎉` : 'Membership Update',
    message: status === 'approved'
      ? `Your request to join ${club.name} has been approved.`
      : `Your request to join ${club.name} was not approved at this time.`,
    type: status === 'approved' ? 'success' : 'info',
  });

  return res.json({ membership: updated, message: `Membership ${status}.` });
});

// ─── DELETE /api/memberships/:id — Feature #10: remove member from club ───
router.delete('/:id', authenticate, requireRole('club_admin', 'admin'), async (req, res) => {
  // Club admin can only remove from their own club
  if (req.user.role === 'club_admin') {
    const { data: club } = await supabase.from('clubs').select('id').eq('admin_id', req.user.id).single();
    if (!club) return res.status(403).json({ error: 'No club assigned.' });
    const { data: mem } = await supabase.from('club_memberships').select('club_id').eq('id', req.params.id).single();
    if (!mem || mem.club_id !== club.id) return res.status(403).json({ error: 'Not your club.' });
  }
  const { error } = await supabase.from('club_memberships').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ message: 'Member removed.' });
});

const isClubMember = async (userId, clubId) => {
  const { data } = await supabase.from('club_memberships')
    .select('status').eq('user_id', userId).eq('club_id', clubId).maybeSingle();
  return data?.status === 'approved';
};

module.exports = router;
module.exports.isClubMember = isClubMember;
