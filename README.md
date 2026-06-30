# StrathEvents

A university event management and ticketing platform built for Strathmore University. Students discover events, pay with M-Pesa, and receive QR-coded tickets. Club admins manage their events and scan attendees in. University admins oversee everything — users, clubs, approvals, and analytics.

---

## Features

| Area | What it does |
|---|---|
| **Discover** | Browse upcoming events filtered by category, club, or keyword |
| **Register & Pay** | One-tap registration; M-Pesa STK Push for paid events |
| **QR Tickets** | Auto-generated on payment; scanned at the door |
| **Club Management** | Clubs and sports with logos, categories, member rosters |
| **Attendance Tracking** | Camera-based QR scanner + manual mark-attended |
| **Analytics** | Monthly registrations chart, top events, revenue, user breakdown |
| **Payments** | Full payment history per event for club and university admin |
| **Notifications** | In-app alerts for registrations, approvals, membership |
| **Three Portals** | Separate UIs for Student, Club Admin, University Admin |
| **Mobile-ready** | Responsive design, works on any screen size |
| **Dark mode** | Theme toggle on every page |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 · CSS3 · Vanilla JS (no framework) |
| Backend | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| Auth | JWT + bcryptjs |
| Payments | M-Pesa Daraja API (STK Push) |
| QR Codes | `qrcode` npm package |

---

## Project Structure

```
strathevents_merged/
├── backend/
│   ├── server.js                  # Express entry point, static serving, routing
│   ├── supabaseClient.js          # Supabase service-role client
│   ├── supabase_schema.sql        # Core database schema — run this first
│   ├── schema_additions.sql       # Additional tables (tickets, memberships, feedback)
│   ├── schema_additions_v4.sql    # v4 additions (avatar, club type, FK fixes) — run after
│   ├── package.json
│   ├── .env.example               # Template — copy to .env
│   ├── middleware/
│   │   └── auth.js                # JWT verify + role enforcement
│   └── routes/
│       ├── auth.js                # Login, register, /me, change-password, profile-picture
│       ├── events.js              # CRUD, status approval, upcoming filter, deadlines
│       ├── registrations.js       # Register, QR ticket generation, verify, attendance
│       ├── payments.js            # M-Pesa STK Push, callback webhook, history
│       ├── admin.js               # Users, clubs, analytics, dashboard stats
│       ├── club.js                # Club dashboard, events, attendees
│       ├── memberships.js         # Join clubs, approve/reject, remove members
│       ├── feedback.js            # Post and view event reviews
│       └── notifications.js       # In-app notifications
└── frontend/
    ├── index.html                  # Root landing page (same as public/)
    ├── login.html                  # Login + sign-up (two-column split)
    ├── public/
    │   └── index.html             # Public landing page
    ├── student/
    │   └── index.html             # Student portal (Discover, Tickets, History, Clubs)
    ├── admin/
    │   └── index.html             # University admin portal
    ├── club/
    │   └── index.html             # Club admin portal
    └── assets/
        ├── css/se.css             # Shared design system (warm-toned, dark mode)
        └── js/se.js               # Shared utilities (SE object: fetch, auth, formatters)
```

---

## Setup

### 1. Clone / unzip the project

```bash
# If you have the zip file:
unzip strathevents_v4.zip
cd strathevents_merged
```

### 2. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Choose a name, set a strong database password, pick a region close to Nairobi
3. Wait for the project to finish provisioning (about 1 minute)
4. Go to **Settings → API** and note:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **service_role** key (under "Project API keys" — use this one, NOT the anon key)

### 3. Run the database schema

In your Supabase project, go to **SQL Editor** and run these files **in order**:

1. `backend/supabase_schema.sql` — core tables (users, clubs, events, registrations, tickets, payments, notifications, feedback)
2. `backend/schema_additions.sql` — additional tables (club_memberships, event_feedback indexes)
3. `backend/schema_additions_v4.sql` — v4 columns (avatar_base64, club type/category, registration_deadline) and FK fixes

> **Important:** `schema_additions_v4.sql` also contains an `ALTER TABLE payments` fix that allows admin user deletion. Make sure to run it.

### 4. Configure environment variables

```bash
cd backend
cp .env.example .env
```

Open `.env` and fill in all values:

```env
# ── Supabase ──────────────────────────────────────────────
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# ── JWT ───────────────────────────────────────────────────
# Any long random string — generate one at https://generate-secret.vercel.app/64
JWT_SECRET=your-very-long-random-secret-key-minimum-32-characters

# ── M-Pesa Daraja API ─────────────────────────────────────
MPESA_CONSUMER_KEY=your-daraja-consumer-key
MPESA_CONSUMER_SECRET=your-daraja-consumer-secret
MPESA_SHORTCODE=174379
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
MPESA_CALLBACK_URL=https://your-domain.com/api/payments/mpesa-callback

# ── Server ────────────────────────────────────────────────
PORT=3000
NODE_ENV=development
```

### 5. Install dependencies and start

```bash
cd backend
npm install
npm run dev     # Development — auto-restarts on file changes
```

The server starts at **http://localhost:3000**

To stop it: `Ctrl + C`

---

## Accessing the app on your phone

Since the server runs on your computer, other devices on the same Wi-Fi can access it using your computer's local IP address instead of `localhost`.

**Find your IP address:**
- **Windows:** Settings → Network & Internet → Wi-Fi → Properties → IPv4 address
- **Mac:** System Settings → Wi-Fi → Details → IP Address

Then on your phone open:
```
http://192.168.x.x:3000
```
(Replace with your actual IP address)

> **Note:** Both your computer and phone must be on the same Wi-Fi network.

---

## M-Pesa Setup (Daraja API)

1. Register at [developer.safaricom.co.ke](https://developer.safaricom.co.ke)
2. Create a new app → copy the **Consumer Key** and **Consumer Secret**
3. The sandbox shortcode is `174379` and the sandbox passkey is the long string already in `.env.example`
4. For the **callback URL** (required for payment confirmations), Safaricom needs a public HTTPS URL. During development, use [ngrok](https://ngrok.com):

```bash
# Install ngrok, then run:
ngrok http 3000

# You'll get a URL like: https://abc123.ngrok-free.app
# Set this in your .env:
MPESA_CALLBACK_URL=https://abc123.ngrok-free.app/api/payments/mpesa-callback
```

> Without a valid callback URL, payments will initiate but won't automatically confirm. In sandbox testing you can manually trigger the callback from the Daraja portal.

---

## Pages & Portals

| URL | Description |
|---|---|
| `/` | Public landing page |
| `/login.html` | Login and sign-up |
| `/student/` | Student portal |
| `/admin/` | University admin portal |
| `/club/` | Club admin portal |
| `/api/health` | Server health check |

---

## User Roles

| Role | How to create | What they can do |
|---|---|---|
| `student` | Self-register on the login page (`@strathmore.edu` email required) | Discover events, register, pay, view tickets, join clubs, leave reviews |
| `club_admin` | Created by a university admin under Users | Create and manage events for their club, verify tickets, view attendance and payments, approve membership requests |
| `admin` | Seeded in the database or created by another admin | Everything — approve events, manage all users and clubs, view analytics, create events for any club |

---

## Creating Your First Admin

After running the schema, no admin account exists by default. You have two options:

**Option A — Create one directly in Supabase:**
1. Go to Supabase → **Table Editor → users**
2. Insert a row with `role = admin`, a valid email, and a bcrypt-hashed password
3. Generate a bcrypt hash at [bcrypt-generator.com](https://bcrypt-generator.com) (use 10 rounds)

**Option B — Temporarily allow admin self-registration:**
In `backend/routes/auth.js`, change the role check on the `/register` route to allow `admin`, register your account, then revert the change.

---

## How a Paid Event Works (End to End)

```
Student registers → pending registration created
      ↓
Student clicks "Pay" → enters phone number
      ↓
Server calls M-Pesa STK Push API
      ↓
M-Pesa prompt appears on student's phone
      ↓
Student enters M-Pesa PIN
      ↓
Safaricom calls /api/payments/mpesa-callback
      ↓
Server confirms payment → registration → "confirmed"
      ↓
QR ticket auto-generated → notification sent
      ↓
Student shows QR at event → club admin scans → "attended"
```

---

## API Reference

### Auth `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/login` | — | Login with email + password |
| POST | `/register` | — | Student self-registration |
| GET | `/me` | ✓ | Current user profile |
| PUT | `/change-password` | ✓ | Update password |
| PUT | `/profile-picture` | ✓ | Upload avatar (base64) |

### Events `/api/events`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | — | List approved upcoming events |
| GET | `/:id` | — | Single event detail |
| POST | `/` | club_admin / admin | Create event (banner required) |
| PUT | `/:id` | club_admin / admin | Update event |
| PATCH | `/:id/status` | admin | Approve / reject / cancel |
| DELETE | `/:id` | admin | Delete event |

### Registrations `/api/registrations`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | student | Register for an event |
| GET | `/my` | student | My registrations + tickets |
| GET | `/event/:id` | club_admin / admin | Attendee list for an event |
| POST | `/verify-ticket` | club_admin / admin | Scan and verify a QR ticket |
| PATCH | `/:id/attend` | club_admin / admin | Manually mark as attended |

### Payments `/api/payments`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/stk-push` | student | Initiate M-Pesa STK Push |
| POST | `/mpesa-callback` | — (Safaricom) | Payment confirmation webhook |
| GET | `/my` | student | My payment history |
| GET | `/event/:id` | club_admin / admin | Event payment summary + records |

### Admin `/api/admin`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/dashboard` | admin | Summary stats including revenue |
| GET | `/analytics` | admin | Monthly registrations, top events |
| GET / POST | `/users` | admin | List / create users |
| PUT | `/users/:id` | admin | Edit user |
| DELETE | `/users/:id` | admin | Delete user (requires password confirm) |
| PATCH | `/users/:id/toggle` | admin | Activate / deactivate user |
| GET / POST / PUT | `/clubs` | admin | Manage clubs and sports |
| DELETE | `/clubs/:id` | admin | Delete club (requires password confirm) |
| GET | `/clubs/:id/members` | admin | View club members |
| GET | `/events` | admin | All events (all statuses) |

### Memberships `/api/memberships`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/public-clubs` | — | Public club list for landing page |
| GET | `/clubs` | student | Clubs with membership status |
| POST | `/join` | student | Request to join a club |
| GET | `/my` | student | My membership requests |
| GET | `/club` | club_admin | Requests for my club |
| PATCH | `/:id/review` | club_admin | Approve or reject a request |
| DELETE | `/:id` | club_admin / admin | Remove a member |

### Notifications `/api/notifications`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` or `/my` | ✓ | Get notifications |
| PATCH | `/read-all` | ✓ | Mark all as read |
| PATCH | `/:id/read` | ✓ | Mark one as read |

### Feedback `/api/feedback`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | student | Submit event review + rating |
| GET | `/event/:id` | — | Reviews for an event |
| GET | `/my` | student | My submitted reviews |

---

## Troubleshooting

**Server won't start — "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY"**
You haven't created your `.env` file yet. Copy `.env.example` to `.env` and fill in your Supabase credentials.

**"Failed to fetch" on the login page from a phone**
Your phone is trying to call `localhost` which means the phone itself, not your computer. Make sure you're visiting `http://YOUR-COMPUTER-IP:3000` not `localhost:3000`.

**Login says "Invalid email or password" but the credentials are right**
The user may not exist in the database yet. Check the Supabase Table Editor → users table to confirm the account is there.

**M-Pesa STK Push sends but payment never confirms**
The `MPESA_CALLBACK_URL` in your `.env` must be a publicly reachable HTTPS URL. `localhost` URLs don't work because Safaricom's servers can't reach your local machine. Use ngrok.

**Deleting a user fails with a foreign key error**
Run the migration at the bottom of `schema_additions_v4.sql` in your Supabase SQL editor to fix the `payments.user_id` FK constraint.

**Club admin portal shows wrong events or empty dashboard**
The club admin account must be assigned to a club. Go to the university admin portal → Clubs → Edit the relevant club → select the admin from the dropdown.

---

## Environment Variable Reference

| Variable | Where to get it | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL | ✅ |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → service_role key | ✅ |
| `JWT_SECRET` | Generate any random 32+ character string | ✅ |
| `MPESA_CONSUMER_KEY` | Safaricom Daraja portal → your app | ✅ for payments |
| `MPESA_CONSUMER_SECRET` | Safaricom Daraja portal → your app | ✅ for payments |
| `MPESA_SHORTCODE` | `174379` (sandbox) or your business shortcode | ✅ for payments |
| `MPESA_PASSKEY` | Safaricom Daraja portal (sandbox passkey in `.env.example`) | ✅ for payments |
| `MPESA_CALLBACK_URL` | Your public HTTPS URL + `/api/payments/mpesa-callback` | ✅ for payments |
| `PORT` | Any available port — defaults to `3000` | Optional |
| `NODE_ENV` | `development` or `production` | Optional |

---

## Student Registration Rules

- Email must end in `@strathmore.edu`
- Admission number is required at sign-up
- Password minimum 8 characters
- Students only — club admins and university admins must be created by an existing admin

---

*StrathEvents · Strathmore University · Nairobi, Kenya*
