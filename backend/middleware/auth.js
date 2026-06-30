const jwt = require('jsonwebtoken');
const supabase = require('../supabaseClient');

// Verify JWT token and attach user to request
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Fetch fresh user data to ensure account still active
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, admission_number, is_active')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) return res.status(401).json({ error: 'User not found.' });
    if (!user.is_active) return res.status(403).json({ error: 'Account is deactivated.' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

// Role-based access control middleware factory
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: `Access denied. Requires role: ${roles.join(' or ')}.` });
  }
  next();
};

module.exports = { authenticate, requireRole };
