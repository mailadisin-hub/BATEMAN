'use strict';

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// Every dashboard route requires an authenticated session
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function logActivity(type, title, description, entityType, entityId) {
  try {
    db.prepare(
      `INSERT INTO activity (id, type, title, description, entity_type, entity_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), type, title, description, entityType || null, entityId || null);
  } catch (err) {
    console.error('[Activity] Failed to log:', err.message);
  }
}

function getSettingsMap() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

const PIPELINE_STATUSES = ['FIND', 'SCORE', 'BUILD', 'PITCH', 'FOLLOW_UP', 'CLOSED_WON', 'CLOSED_LOST'];
const CLIENT_STATUSES = ['ACTIVE', 'PAUSED', 'CHURNED'];

// ---------------------------------------------------------------------------
// GET /dashboard → overview
// ---------------------------------------------------------------------------
router.get('/', (req, res) => res.redirect('/dashboard/overview'));

// ---------------------------------------------------------------------------
// GET /dashboard/overview
// ---------------------------------------------------------------------------
router.get('/overview', (req, res, next) => {
  try {
    const pipelineValue = db
      .prepare(`SELECT COALESCE(SUM(value), 0) AS total FROM pipeline WHERE status NOT IN ('CLOSED_LOST')`)
      .get().total;

    const pipelineCount = db
      .prepare(`SELECT COUNT(*) AS n FROM pipeline WHERE status NOT IN ('CLOSED_WON','CLOSED_LOST')`)
      .get().n;

    const clientStats = db
      .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(mrr), 0) AS mrr FROM clients WHERE status = 'ACTIVE'`)
      .get();

    const revenue = db
      .prepare(`SELECT COALESCE(SUM(value), 0) AS total FROM pipeline WHERE status = 'CLOSED_WON'`)
      .get().total;

    const leadsThisMonth = db
      .prepare(`SELECT COUNT(*) AS n FROM leads WHERE created_at >= date('now', 'start of month')`)
      .get().n;

    const outreachSent = db
      .prepare(`SELECT COUNT(*) AS n FROM activity WHERE type = 'OUTREACH'`)
      .get().n;

    const recentActivity = db
      .prepare(`SELECT * FROM activity ORDER BY created_at DESC LIMIT 10`)
      .all();

    res.render('dashboard/overview', {
      title: 'Overview',
      currentPage: 'overview',
      metrics: {
        pipelineValue,
        pipelineCount,
        activeClients: clientStats.n,
        mrr: clientStats.mrr,
        revenue,
        leadsThisMonth,
        outreachSent,
      },
      recentActivity,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /dashboard/chat
// ---------------------------------------------------------------------------
router.get('/chat', (req, res) => {
  res.render('dashboard/chat', {
    title: 'Bateman Chat',
    currentPage: 'chat',
  });
});

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
router.get('/pipeline', (req, res, next) => {
  try {
    const pipeline = db.prepare(`SELECT * FROM pipeline ORDER BY updated_at DESC`).all();
    res.render('dashboard/pipeline', {
      title: 'Pipeline',
      currentPage: 'pipeline',
      pipeline,
      statuses: PIPELINE_STATUSES,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/pipeline', (req, res, next) => {
  try {
    const { business_name, contact_name, contact_email, contact_phone, website, status, value, package: pkg, notes, source } = req.body;

    if (!business_name || !business_name.trim()) {
      return res.status(400).json({ success: false, error: 'Business name is required.' });
    }

    const entry = {
      id: uuidv4(),
      business_name: business_name.trim().substring(0, 200),
      contact_name: (contact_name || '').trim().substring(0, 200),
      contact_email: (contact_email || '').trim().toLowerCase().substring(0, 320),
      contact_phone: (contact_phone || '').trim().substring(0, 50),
      website: (website || '').trim().substring(0, 500),
      status: PIPELINE_STATUSES.includes(status) ? status : 'FIND',
      value: Number.isFinite(parseFloat(value)) ? parseFloat(value) : 0,
      package: (pkg || '').trim().substring(0, 100),
      notes: (notes || '').trim().substring(0, 2000),
      source: (source || 'manual').trim().substring(0, 100),
    };

    db.prepare(
      `INSERT INTO pipeline (id, business_name, contact_name, contact_email, contact_phone, website, status, value, package, notes, source, last_action, last_action_at)
       VALUES (@id, @business_name, @contact_name, @contact_email, @contact_phone, @website, @status, @value, @package, @notes, @source, 'Created', CURRENT_TIMESTAMP)`
    ).run(entry);

    logActivity('PIPELINE', `Pipeline: ${entry.business_name} added`, `New entry at stage ${entry.status}`, 'pipeline', entry.id);

    if (req.accepts('html') && !req.xhr && req.headers['content-type'] !== 'application/json') {
      return res.redirect('/dashboard/pipeline');
    }
    return res.status(201).json({ success: true, entry });
  } catch (err) {
    next(err);
  }
});

router.patch('/pipeline/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM pipeline WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Pipeline entry not found.' });

    const allowed = ['business_name', 'contact_name', 'contact_email', 'contact_phone', 'website', 'status', 'value', 'package', 'notes', 'last_action'];
    const updates = [];
    const params = {};

    for (const field of allowed) {
      if (req.body[field] === undefined) continue;
      if (field === 'status' && !PIPELINE_STATUSES.includes(req.body.status)) {
        return res.status(400).json({ success: false, error: 'Invalid status.' });
      }
      if (field === 'value') {
        const v = parseFloat(req.body.value);
        if (!Number.isFinite(v)) return res.status(400).json({ success: false, error: 'Invalid value.' });
        params.value = v;
      } else {
        params[field] = String(req.body[field]).substring(0, 2000);
      }
      updates.push(`${field} = @${field}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update.' });
    }

    params.id = req.params.id;
    db.prepare(
      `UPDATE pipeline SET ${updates.join(', ')}, last_action_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = @id`
    ).run(params);

    if (req.body.status && req.body.status !== existing.status) {
      logActivity('PIPELINE', `Pipeline: ${existing.business_name} → ${req.body.status}`, `Moved from ${existing.status}`, 'pipeline', existing.id);
    }

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/pipeline/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT business_name FROM pipeline WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Pipeline entry not found.' });
    db.prepare('DELETE FROM pipeline WHERE id = ?').run(req.params.id);
    logActivity('PIPELINE', `Pipeline: ${existing.business_name} removed`, '', 'pipeline', req.params.id);
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
router.get('/clients', (req, res, next) => {
  try {
    const clients = db.prepare(`SELECT * FROM clients ORDER BY updated_at DESC`).all();
    res.render('dashboard/clients', {
      title: 'Clients',
      currentPage: 'clients',
      clients,
      statuses: CLIENT_STATUSES,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/clients', (req, res, next) => {
  try {
    const { business_name, contact_name, contact_email, contact_phone, website_url, package: pkg, mrr, status, start_date, notes } = req.body;

    if (!business_name || !business_name.trim()) {
      return res.status(400).json({ success: false, error: 'Business name is required.' });
    }

    const client = {
      id: uuidv4(),
      business_name: business_name.trim().substring(0, 200),
      contact_name: (contact_name || '').trim().substring(0, 200),
      contact_email: (contact_email || '').trim().toLowerCase().substring(0, 320),
      contact_phone: (contact_phone || '').trim().substring(0, 50),
      website_url: (website_url || '').trim().substring(0, 500),
      package: (pkg || '').trim().substring(0, 100),
      mrr: Number.isFinite(parseFloat(mrr)) ? parseFloat(mrr) : 0,
      status: CLIENT_STATUSES.includes(status) ? status : 'ACTIVE',
      start_date: (start_date || '').trim().substring(0, 20) || null,
      notes: (notes || '').trim().substring(0, 2000),
    };

    db.prepare(
      `INSERT INTO clients (id, business_name, contact_name, contact_email, contact_phone, website_url, package, mrr, status, start_date, notes)
       VALUES (@id, @business_name, @contact_name, @contact_email, @contact_phone, @website_url, @package, @mrr, @status, @start_date, @notes)`
    ).run(client);

    logActivity('CLIENT', `Client: ${client.business_name} added`, `Package: ${client.package || '—'}, MRR: £${client.mrr}`, 'client', client.id);

    if (req.accepts('html') && !req.xhr && req.headers['content-type'] !== 'application/json') {
      return res.redirect('/dashboard/clients');
    }
    return res.status(201).json({ success: true, client });
  } catch (err) {
    next(err);
  }
});

router.patch('/clients/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Client not found.' });

    const allowed = ['business_name', 'contact_name', 'contact_email', 'contact_phone', 'website_url', 'package', 'mrr', 'status', 'start_date', 'notes', 'analytics_id'];
    const updates = [];
    const params = {};

    for (const field of allowed) {
      if (req.body[field] === undefined) continue;
      if (field === 'status' && !CLIENT_STATUSES.includes(req.body.status)) {
        return res.status(400).json({ success: false, error: 'Invalid status.' });
      }
      if (field === 'mrr') {
        const v = parseFloat(req.body.mrr);
        if (!Number.isFinite(v)) return res.status(400).json({ success: false, error: 'Invalid MRR.' });
        params.mrr = v;
      } else {
        params[field] = String(req.body[field]).substring(0, 2000);
      }
      updates.push(`${field} = @${field}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update.' });
    }

    params.id = req.params.id;
    db.prepare(`UPDATE clients SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run(params);

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/clients/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT business_name FROM clients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Client not found.' });
    db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    logActivity('CLIENT', `Client: ${existing.business_name} removed`, '', 'client', req.params.id);
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Analytics (placeholder — wire to GA/Plausible later)
// ---------------------------------------------------------------------------
router.get('/analytics', (req, res, next) => {
  try {
    const clients = db
      .prepare(`SELECT id, business_name, website_url FROM clients WHERE status = 'ACTIVE' ORDER BY business_name`)
      .all();
    res.render('dashboard/analytics', {
      title: 'Analytics',
      currentPage: 'analytics',
      clients,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Data browser
// ---------------------------------------------------------------------------
router.get('/data', (req, res, next) => {
  try {
    const { q, industry, location, source } = req.query;

    let marketSql = 'SELECT * FROM market_data WHERE 1=1';
    const marketParams = [];

    if (q && q.trim()) {
      marketSql += ' AND (business_name LIKE ? OR website LIKE ? OR email LIKE ?)';
      const like = `%${q.trim()}%`;
      marketParams.push(like, like, like);
    }
    if (industry && industry.trim()) {
      marketSql += ' AND industry = ?';
      marketParams.push(industry.trim());
    }
    if (location && location.trim()) {
      marketSql += ' AND location = ?';
      marketParams.push(location.trim());
    }
    if (source && source.trim()) {
      marketSql += ' AND source = ?';
      marketParams.push(source.trim());
    }
    marketSql += ' ORDER BY collected_at DESC LIMIT 500';

    const marketData = db.prepare(marketSql).all(...marketParams);
    const leads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 500').all();

    const industries = db.prepare(`SELECT DISTINCT industry FROM market_data WHERE industry IS NOT NULL AND industry != '' ORDER BY industry`).all().map((r) => r.industry);
    const locations = db.prepare(`SELECT DISTINCT location FROM market_data WHERE location IS NOT NULL AND location != '' ORDER BY location`).all().map((r) => r.location);
    const sources = db.prepare(`SELECT DISTINCT source FROM market_data WHERE source IS NOT NULL AND source != '' ORDER BY source`).all().map((r) => r.source);

    res.render('dashboard/data', {
      title: 'Data',
      currentPage: 'data',
      marketData,
      leads,
      filters: { q: q || '', industry: industry || '', location: location || '', source: source || '' },
      filterOptions: { industries, locations, sources },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
router.get('/settings', (req, res, next) => {
  try {
    const settings = getSettingsMap();
    const dneList = db.prepare('SELECT * FROM dne_list ORDER BY added_at DESC').all();

    res.render('dashboard/settings', {
      title: 'Settings',
      currentPage: 'settings',
      settings,
      dneList,
      batemanApiUrl: process.env.BATEMAN_API_URL || '(not configured)',
      saved: req.query.saved === '1',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/settings', (req, res, next) => {
  try {
    const editable = ['brand_name', 'brand_tagline', 'bateman_model', 'pricing_tiers'];
    const upsert = db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    );

    for (const key of editable) {
      if (req.body[key] === undefined) continue;
      let value = String(req.body[key]);
      if (key === 'pricing_tiers') {
        // Validate it's parseable JSON before persisting
        try {
          JSON.parse(value);
        } catch (_) {
          return res.status(400).json({ success: false, error: 'Pricing tiers must be valid JSON.' });
        }
      }
      upsert.run(key, value.substring(0, 20000));
    }

    logActivity('SETTINGS', 'Settings updated', '', 'settings', null);

    if (req.accepts('html') && req.headers['content-type'] !== 'application/json') {
      return res.redirect('/dashboard/settings?saved=1');
    }
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Password lives in .env as a bcrypt hash, so we generate the new hash for the
// user to paste in — it can't be rewritten from here without writing to .env.
router.post('/settings/password', async (req, res, next) => {
  try {
    const bcrypt = require('bcryptjs');
    const { current_password, new_password, confirm_password } = req.body;

    if (!current_password || !new_password || new_password.length < 10) {
      return res.status(400).json({ success: false, error: 'New password must be at least 10 characters.' });
    }
    if (new_password !== confirm_password) {
      return res.status(400).json({ success: false, error: 'New passwords do not match.' });
    }

    const valid = await bcrypt.compare(current_password, process.env.ADMIN_PASSWORD_HASH || '');
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    logActivity('SETTINGS', 'Password hash generated', 'Admin generated a new password hash', 'settings', null);

    return res.json({
      success: true,
      message: 'New hash generated. Update ADMIN_PASSWORD_HASH in your .env file with the value below, then restart the app.',
      hash: newHash,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DNE list
// ---------------------------------------------------------------------------
router.post('/dne', (req, res, next) => {
  try {
    const { email, reason } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const entry = {
      id: uuidv4(),
      email: cleanEmail,
      domain: cleanEmail.split('@')[1],
      reason: (reason || '').trim().substring(0, 500),
    };

    try {
      db.prepare(`INSERT INTO dne_list (id, email, domain, reason) VALUES (@id, @email, @domain, @reason)`).run(entry);
    } catch (insertErr) {
      if (String(insertErr.message).includes('UNIQUE')) {
        return res.status(409).json({ success: false, error: 'That email is already on the DNE list.' });
      }
      throw insertErr;
    }

    logActivity('DNE', `DNE: ${entry.email} added`, entry.reason, 'dne', entry.id);
    return res.status(201).json({ success: true, entry });
  } catch (err) {
    next(err);
  }
});

router.delete('/dne/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT email FROM dne_list WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Entry not found.' });
    db.prepare('DELETE FROM dne_list WHERE id = ?').run(req.params.id);
    logActivity('DNE', `DNE: ${existing.email} removed`, '', 'dne', req.params.id);
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
