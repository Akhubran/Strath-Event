const express = require('express');
const supabase = require('../supabaseClient');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─── POST /api/feedback — student submits feedback for a past event ────────
router.post('/', authenticate, requireRole('student'), async (req, res) => {
  const { event_id, rating, comment } = req.body;

  if (!event_id || !rating) return res.status(400).json({ error: 'event_id and rating are required.' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5.' });

  // Verify student attended / was confirmed for this event
  const { data: reg } = await supabase
    .from('registrations')
    .select('id, status')
    .eq('event_id', event_id)
    .eq('user_id', req.user.id)
    .in('status', ['confirmed', 'attended'])
    .maybeSingle();

  if (!reg) return res.status(403).json({ error: 'You can only review events you registered for.' });

  // Check event is in the past
  const { data: event } = await supabase.from('events').select('id, title, event_date').eq('id', event_id).single();
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (new Date(event.event_date) > new Date()) return res.status(400).json({ error: 'You can only review past events.' });

  const { data, error } = await supabase
    .from('event_feedback')
    .upsert({ event_id, user_id: req.user.id, rating: Number(rating), comment: comment || null },
             { onConflict: 'event_id,user_id' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ feedback: data, message: 'Thank you for your feedback!' });
});

// ─── GET /api/feedback/event/:eventId — get feedback for an event ──────────
router.get('/event/:eventId', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('event_feedback')
    .select('*, users(full_name, admission_number)')
    .eq('event_id', req.params.eventId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const avgRating = data.length
    ? (data.reduce((s, f) => s + f.rating, 0) / data.length).toFixed(1)
    : null;

  return res.json({ feedback: data, avgRating, total: data.length });
});

// ─── GET /api/feedback/my — student's own feedback history ────────────────
router.get('/my', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('event_feedback')
    .select('*, events(id, title, event_date, clubs(name))')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ feedback: data });
});

// ─── GET /api/feedback/my-event/:eventId — check if student already reviewed
router.get('/my-event/:eventId', authenticate, async (req, res) => {
  const { data } = await supabase
    .from('event_feedback')
    .select('*')
    .eq('event_id', req.params.eventId)
    .eq('user_id', req.user.id)
    .maybeSingle();
  return res.json({ feedback: data });
});

module.exports = router;
