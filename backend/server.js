const express = require('express');
const cors = require('cors');
const tls = require('node:tls');
const net = require('node:net');

const app = express();
const PORT = process.env.PORT || 5000;
const CERTIFICATE_TIMEOUT_MS = 5000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

app.use(cors());
app.use(express.json());

function inspectSslCertificate(url) {
  if (url.protocol !== 'https:') {
    return Promise.resolve({
      sslValid: false,
      expiresInDays: null,
      issuer: 'Not applicable',
      sslError: null
    });
  }

  return new Promise((resolve) => {
    const fallback = {
      sslValid: false,
      expiresInDays: null,
      issuer: 'Unavailable',
      sslError: 'Certificate details are unavailable.'
    };
    let settled = false;
    let socket;
    const finish = (certificate) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(certificate);
    };
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    // Complete the handshake to inspect invalid certificates; authorization is checked below.
    const options = {
      host: hostname,
      port: Number(url.port) || 443,
      rejectUnauthorized: false,
      timeout: CERTIFICATE_TIMEOUT_MS
    };

    if (!net.isIP(hostname)) {
      options.servername = hostname;
    }

    socket = tls.connect(options);
    socket.setTimeout(CERTIFICATE_TIMEOUT_MS, () => {
      finish({ ...fallback, sslError: 'Certificate check timed out.' });
    });
    socket.once('error', (error) => {
      finish({ ...fallback, sslError: error.message });
    });
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate();
      const expirationTime = Date.parse(certificate.valid_to);
      if (!certificate.valid_to || Number.isNaN(expirationTime)) {
        finish(fallback);
        return;
      }

      const expiresInDays = Math.max(0, Math.ceil((expirationTime - Date.now()) / DAY_IN_MS));
      const issuer = certificate.issuer || {};
      finish({
        sslValid: socket.authorized && expirationTime > Date.now(),
        expiresInDays,
        issuer: issuer.commonName || issuer.CN || issuer.organization || issuer.O || 'Unknown issuer',
        sslError: socket.authorizationError ? String(socket.authorizationError) : null
      });
    });
  });
}

// Endpoint to health-check a target URL
app.post('/api/check', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required.' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) {
      throw new Error('Unsupported URL protocol.');
    }
  } catch {
    return res.status(400).json({ error: 'Enter a valid HTTP or HTTPS URL.' });
  }
  const formattedUrl = parsedUrl.href;

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const responsePromise = fetch(formattedUrl, {
      method: 'GET',
      signal: controller.signal
    })
      .then((response) => ({ response }))
      .catch((error) => ({ error }))
      .finally(() => clearTimeout(timeout));
    const [fetchResult, ssl] = await Promise.all([
      responsePromise,
      inspectSslCertificate(parsedUrl)
    ]);

    const duration = Date.now() - startTime;

    if (fetchResult.error) {
      return res.json({
        url: formattedUrl,
        status: 'OFFLINE',
        statusCode: fetchResult.error.name === 'AbortError' ? 'TIMEOUT' : 'ERROR',
        responseTimeMs: duration,
        ...ssl,
        errorMsg: fetchResult.error.message,
        timestamp: new Date().toISOString()
      });
    }

    const { response } = fetchResult;
    res.json({
      url: formattedUrl,
      status: response.ok ? 'ONLINE' : 'DEGRADED',
      statusCode: response.status,
      responseTimeMs: duration,
      ...ssl,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    res.json({
      url: formattedUrl,
      status: 'OFFLINE',
      statusCode: error.name === 'AbortError' ? 'TIMEOUT' : 'ERROR',
      responseTimeMs: duration,
      sslValid: false,
      expiresInDays: null,
      issuer: 'Unavailable',
      sslError: 'Certificate details are unavailable.',
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