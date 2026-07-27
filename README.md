# Trendzation — Bateman Command Centre

A Node.js + Express web application that serves two purposes:

1. **Public-facing website** — marketing landing page for Trendzation, a UK web design business, with a lead capture contact form.
2. **Private admin dashboard** — the Bateman Command Centre, a password-protected backend for managing leads, a sales pipeline, clients, and an AI chat interface powered by a home Alienware PC running Ollama/Qwen3 via Cloudflare Tunnel.

Hosted on Hostinger. SQLite for the database. No external database service required.

---

## Prerequisites

- Node.js 18+
- npm 9+
- A Unix/Linux server (Hostinger VPS or Business hosting) or a local machine for development
- Git

---

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/trendzation.git
cd trendzation
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create your `.env` file

```bash
cp .env.example .env
```

### 4. Fill in `.env` values

Open `.env` in your editor. You need to set four things:

**SESSION_SECRET** — a long random string used to sign session cookies. Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Paste the output as the value of `SESSION_SECRET`.

**ADMIN_PASSWORD_HASH** — bcrypt hash of your chosen admin password. Generate it (replace `yourpassword` with your actual password):

```bash
node -e "const b = require('bcryptjs'); b.hash('yourpassword', 12).then(h => console.log(h))"
```

Paste the output (the `$2b$12$...` string) as the value of `ADMIN_PASSWORD_HASH`.

**ADMIN_EMAIL** — the email address you will use to log in to the dashboard. Default in `.env.example` is `admin@trendzation.co.uk`. Change it to whatever you want.

**BATEMAN_API_URL** — the Cloudflare Tunnel URL that points to your Alienware. Leave this as the placeholder if you haven't set up the tunnel yet; the site will still run, the AI chat just won't connect. See [BATEMAN_TUNNEL.md](./BATEMAN_TUNNEL.md) for setup.

**DB_PATH / SESSION_DB_PATH** — leave these as the defaults (`./data/trendzation.db` and `./data/sessions.db`) for local development. The `data/` directory is created automatically on first run.

### 5. Start the server

For production-style run:

```bash
npm start
```

For development with auto-restart on file changes (uses nodemon):

```bash
npm run dev
```

### 6. Open in your browser

- Public landing page: [http://localhost:3000](http://localhost:3000)
- Admin login: [http://localhost:3000/login](http://localhost:3000/login)

---

## Environment Variables

All variables live in `.env` (never committed to git). `.env.example` is the template.

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Port the Express server listens on. Defaults to `3000`. |
| `NODE_ENV` | No | Set to `production` on the server, `development` locally. Affects error verbosity and session cookie security flags. |
| `SESSION_SECRET` | **Yes** | Long random string used to sign session cookies. Generate with `crypto.randomBytes(64)`. |
| `ADMIN_EMAIL` | **Yes** | Email address for the single admin account. |
| `ADMIN_PASSWORD_HASH` | **Yes** | bcrypt hash (cost factor 12) of the admin password. Generated with `bcryptjs`. |
| `BATEMAN_API_URL` | No | Full HTTPS URL of the Cloudflare Tunnel bridge (e.g. `https://your-name.trycloudflare.com`). If unset, AI chat will be unavailable but everything else works. |
| `DB_PATH` | No | Path to the SQLite database file. Defaults to `./data/trendzation.db`. |
| `SESSION_DB_PATH` | No | Path to the SQLite sessions database. Defaults to `./data/sessions.db`. |
| `FORWARD_CONTACTS_TO_BATEMAN` | No | Set to `true` to POST new contact form submissions to the Bateman bridge. Defaults to `false`. |

---

## Project Structure

```
trendzation/
├── server.js               # Entry point — Express app setup, middleware, route mounting
├── package.json
├── .env.example            # Template for environment variables
├── .gitignore
│
├── db/
│   ├── database.js         # Opens the SQLite connection, applies pragmas, runs schema init
│   └── schema.js           # CREATE TABLE statements + seeds default settings
│
├── routes/
│   ├── public.js           # GET / (landing page), POST /contact (lead capture)
│   ├── auth.js             # GET+POST /auth/login, POST /auth/logout
│   ├── dashboard.js        # All /dashboard/* pages (requires auth)
│   └── api.js              # JSON API endpoints for dashboard AJAX + Bateman chat
│
├── middleware/
│   └── auth.js             # requireAuth (blocks unauthenticated), requireGuest (blocks logged-in)
│
├── views/                  # EJS templates
│   ├── index.ejs           # Public landing page
│   ├── login.ejs           # Admin login form
│   ├── partials/           # Shared HTML fragments (head, footer, etc.)
│   └── dashboard/          # Dashboard page templates
│
├── public/                 # Static assets (served at /public/*)
│   ├── css/
│   └── js/
│
└── data/                   # SQLite database files — auto-created, gitignored
    ├── trendzation.db
    └── sessions.db
```

---

## Hostinger Deployment

These steps assume you have a **Hostinger VPS or Business hosting plan** with Node.js support. Shared hosting will not work — Node.js requires a plan that gives you SSH access and a persistent process.

### Step 1: Connect your GitHub repo via hPanel

1. Log in to [hPanel](https://hpanel.hostinger.com).
2. Go to **Websites** > **Manage** > **Git**.
3. Connect your GitHub account and select your repository.
4. Set the deployment directory to your website's root (e.g. `/home/user/public_html/trendzation` or wherever your hosting plan puts it).
5. Pull the repository. This clones your code to the server.

### Step 2: Install dependencies via SSH

SSH into your Hostinger server:

```bash
ssh your_username@your_server_ip
```

Navigate to the project directory and install production dependencies:

```bash
cd /home/user/public_html/trendzation   # adjust path as needed
npm install --production
```

`--production` skips `devDependencies` (nodemon, etc.) which you don't need on the server.

### Step 3: Configure Node.js in hPanel

1. In hPanel, go to **Advanced** > **Node.js**.
2. Set:
   - **Entry point**: `server.js`
   - **Node.js version**: `18` or higher
3. Click **Install Dependencies** (this runs `npm install` server-side if you prefer that route).
4. Do not start the app yet — set environment variables first.

### Step 4: Set environment variables in hPanel

Still in the **Node.js** section of hPanel, find the **Environment Variables** panel. Add each variable from your `.env` file one by one:

- `NODE_ENV` = `production`
- `SESSION_SECRET` = your generated secret
- `ADMIN_EMAIL` = your admin email
- `ADMIN_PASSWORD_HASH` = your bcrypt hash
- `BATEMAN_API_URL` = your Cloudflare Tunnel URL (once you have it)
- `DB_PATH` = `./data/trendzation.db`
- `SESSION_DB_PATH` = `./data/sessions.db`

Do **not** upload a `.env` file to the server — the hPanel environment variable manager is the right place for these on Hostinger.

### Step 5: Make the data directory writable

The app creates the `data/` directory automatically, but the process needs write permission:

```bash
mkdir -p /home/user/public_html/trendzation/data
chmod 775 /home/user/public_html/trendzation/data
```

If the app runs as a different system user than your SSH user, use `755` instead:

```bash
chmod 755 /home/user/public_html/trendzation/data
```

The SQLite files (`trendzation.db`, `sessions.db`) will be created here on first run.

### Step 6: Start the app

In hPanel **Node.js**, click **Start Application**. hPanel keeps it running and restarts it if the process crashes.

### Step 7: Point your domain

In hPanel, go to **Domains** and ensure your domain (e.g. `trendzation.co.uk`) points to your Node.js app. Hostinger handles the reverse proxy from port 80/443 to your Node process automatically.

### Step 8: Redeploy after code changes

When you push new code to GitHub:

1. In hPanel > **Git**, pull the latest changes.
2. SSH in and run `npm install --production` again (only needed if `package.json` changed).
3. In hPanel > **Node.js**, click **Restart Application**.

---

## Database

SQLite is used via the `better-sqlite3` driver. The database file lives at `data/trendzation.db` (configurable with `DB_PATH`).

The schema is created automatically on first run — no migration step needed. Tables:

| Table | Purpose |
|---|---|
| `leads` | Contact form submissions from the public website |
| `pipeline` | Sales pipeline deals, with status flow: `FIND → SCORE → BUILD → PITCH → FOLLOW_UP → CLOSED_WON / CLOSED_LOST` |
| `clients` | Active, paused, and churned clients with MRR tracking |
| `activity` | Append-only log of all significant events (new leads, status changes, etc.) |
| `settings` | Key/value store for app config (pricing tiers, brand name, Bateman model name) |
| `dne_list` | Do-not-email list — emails/domains to suppress from outreach |
| `market_data` | Prospecting data collected from external sources |

The `data/` directory and all `*.db` files are gitignored. **Never commit your database files.**

To inspect the database locally:

```bash
# Using the sqlite3 CLI
sqlite3 data/trendzation.db
.tables
SELECT * FROM leads LIMIT 10;
.quit
```

---

## Security Notes

- **Never commit `.env`** — it's in `.gitignore`. The admin password hash and session secret must stay off git.
- **Rotate `SESSION_SECRET` periodically** — regenerate it and restart the app. All existing sessions will be invalidated (users will need to log in again).
- **Admin password hash** is stored as an environment variable, not in the database. To change the password, generate a new hash and update the env var, then restart the app.
- All `/dashboard/*` and `/api/*` routes are protected by `requireAuth` middleware. Unauthenticated requests are redirected to `/login`.
- Login is rate-limited to 5 attempts per IP per 15 minutes to slow brute force.
- The auth system uses `bcrypt.compare` even on wrong email addresses to prevent timing-based username enumeration.
- Session fixation is prevented by calling `req.session.regenerate()` on successful login.
- Helmet is used for HTTP security headers.

---

## Connecting Bateman AI

The AI chat in the dashboard connects to Ollama/Qwen3 running on your home Alienware via a Cloudflare Tunnel. See [BATEMAN_TUNNEL.md](./BATEMAN_TUNNEL.md) for the full setup guide.

Once the tunnel is running, set `BATEMAN_API_URL` in your environment variables and restart the app. The dashboard AI chat will connect automatically.
