const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Endpoint to health-check a target URL
app.post('/api/check', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required.' });
  }

  // Ensure URL has a valid protocol prefix
  let formattedUrl = url;
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = 'https://' + formattedUrl;
  }

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const response = await fetch(formattedUrl, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeout);
    const duration = Date.now() - startTime;

    res.json({
      url: formattedUrl,
      status: response.ok ? 'ONLINE' : 'DEGRADED',
      statusCode: response.status,
      responseTimeMs: duration,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    res.json({
      url: formattedUrl,
      status: 'OFFLINE',
      statusCode: error.name === 'AbortError' ? 'TIMEOUT' : 'ERROR',
      responseTimeMs: duration,
      errorMsg: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Root API Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'PingPulse Monitoring Service' });
});

app.listen(PORT, () => {
  console.log(`PingPulse backend server running on port ${PORT}`);
});