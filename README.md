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
│   ├── supabase_schema.sql        # Unified database schema (core + additions)
│   ├── package.json
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

## Start

### Run locally

```bash
cd backend
npm install
npm run dev
```

App URLs:
- `http://localhost:3000/`
- `http://localhost:3000/login.html`
- `http://localhost:3000/student/`
- `http://localhost:3000/admin/`
- `http://localhost:3000/club/`

### Deploy

1. Deploy the backend as a Node.js service (for example: Render, Railway, or Fly.io).
2. Add the required environment variables in your hosting provider.
3. Point `MPESA_CALLBACK_URL` to your deployed API endpoint:
      - `https://your-domain.com/api/payments/mpesa-callback`
4. Redeploy/restart the service and verify health:
      - `https://your-domain.com/api/health`

For local callback testing, tunnel your local server:

```bash
ngrok http 3000
```

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

## Student Registration Rules

- Email must end in `@strathmore.edu`
- Admission number is required at sign-up
- Password minimum 8 characters
- Students only — club admins and university admins must be created by an existing admin

---

*StrathEvents · Strathmore University · Nairobi, Kenya*
