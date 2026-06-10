'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { requireGuest } = require('../middleware/auth');

// ---------------------------------------------------------------------------
// Rate limiter — 5 login attempts per 15 minutes per IP
// ---------------------------------------------------------------------------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).render('login', {
      pageTitle: 'Login — Bateman Command Centre',
      error: 'Too many login attempts. Please wait 15 minutes before trying again.',
    });
  },
});

// ---------------------------------------------------------------------------
// GET /auth/login
// ---------------------------------------------------------------------------
router.get('/login', requireGuest, (req, res) => {
  res.render('login', {
    pageTitle: 'Login — Bateman Command Centre',
    error: null,
  });
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------
router.post('/login', requireGuest, loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Basic presence validation
    if (!email || !password) {
      return res.status(400).render('login', {
        pageTitle: 'Login — Bateman Command Centre',
        error: 'Incorrect email or password.',
      });
    }

    const adminEmail = process.env.ADMIN_EMAIL || '';
    const adminHash = process.env.ADMIN_PASSWORD_HASH || '';

    // Constant-time email comparison to avoid timing attacks
    const emailMatches =
      email.trim().toLowerCase() === adminEmail.trim().toLowerCase();

    // Always run bcrypt.compare even if email doesn't match (prevents timing oracle)
    // Use a dummy hash when email is wrong so timing stays consistent
    const hashToCompare = emailMatches
      ? adminHash
      : '$2b$12$invalidhashusedfortimingprotectiononly000000000000000000';

    let passwordMatches = false;
    try {
      passwordMatches = await bcrypt.compare(password, hashToCompare);
    } catch (_) {
      // Malformed hash in env — treat as mismatch
      passwordMatches = false;
    }

    if (!emailMatches || !passwordMatches) {
      return res.status(401).render('login', {
        pageTitle: 'Login — Bateman Command Centre',
        error: 'Incorrect email or password.',
      });
    }

    // Regenerate session to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error('[Auth] Session regeneration error:', err.message);
        return res.status(500).render('login', {
          pageTitle: 'Login — Bateman Command Centre',
          error: 'An error occurred. Please try again.',
        });
      }

      req.session.userId = 'admin';
      req.session.userEmail = adminEmail.trim().toLowerCase();
      req.session.loginAt = new Date().toISOString();

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[Auth] Session save error:', saveErr.message);
          return res.status(500).render('login', {
            pageTitle: 'Login — Bateman Command Centre',
            error: 'An error occurred. Please try again.',
          });
        }

        // Honour returnTo but only allow relative paths (security)
        const returnTo = req.session.returnTo || '/dashboard';
        delete req.session.returnTo;
        const safeReturn = returnTo.startsWith('/') ? returnTo : '/dashboard';
        return res.redirect(safeReturn);
      });
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    return res.status(500).render('login', {
      pageTitle: 'Login — Bateman Command Centre',
      error: 'An unexpected error occurred. Please try again.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[Auth] Session destroy error:', err.message);
    }
    res.clearCookie('connect.sid');
    return res.redirect('/');
  });
});

module.exports = router;
