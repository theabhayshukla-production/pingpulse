const { timingSafeEqual } = require('node:crypto');
const env = require('../config/env');

function secretsMatch(provided, expected) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer);
}

function requireCronSecret(req, res, next) {
  const provided = req.get('x-cron-secret') || '';

  if (!secretsMatch(provided, env.cronSecret)) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'A valid x-cron-secret header is required.'
      }
    });
    return;
  }

  next();
}

module.exports = requireCronSecret;
module.exports.secretsMatch = secretsMatch;
