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

// Start
async function start() {
  await initSchema();
  startCronSync();
  app.listen(PORT, () => {
    console.log(`avis-google-api listening on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
