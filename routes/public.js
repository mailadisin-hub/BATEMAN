'use strict';

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const db = require('../db/database');

// ---------------------------------------------------------------------------
// GET / — Marketing homepage
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  res.render('index', {
    title: 'Autonomous Web Design — We Work While You Sleep',
  });
});

// ---------------------------------------------------------------------------
// GET /login — Redirect helper so /login is reachable without the /auth prefix
// (The real handler lives in routes/auth.js mounted at /auth, but this alias
//  keeps URLs clean for users who navigate to /login directly.)
// ---------------------------------------------------------------------------
router.get('/login', (req, res) => {
  res.redirect('/auth/login');
});

// ---------------------------------------------------------------------------
// POST /contact — Public contact / lead capture form
// ---------------------------------------------------------------------------
router.post('/contact', async (req, res) => {
  try {
    const { name, business_name, email, phone, website, message } = req.body;

    // --- Validation ---
    const errors = [];
    if (!name || name.trim().length < 2) {
      errors.push('Please provide your full name.');
    }
    if (!business_name || business_name.trim().length < 1) {
      errors.push('Please provide your business name.');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.push('Please provide a valid email address.');
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // --- Sanitise (trim strings, normalise email) ---
    const sanitised = {
      id: uuidv4(),
      name: name.trim().substring(0, 200),
      business_name: business_name.trim().substring(0, 200),
      email: email.trim().toLowerCase().substring(0, 320),
      phone: (phone || '').trim().substring(0, 50),
      website: (website || '').trim().substring(0, 500),
      notes: (message || '').trim().substring(0, 2000),
      source: 'website',
      status: 'NEW',
    };

    // --- Persist to leads table ---
    const insert = db.prepare(`
      INSERT INTO leads (id, name, business_name, email, phone, website, source, status, notes)
      VALUES (@id, @name, @business_name, @email, @phone, @website, @source, @status, @notes)
    `);
    insert.run(sanitised);

    // --- Log activity ---
    const logActivity = db.prepare(`
      INSERT INTO activity (id, type, title, description, entity_type, entity_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    logActivity.run(
      uuidv4(),
      'LEAD',
      `New lead: ${sanitised.business_name}`,
      `${sanitised.name} (${sanitised.email}) submitted the contact form`,
      'lead',
      sanitised.id
    );

    // --- Optionally forward lead to Bateman AI ---
    const forwardToBateman =
      process.env.FORWARD_CONTACTS_TO_BATEMAN === 'true' &&
      process.env.BATEMAN_API_URL;

    if (forwardToBateman) {
      try {
        await axios.post(
          `${process.env.BATEMAN_API_URL.replace(/\/$/, '')}/api/lead`,
          sanitised,
          { timeout: 5000 }
        );
      } catch (forwardErr) {
        // Non-fatal — log but don't block the response
        console.error('[Contact] Failed to forward lead to Bateman:', forwardErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: "Thanks! We'll be in touch within 1 business day.",
    });
  } catch (err) {
    console.error('[Contact] Error processing contact form:', err.message);
    return res.status(500).json({
      success: false,
      errors: ['Something went wrong. Please try again or email us directly.'],
    });
  }
});

module.exports = router;
