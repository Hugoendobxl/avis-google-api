require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initSchema } = require('./db/schema');
const { startCronSync } = require('./cron/sync');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — restrict to post-traitement frontend
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://post-traitement.vercel.app';
app.use(cors({
  origin: CORS_ORIGIN.split(',').map(o => o.trim()),
  credentials: true,
}));
app.use(express.json());

// Healthcheck — monitored by UptimeRobot
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'avis-google-api', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api', apiRoutes);

// Start — server starts immediately, DB init is best-effort with retries
app.listen(PORT, () => {
  console.log(`avis-google-api listening on port ${PORT}`);
});

// DB init with retry (Postgres may take a few seconds to be ready)
(async function initWithRetry() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await initSchema();
      startCronSync();
      return;
    } catch (err) {
      console.error(`[startup] DB init attempt ${attempt}/5 failed: ${err.message}`);
      if (attempt < 5) await new Promise(r => setTimeout(r, 3000));
    }
  }
  console.error('[startup] DB init failed after 5 attempts. Server running without DB.');
})();
