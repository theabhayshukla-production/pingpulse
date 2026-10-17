const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const cors = require('./config/cors');
const pool = require('./db/pool');
const checkRoutes = require('./routes/checkRoutes');
const monitorRoutes = require('./routes/monitorRoutes');
const cronRoutes = require('./routes/cronRoutes');
const { errorHandler, notFound } = require('./middleware/errors');
const { startScheduler, stopScheduler } = require('./jobs/scheduler');

const app = express();
app.set('trust proxy', 1);
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' }
    });
  }
});

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors);
app.use(express.json({ limit: '16kb' }));
app.use('/api', apiLimiter);
app.use('/api', checkRoutes);
app.use('/api/monitors', monitorRoutes);
app.use('/api/cron', cronRoutes);

app.get('/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', service: 'PingPulse Monitoring Service' });
  } catch (error) {
    next(error);
  }
});

app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`PingPulse backend server running on port ${env.port}`);
  startScheduler();
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  stopScheduler();
  await new Promise((resolve) => {
    server.close(async (error) => {
      try {
        await pool.end();
      } catch (poolError) {
        console.error('Failed to close PostgreSQL pool.', poolError);
        process.exitCode = 1;
      }
      if (error) {
        console.error('Failed to close HTTP server.', error);
        process.exitCode = 1;
      }
      resolve();
    });
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM').catch((error) => {
  console.error('Shutdown failed.', error);
  process.exitCode = 1;
}));
process.once('SIGINT', () => shutdown('SIGINT').catch((error) => {
  console.error('Shutdown failed.', error);
  process.exitCode = 1;
}));

module.exports = { app, server, shutdown };
