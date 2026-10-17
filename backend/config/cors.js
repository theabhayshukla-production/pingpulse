const cors = require('cors');
const env = require('./env');

module.exports = cors({
  origin(origin, callback) {
    if (!origin || env.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  }
});
