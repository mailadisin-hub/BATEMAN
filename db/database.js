'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { initSchema } = require('./schema');

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, '..', 'data', 'trendzation.db');

// Ensure the data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;

try {
  db = new Database(dbPath);

  // Performance & integrity settings
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -8000'); // 8 MB cache

  // Initialise schema and seed defaults
  initSchema(db);

  console.log(`[DB] Connected to database at ${dbPath}`);
} catch (err) {
  console.error('[DB] Failed to initialise database:', err.message);
  process.exit(1);
}

module.exports = db;
