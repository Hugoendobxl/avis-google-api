/**
 * Schema PostgreSQL — avis-google-api
 * A executer une fois pour initialiser la base.
 * Usage : node src/db/init.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const schema = `
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  author_name TEXT,
  author_avatar_url TEXT,
  rating INT NOT NULL,
  comment TEXT,
  language TEXT,
  created_at_google TIMESTAMP,
  fetched_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'new',
  seen_at TIMESTAMP,
  seen_by VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS drafts (
  id SERIAL PRIMARY KEY,
  review_id TEXT REFERENCES reviews(id),
  content TEXT NOT NULL,
  source VARCHAR(20) NOT NULL,
  created_by VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  validated_by VARCHAR(50),
  validated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id SERIAL PRIMARY KEY,
  encrypted_refresh_token TEXT NOT NULL,
  last_rotated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS response_history (
  id SERIAL PRIMARY KEY,
  review_id TEXT REFERENCES reviews(id),
  response_content TEXT NOT NULL,
  sent_by VARCHAR(50),
  sent_at TIMESTAMP DEFAULT NOW(),
  google_response_id TEXT,
  status VARCHAR(20) DEFAULT 'sent'
);
`;

async function init() {
  try {
    await pool.query(schema);
    console.log('Schema initialized successfully.');
  } catch (err) {
    console.error('Schema init failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

init();
