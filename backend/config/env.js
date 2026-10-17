const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

const allowedOrigins = required('ALLOWED_ORIGIN')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

for (const origin of allowedOrigins) {
  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error(`ALLOWED_ORIGIN contains an invalid origin: ${origin}`);
  }
  if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) {
    throw new Error(`ALLOWED_ORIGIN must contain only HTTP(S) origins: ${origin}`);
  }
}

const cronSecret = required('CRON_SECRET');
if (cronSecret.length < 32) {
  throw new Error('CRON_SECRET must be at least 32 characters long.');
}

const monitorApiKey = required('MONITOR_API_KEY');
if (monitorApiKey.length < 32) {
  throw new Error('MONITOR_API_KEY must be at least 32 characters long.');
}

const port = Number.parseInt(process.env.PORT || '5000', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

module.exports = Object.freeze({
  port,
  databaseUrl: required('DATABASE_URL'),
  allowedOrigins,
  cronSecret,
  monitorApiKey
});
