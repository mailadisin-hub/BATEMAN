'use strict';

/**
 * Initialises all database tables and seeds default settings.
 * @param {import('better-sqlite3').Database} db
 */
function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id           TEXT PRIMARY KEY,
      name         TEXT,
      business_name TEXT,
      email        TEXT,
      phone        TEXT,
      website      TEXT,
      source       TEXT,
      status       TEXT DEFAULT 'NEW',
      notes        TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pipeline (
      id              TEXT PRIMARY KEY,
      business_name   TEXT,
      contact_name    TEXT,
      contact_email   TEXT,
      contact_phone   TEXT,
      website         TEXT,
      status          TEXT DEFAULT 'FIND'
                        CHECK(status IN ('FIND','SCORE','BUILD','PITCH','FOLLOW_UP','CLOSED_WON','CLOSED_LOST')),
      value           REAL DEFAULT 0,
      package         TEXT,
      last_action     TEXT,
      last_action_at  DATETIME,
      notes           TEXT,
      source          TEXT,
      assigned_to     TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id              TEXT PRIMARY KEY,
      business_name   TEXT,
      contact_name    TEXT,
      contact_email   TEXT,
      contact_phone   TEXT,
      website_url     TEXT,
      package         TEXT,
      mrr             REAL DEFAULT 0,
      status          TEXT DEFAULT 'ACTIVE'
                        CHECK(status IN ('ACTIVE','PAUSED','CHURNED')),
      start_date      DATE,
      notes           TEXT,
      analytics_id    TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity (
      id           TEXT PRIMARY KEY,
      type         TEXT,
      title        TEXT,
      description  TEXT,
      entity_type  TEXT,
      entity_id    TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dne_list (
      id       TEXT PRIMARY KEY,
      email    TEXT UNIQUE,
      domain   TEXT,
      reason   TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS market_data (
      id            TEXT PRIMARY KEY,
      business_name TEXT,
      website       TEXT,
      industry      TEXT,
      location      TEXT,
      email         TEXT,
      phone         TEXT,
      score         REAL,
      data_json     TEXT,
      source        TEXT,
      collected_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default settings (INSERT OR IGNORE so existing values are preserved)
  const seedSettings = db.prepare(
    `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`
  );

  const pricingTiers = JSON.stringify({
    builds: [
      {
        key: 'essential',
        name: 'Essential',
        price: 0,
        priceLabel: 'Free',
        description: 'A clean single-page presence to get your business online',
        features: ['Single-page website', 'Mobile responsive', 'Contact details & map', 'Hosted setup guidance'],
      },
      {
        key: 'starter',
        name: 'Starter',
        price: 149,
        priceLabel: '£149',
        description: 'A focused site for businesses ready to look professional',
        features: ['Up to 3 pages', 'Mobile responsive', 'Contact form', 'Basic SEO setup', '1 revision round'],
      },
      {
        key: 'growth',
        name: 'Growth',
        price: 299,
        priceLabel: '£299',
        description: 'The full professional presence most businesses need',
        features: ['Up to 6 pages', 'Premium custom design', 'Advanced SEO', 'Google Business integration', '2 revision rounds'],
        popular: true,
      },
      {
        key: 'professional',
        name: 'Professional',
        price: 499,
        priceLabel: '£499',
        description: 'For businesses that want to lead their local market',
        features: ['Up to 10 pages', 'Bespoke design system', 'Copywriting included', 'Analytics dashboard', 'Booking / enquiry systems', '3 revision rounds'],
      },
      {
        key: 'flagship',
        name: 'Flagship',
        price: 799,
        priceLabel: '£799',
        description: 'The complete digital flagship, built end to end',
        features: ['Unlimited pages', 'E-commerce ready', 'Custom integrations', 'Performance optimisation', 'Priority delivery', 'Unlimited revisions'],
      },
    ],
    maintenance: [
      {
        key: 'care',
        name: 'Care',
        price: 29,
        priceLabel: '£29/mo',
        features: ['Hosting management', 'Security updates', 'Monthly backup'],
      },
      {
        key: 'care_plus',
        name: 'Care Plus',
        price: 49,
        priceLabel: '£49/mo',
        features: ['Everything in Care', 'Monthly content updates', 'Performance monitoring'],
      },
      {
        key: 'concierge',
        name: 'Concierge',
        price: 79,
        priceLabel: '£79/mo',
        features: ['Everything in Care Plus', 'Priority same-day support', 'SEO monitoring & reporting', 'Quarterly strategy review'],
      },
    ],
  });

  const seedData = [
    ['pricing_tiers', pricingTiers],
    ['brand_name', 'Trendzation'],
    ['brand_tagline', 'We work while you sleep.'],
    ['bateman_model', 'qwen3'],
  ];

  const insertMany = db.transaction((rows) => {
    for (const [key, value] of rows) {
      seedSettings.run(key, value);
    }
  });

  insertMany(seedData);
}

module.exports = { initSchema };
