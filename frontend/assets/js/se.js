/* StrathEvents v4 — Shared JS utilities */
const SE = {
  API: window.location.origin + '/api',
  token: () => localStorage.getItem('se_token'),
  user: () => { try{ return JSON.parse(localStorage.getItem('se_user')); }catch(e){return null;} },
  setAuth: (token, user) => { localStorage.setItem('se_token', token); localStorage.setItem('se_user', JSON.stringify(user)); },
  clearAuth: () => { localStorage.removeItem('se_token'); localStorage.removeItem('se_user'); },

  async fetch(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers||{}) };
    if (this.token()) headers['Authorization'] = 'Bearer ' + this.token();
    const res = await fetch(this.API + path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
    return data;
  },

  fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-KE', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
  },
  fmtTime(d) {
    if (!d) return '';
    return new Date(d).toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit', hour12:true });
  },
  fmtDateTime(d) { return this.fmtDate(d) + ' · ' + this.fmtTime(d); },
  fmtMoney(n) { return 'KES ' + (n||0).toLocaleString(); },
  isPast(d) { return d && new Date(d) < new Date(); },
  daysUntil(d) { return Math.ceil((new Date(d) - new Date()) / 86400000); },

  avatarColors: ['#2348FF','#C12C84','#FF4D2E','#0E7E8C','#6B40D6','#117A4E','#E0930A'],
  avatarColor(name) {
    let h = 0; for (let c of (name||'')) h = (h*31 + c.charCodeAt(0)) & 0xFFFFFF;
    return this.avatarColors[Math.abs(h) % this.avatarColors.length];
  },
  initials(name) {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0,2).join('');
  },

  CLUB_CATEGORIES: [
    'Arts, Literary & Creative Clubs',
    'Environmental and Sustainability Clubs',
    'Finance, Business and Entrepreneurial Clubs',
    'International Students',
    'IT, Innovation & Research',
    'Language Clubs',
    'Leadership and Public Speaking Clubs',
    'Mental Health and First Aid Clubs',
    'Tourism and Hospitality Clubs',
    'Sports',
    'Other'
  ],

  CAT_COLORS: {
    Music:'#FF4D2E', Tech:'#2348FF', Business:'#117A4E', Sports:'#E0930A',
    Arts:'#C12C84', Career:'#0E7E8C', Faith:'#6B40D6', Language:'#0891B2',
    Leadership:'#7C3AED', Environment:'#059669', Health:'#DC2626',
    International:'#B45309', Finance:'#1D4ED8', IT:'#7C3AED', Other:'#6c6759'
  },
  catColor(cat) {
    for (const [k, v] of Object.entries(this.CAT_COLORS)) {
      if (cat && cat.toLowerCase().includes(k.toLowerCase())) return v;
    }
    return '#6c6759';
  },

  STATUS_META: {
    pending:   { bg:'#FBEFD3', fg:'#9a6a0a', label:'Pending' },
    approved:  { bg:'#E7F6E9', fg:'#1B7A3D', label:'Approved' },
    rejected:  { bg:'#FBE3DD', fg:'#C0392B', label:'Rejected' },
    cancelled: { bg:'#F3F4F6', fg:'#6c6759', label:'Cancelled' },
    completed: { bg:'#E4ECFD', fg:'#2348FF', label:'Completed' },
    confirmed: { bg:'#E7F6E9', fg:'#1B7A3D', label:'Confirmed' },
    attended:  { bg:'#E4ECFD', fg:'#2348FF', label:'Attended' },
    expired:   { bg:'#F3F4F6', fg:'#6c6759', label:'Expired' }
  },
  statusMeta(s) { return this.STATUS_META[s] || { bg:'var(--fill)', fg:'var(--muted)', label: s }; },
  pill(status) {
    const m = this.statusMeta(status);
    return `<span class="pill" style="background:${m.bg};color:${m.fg};">${m.label}</span>`;
  },

  // Theme
  theme: localStorage.getItem('se_theme') || 'light',
  applyTheme(t) {
    this.theme = t || this.theme;
    document.documentElement.setAttribute('data-theme', this.theme);
    localStorage.setItem('se_theme', this.theme);
  },
  toggleTheme() {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = this.theme === 'dark' ? '☀' : '☾';
  },

  // Toast
  toast(msg, type='success') {
    const acc = type==='error'?'#FF4D2E':type==='info'?'#2348FF':'#0A7A3C';
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.borderLeft = '4px solid ' + acc;
    el.textContent = msg;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), 3400);
  },

  // Drawer (mobile nav)
  drawerOpen: false,
  openDrawer() {
    document.getElementById('mobDrawer')?.classList.add('open');
    document.getElementById('mobOverlay')?.classList.add('show');
    this.drawerOpen = true;
  },
  closeDrawer() {
    document.getElementById('mobDrawer')?.classList.remove('open');
    document.getElementById('mobOverlay')?.classList.remove('show');
    this.drawerOpen = false;
  },

  // Redirect if not logged in / wrong role
  requireAuth(role) {
    const u = this.user();
    if (!u || !this.token()) { window.location.href = '/login.html'; return false; }
    if (role && u.role !== role && !(role==='admin_or_club' && (u.role==='admin'||u.role==='club_admin'))) {
      window.location.href = '/login.html'; return false;
    }
    return true;
  },

  // Image helper — convert file to base64
  fileToBase64(file) {
    return new Promise((res,rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  },

  // Generate simple QR SVG (placeholder — real QR via API)
  buildQR(code) {
    return `<svg width="120" height="120" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="white"/><text x="60" y="55" text-anchor="middle" font-size="8" font-family="monospace" fill="#333">${code||''}</text><text x="60" y="70" text-anchor="middle" font-size="7" font-family="monospace" fill="#999">QR code</text></svg>`;
  }
};

// Apply theme on page load
document.addEventListener('DOMContentLoaded', () => {
  SE.applyTheme();
  const btn = document.getElementById('themeBtn');
  if (btn) { btn.textContent = SE.theme === 'dark' ? '☀' : '☾'; btn.onclick = () => SE.toggleTheme(); }
  const mobOv = document.getElementById('mobOverlay');
  if (mobOv) mobOv.addEventListener('click', () => SE.closeDrawer());
});
