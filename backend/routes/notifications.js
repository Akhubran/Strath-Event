const express  = require('express');
const supabase = require('../supabaseClient');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/notifications  (also aliased as /my in frontend)
router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('notifications')
    .select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(30);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ notifications: data, unreadCount: data.filter(n => !n.is_read).length });
});

// GET /api/notifications/my — alias for frontend compatibility
router.get('/my', async (req, res) => {
  const { data, error } = await supabase.from('notifications')
    .select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(30);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ notifications: data, unreadCount: data.filter(n => !n.is_read).length });
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res) => {
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', req.user.id).eq('is_read', false);
  return res.json({ message: 'All notifications marked as read.' });
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
  await supabase.from('notifications').update({ is_read: true }).eq('id', req.params.id).eq('user_id', req.user.id);
  return res.json({ message: 'Notification marked as read.' });
});

module.exports = router;
