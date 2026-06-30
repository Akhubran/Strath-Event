require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const authRoutes          = require('./routes/auth');
const eventsRoutes        = require('./routes/events');
const registrationsRoutes = require('./routes/registrations');
const paymentsRoutes      = require('./routes/payments');
const adminRoutes         = require('./routes/admin');
const clubRoutes          = require('./routes/club');
const notificationsRoutes = require('./routes/notifications');
const membershipsRoutes   = require('./routes/memberships');
const feedbackRoutes      = require('./routes/feedback');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGINS || '').split(',')
    : (origin, callback) => {
        // Dev mode: allow localhost, 127.0.0.1, and any private LAN IP
        // (192.168.x.x, 10.x.x.x, 172.16-31.x.x) on any port, plus requests
        // with no Origin header (e.g. same-origin page loads, curl, Postman).
        if (!origin) return callback(null, true);
        const lanPattern = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
        if (lanPattern.test(origin) || origin === 'null') return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ─── Static frontend ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── API Routes ───────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/events',        eventsRoutes);
app.use('/api/registrations', registrationsRoutes);
app.use('/api/payments',      paymentsRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/club',          clubRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/memberships',   membershipsRoutes);
app.use('/api/feedback',      feedbackRoutes);

// ─── Health check ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '4.0.0' });
});

// ─── Frontend routing ─────────────────────────────────────────────────────
app.get('/admin*',   (_, res) => res.sendFile(path.join(__dirname, '../frontend/admin/index.html')));
app.get('/club*',    (_, res) => res.sendFile(path.join(__dirname, '../frontend/club/index.html')));
app.get('/student*', (_, res) => res.sendFile(path.join(__dirname, '../frontend/student/index.html')));
app.get('/login*',   (_, res) => res.sendFile(path.join(__dirname, '../frontend/login.html')));
app.get('/public*',  (_, res) => res.sendFile(path.join(__dirname, '../frontend/public/index.html')));
app.get('*',         (_, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

// ─── Error handler ────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   StrathEvents v4 Server Running     ║
  ║   http://localhost:${PORT}              ║
  ║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(12)}  ║
  ╚══════════════════════════════════════╝
  `);
});
