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
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const Tokens = require('csrf');
const tokens = new Tokens();

// ---------------------------------------------------------------------------
// Data directory + JSON leads file (no native dependencies)
// ---------------------------------------------------------------------------
const dataDir = path.resolve(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const leadsFile = path.resolve(dataDir, 'leads.json');

function readLeads() {
  try { return JSON.parse(fs.readFileSync(leadsFile, 'utf8')); } catch (_) { return []; }
}

function appendLead(lead) {
  const leads = readLeads();
  leads.push({ ...lead, created_at: new Date().toISOString() });
  fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  name: 'tz.sid',
  cookie: { httpOnly: true, secure: isProd, sameSite: 'strict', maxAge: 4 * 60 * 60 * 1000 },
}));

// CSRF
app.use((req, res, next) => {
  if (!req.session.csrfSecret) req.session.csrfSecret = tokens.secretSync();
  res.locals.csrfToken = tokens.create(req.session.csrfSecret);
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const t = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  if (!t || !tokens.verify(req.session.csrfSecret, t)) {
    return res.status(403).json({ success: false, error: 'Invalid CSRF token.' });
  }
  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '7d' : 0 }));

// Rate limit contact form — 10 per hour
const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.render('index', { title: 'Web Design Swindon' });
});

app.post('/contact', contactLimiter, async (req, res) => {
  try {
    const { name, business_name, email, message } = req.body;
    if (!name || !business_name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, errors: ['Please fill in all required fields with a valid email.'] });
    }
    const lead = {
      id: uuidv4(),
      name: name.trim().substring(0, 200),
      business_name: business_name.trim().substring(0, 200),
      email: email.trim().toLowerCase().substring(0, 320),
      notes: (message || '').trim().substring(0, 2000),
      source: 'website',
      status: 'NEW',
    };
    appendLead(lead);

    if (process.env.FORWARD_CONTACTS_TO_BATEMAN === 'true' && process.env.BATEMAN_API_URL) {
      try { await axios.post(process.env.BATEMAN_API_URL.replace(/\/$/, '') + '/api/lead', lead, { timeout: 5000 }); } catch (_) {}
    }

    return res.status(201).json({ success: true, message: "Thanks! We'll be in touch within 1 business day." });
  } catch (err) {
    console.error('[Contact]', err.message);
    return res.status(500).json({ success: false, errors: ['Something went wrong. Please try again.'] });
  }
});

// 404
app.use((req, res) => {
  res.status(404).send('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>404 | Trendzation</title><style>body{background:#0a0e1a;color:#e6eaf2;font-family:Inter,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0}a{color:#6b8cce}</style></head><body><h1>404</h1><p>That page doesn\'t exist.</p><a href="/">Back to Trendzation</a></body></html>');
});

// Error handler
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ success: false, error: 'An error occurred.' });
});

app.listen(PORT, () => console.log(`[Trendzation] Running on port ${PORT}`));
