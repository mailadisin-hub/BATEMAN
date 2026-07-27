'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const SqliteStore = require('connect-sqlite3')(session);

// ---------------------------------------------------------------------------
// Ensure data/ directory exists before DB and session store initialise
// ---------------------------------------------------------------------------
const dataDir = path.resolve(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('[Server] Created data/ directory');
}

// ---------------------------------------------------------------------------
// Initialise database (creates tables, seeds defaults)
// ---------------------------------------------------------------------------
const db = require('./db/database');

// ---------------------------------------------------------------------------
// Route imports
// ---------------------------------------------------------------------------
const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Security — Helmet (CSP tuned to allow EJS-rendered inline scripts + CDNs)
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // needed for EJS-embedded scripts
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false, // avoid breaking third-party embeds
  })
);

// ---------------------------------------------------------------------------
// HTTP request logging
// ---------------------------------------------------------------------------
app.use(morgan(isProd ? 'combined' : 'dev'));

// ---------------------------------------------------------------------------
// Body parsers
// ---------------------------------------------------------------------------
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Session — SQLite-backed, 24-hour lifetime
// ---------------------------------------------------------------------------
const sessionDbPath = process.env.SESSION_DB_PATH
  ? path.resolve(process.env.SESSION_DB_PATH)
  : path.resolve(__dirname, 'data', 'sessions.db');

app.use(
  session({
    store: new SqliteStore({
      db: path.basename(sessionDbPath),
      dir: path.dirname(sessionDbPath),
      concurrentDB: true,
    }),
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    rolling: true, // reset maxAge on every response
    name: 'bateman.sid',
    cookie: {
      httpOnly: true,
      secure: isProd,       // HTTPS only in production
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// ---------------------------------------------------------------------------
// CSRF protection — token exposed to all views as csrfToken
// ---------------------------------------------------------------------------
const { csrfProtection } = require('./middleware/csrf');
app.use(csrfProtection);

// ---------------------------------------------------------------------------
// View engine
// ---------------------------------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------------------------------------------------------------------------
// Static assets
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '7d' : 0 }));

// ---------------------------------------------------------------------------
// Global rate limit — 100 requests per 15 minutes per IP
// ---------------------------------------------------------------------------
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/public'), // never throttle static
  message: { success: false, error: 'Too many requests. Please slow down.' },
});
app.use(globalLimiter);

// ---------------------------------------------------------------------------
// Tighter rate limit on login endpoint — 10 attempts per 15 min per IP
// (auth.js enforces its own 5-attempt limiter on POST; this is the route-level cap)
// ---------------------------------------------------------------------------
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Try again later.' },
});
app.use('/auth/login', authLimiter);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/', publicRoutes);
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/api', apiRoutes);

// Convenience alias: /login → /auth/login (handled in public.js redirect)
// Convenience alias: /logout → POST /auth/logout via form in views

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404);
  if (req.accepts('html') && !req.path.startsWith('/api')) {
    return res.send(
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>404 | Trendzation</title>' +
        '<style>body{background:#0a0e1a;color:#e6eaf2;font-family:Inter,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0}a{color:#6b8cce}</style>' +
        '</head><body><h1>404</h1><p>That page doesn\'t exist.</p><p><a href="/">Back to Trendzation</a></p></body></html>'
    );
  }
  return res.json({ success: false, error: 'Not found.' });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  console.error(`[Error] ${req.method} ${req.originalUrl} → ${status}:`, err.message);

  if (!isProd) {
    console.error(err.stack);
  }

  if (req.accepts('html') && !req.path.startsWith('/api')) {
    return res
      .status(status)
      .send(
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Error | Trendzation</title>' +
          '<style>body{background:#0a0e1a;color:#e6eaf2;font-family:Inter,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0}a{color:#6b8cce}</style>' +
          '</head><body><h1>Something went wrong</h1><p>Please try again in a moment.</p><p><a href="/">Back to Trendzation</a></p></body></html>'
      );
  }

  return res.status(status).json({
    success: false,
    error: status < 500 ? err.message : 'An unexpected error occurred.',
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const server = app.listen(PORT, () => {
  console.log(`[Server] Trendzation running on port ${PORT} (${isProd ? 'production' : 'development'})`);
  console.log(`[Server] Dashboard: http://localhost:${PORT}/dashboard`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received — shutting down gracefully');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    db.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received — shutting down gracefully');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    db.close();
    process.exit(0);
  });
});

module.exports = app; // export for testing
