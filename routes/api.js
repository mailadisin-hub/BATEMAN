'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// All API routes require an authenticated session
router.use(requireAuth);

function batemanBase() {
  const url = process.env.BATEMAN_API_URL || '';
  return url.replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// GET /api/status — ping the Bateman tunnel
// ---------------------------------------------------------------------------
router.get('/status', async (req, res) => {
  const base = batemanBase();
  if (!base) {
    return res.json({ online: false, error: 'BATEMAN_API_URL is not configured.' });
  }

  try {
    const response = await axios.get(`${base}/api/status`, { timeout: 4000 });
    return res.json({ online: true, ...response.data });
  } catch (err) {
    return res.json({ online: false });
  }
});

// ---------------------------------------------------------------------------
// GET /api/brief — morning brief from Bateman
// ---------------------------------------------------------------------------
router.get('/brief', async (req, res) => {
  const base = batemanBase();
  if (!base) {
    return res.json({ online: false, brief: null });
  }

  try {
    const response = await axios.get(`${base}/api/brief`, { timeout: 6000 });
    return res.json({ online: true, brief: response.data.brief || response.data });
  } catch (err) {
    return res.json({ online: false, brief: null });
  }
});

// ---------------------------------------------------------------------------
// POST /api/chat — proxy chat to Bateman, streaming the response back (SSE)
// ---------------------------------------------------------------------------
router.post('/chat', async (req, res) => {
  const base = batemanBase();
  if (!base) {
    return res.status(503).json({ success: false, error: 'Bateman is offline — BATEMAN_API_URL is not configured.' });
  }

  try {
    const upstream = await axios.post(`${base}/api/chat`, req.body, {
      timeout: 120000,
      responseType: 'stream',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    upstream.data.pipe(res);

    upstream.data.on('error', (err) => {
      console.error('[Chat] Upstream stream error:', err.message);
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream interrupted.' })}\n\n`);
      res.end();
    });

    // Stop reading from the tunnel if the browser disconnects
    req.on('close', () => {
      if (upstream.data && typeof upstream.data.destroy === 'function') {
        upstream.data.destroy();
      }
    });
  } catch (err) {
    console.error('[Chat] Failed to reach Bateman:', err.message);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Bateman is offline — check the home server.' })}\n\n`);
      return res.end();
    }
    return res.status(502).json({ success: false, error: 'Bateman is offline — check the home server.' });
  }
});

// ---------------------------------------------------------------------------
// Local data endpoints
// ---------------------------------------------------------------------------
router.get('/pipeline', (req, res, next) => {
  try {
    const pipeline = db.prepare('SELECT * FROM pipeline ORDER BY updated_at DESC').all();
    return res.json({ success: true, pipeline });
  } catch (err) {
    next(err);
  }
});

router.get('/clients', (req, res, next) => {
  try {
    const clients = db.prepare('SELECT * FROM clients ORDER BY updated_at DESC').all();
    return res.json({ success: true, clients });
  } catch (err) {
    next(err);
  }
});

router.get('/activity', (req, res, next) => {
  try {
    const activity = db.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT 20').all();
    return res.json({ success: true, activity });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
