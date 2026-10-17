const env = require('../config/env');
const { secretsMatch } = require('./cronAuth');

function requireMonitorKey(req, res, next) {
  const provided = req.get('x-monitor-key') || '';
  if (!secretsMatch(provided, env.monitorApiKey)) {
    res.status(401).json({
      error: {
        code: 'INVALID_MONITOR_KEY',
        message: 'Enter a valid monitor access key to manage monitors.'
      }
    });
    return;
  }

  next();
}

module.exports = requireMonitorKey;
