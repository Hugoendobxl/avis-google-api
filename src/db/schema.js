/**
 * Database schema initialization — avis-google-api
 * Tables: reviews, drafts, response_history, sync_log
 * Run: node src/db/schema.js (or auto-init on startup)
 */
const pool = require('./pool');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  author_name TEXT,
  author_avatar_url TEXT,
  rating INT NOT NULL,
  comment TEXT,
  language TEXT,
  created_at_google TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'new',
  seen_at TIMESTAMPTZ,
  seen_by VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS drafts (
  id SERIAL PRIMARY KEY,
  review_id TEXT REFERENCES reviews(id),
  content TEXT NOT NULL,
  source VARCHAR(20) NOT NULL,
  created_by VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  validated_by VARCHAR(50),
  validated_at TIMESTAMPTZ,
  requires_hugo_validation BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS response_history (
  id SERIAL PRIMARY KEY,
  review_id TEXT REFERENCES reviews(id),
  response_content TEXT NOT NULL,
  sent_by VARCHAR(50),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  google_response_id TEXT,
  status VARCHAR(20) DEFAULT 'sent'
);

CREATE TABLE IF NOT EXISTS sync_log (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  total_fetched INT DEFAULT 0,
  new_reviews INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'running',
  error TEXT
);
`;

async function initSchema() {
  try {
    await pool.query(SCHEMA);
    console.log('[db] Schema initialized');
  } catch (err) {
    console.error('[db] Schema init failed:', err.message);
    throw err;
  }
}

module.exports = { initSchema };
