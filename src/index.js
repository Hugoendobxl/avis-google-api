require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Healthcheck endpoint — monitored by UptimeRobot
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'avis-google-api', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`avis-google-api listening on port ${PORT}`);
});
