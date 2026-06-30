const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const supabase = require('../supabaseClient');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const signToken = (userId, role) =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  const { data: user, error } = await supabase
    .from('users').select('*').eq('email', email.toLowerCase().trim()).single();

  if (error || !user)
    return res.status(401).json({ error: 'Invalid email or password.' });
  if (!user.is_active)
    return res.status(403).json({ error: 'Your account has been deactivated. Contact admin.' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

  const token = signToken(user.id, user.role);
  return res.json({
    token,
    user: {
      id: user.id, email: user.email, full_name: user.full_name,
      role: user.role, admission_number: user.admission_number,
      phone_number: user.phone_number, avatar_base64: user.avatar_base64 || null,
    },
  });
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, full_name, admission_number, phone_number, role = 'student' } = req.body;

  if (!email || !password || !full_name || !admission_number)
    return res.status(400).json({ error: 'Email, password, full name and admission number are required.' });

  // Feature #14: enforce @strathmore.edu domain
  if (!email.toLowerCase().trim().endsWith('@strathmore.edu'))
    return res.status(400).json({ error: 'Only @strathmore.edu email addresses are accepted.' });

  if (role !== 'student')
    return res.status(403).json({ error: 'Self-registration only allowed for students.' });

  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const { data: existing } = await supabase
    .from('users').select('id').eq('email', email.toLowerCase().trim()).maybeSingle();
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const password_hash = await bcrypt.hash(password, 10);

  const { data: newUser, error } = await supabase
    .from('users')
    .insert({
      email: email.toLowerCase().trim(), password_hash,
      full_name: full_name.trim(),
      admission_number: admission_number.trim(),
      phone_number: phone_number?.trim() || null,
      role,
    })
    .select('id, email, full_name, role, admission_number, phone_number')
    .single();

  if (error) return res.status(500).json({ error: 'Failed to create account. ' + error.message });

  const token = signToken(newUser.id, newUser.role);
  return res.status(201).json({ token, user: newUser, message: 'Account created! A confirmation email is on its way.' });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const { data: user } = await supabase
    .from('users')
    .select('id, email, full_name, role, admission_number, phone_number, avatar_base64, avatar_url, created_at')
    .eq('id', req.user.id).single();
  return res.json({ user });
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'Both current and new password are required.' });
  if (new_password.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });

  const { data: user } = await supabase.from('users').select('password_hash').eq('id', req.user.id).single();
  const match = await bcrypt.compare(current_password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

  const password_hash = await bcrypt.hash(new_password, 10);
  await supabase.from('users').update({ password_hash }).eq('id', req.user.id);
  return res.json({ message: 'Password changed successfully.' });
});

// PUT /api/auth/profile-picture — Feature #3: optional profile picture upload
router.put('/profile-picture', authenticate, async (req, res) => {
  const { avatar_base64 } = req.body;
  if (!avatar_base64) return res.status(400).json({ error: 'avatar_base64 is required.' });
  if (avatar_base64.length > 1500000)
    return res.status(400).json({ error: 'Image too large. Please use an image under 1MB.' });

  const { error } = await supabase.from('users').update({ avatar_base64 }).eq('id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ message: 'Profile picture updated.' });
});

module.exports = router;
