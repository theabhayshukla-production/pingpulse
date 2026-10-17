const { randomUUID } = require('node:crypto');
const pool = require('../db/pool');
const { checkUrl, validateTargetUrl } = require('./checker');

function validateMonitorId(id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    const error = new Error('Monitor ID is invalid.');
    error.code = 'INVALID_MONITOR_ID';
    error.statusCode = 400;
    throw error;
  }
}

async function createMonitor({ name, url, intervalMinutes = 5 }) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
    const error = new Error('Monitor name must contain 1 to 120 characters.');
    error.code = 'INVALID_MONITOR_NAME';
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
    const error = new Error('interval_minutes must be an integer from 1 to 1440.');
    error.code = 'INVALID_INTERVAL';
    error.statusCode = 400;
    throw error;
  }

  const parsedUrl = await validateTargetUrl(url);
  const slug = randomUUID().replace(/-/g, '');
  const { rows } = await pool.query(
    `INSERT INTO monitors (slug, name, url, interval_minutes)
     VALUES ($1, $2, $3, $4)
     RETURNING id, slug, name, url, interval_minutes, is_active, is_public,
               last_status, consecutive_failures, created_at`,
    [slug, name.trim(), parsedUrl.href, intervalMinutes]
  );
  return rows[0];
}

async function listMonitors() {
  const { rows } = await pool.query(
    `SELECT m.id, m.slug, m.name, m.url, m.interval_minutes, m.is_active, m.is_public,
            m.last_status, m.consecutive_failures, m.created_at,
            c.status_code AS latest_status_code,
            c.response_time_ms AS latest_response_time_ms,
            c.is_online AS latest_is_online,
            c.ssl_days_left AS latest_ssl_days_left,
            c.error AS latest_error,
            c.checked_at AS latest_checked_at
     FROM monitors m
     LEFT JOIN LATERAL (
       SELECT status_code, response_time_ms, is_online, ssl_days_left, error, checked_at
       FROM checks WHERE monitor_id = m.id
       ORDER BY checked_at DESC LIMIT 1
     ) c ON TRUE
     ORDER BY m.created_at DESC`
  );
  return rows;
}

async function deleteMonitor(id) {
  validateMonitorId(id);
  const result = await pool.query('DELETE FROM monitors WHERE id = $1', [id]);
  return result.rowCount > 0;
}

async function listChecks(id, limit = 20) {
  validateMonitorId(id);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    const error = new Error('limit must be an integer from 1 to 100.');
    error.code = 'INVALID_LIMIT';
    error.statusCode = 400;
    throw error;
  }

  const monitor = await pool.query('SELECT id FROM monitors WHERE id = $1', [id]);
  if (!monitor.rowCount) {
    const error = new Error('Monitor was not found.');
    error.code = 'MONITOR_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  const { rows } = await pool.query(
    `SELECT id, monitor_id, status_code, response_time_ms, is_online, ssl_days_left, error, checked_at
     FROM checks WHERE monitor_id = $1
     ORDER BY checked_at DESC LIMIT $2`,
    [id, limit]
  );
  return rows;
}

async function checkAndStoreMonitor(monitor) {
  let result;
  try {
    result = await checkUrl(monitor.url);
  } catch (error) {
    result = {
      status: 'OFFLINE',
      statusCode: null,
      responseTimeMs: 0,
      isOnline: false,
      expiresInDays: null,
      error: error.message
    };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO checks (monitor_id, status_code, response_time_ms, is_online, ssl_days_left, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [monitor.id, result.statusCode, result.responseTimeMs, result.isOnline, result.expiresInDays, result.error]
    );
    await client.query(
      `UPDATE monitors
       SET last_status = $2,
           consecutive_failures = CASE WHEN $3 THEN 0 ELSE consecutive_failures + 1 END
       WHERE id = $1`,
      [monitor.id, result.status, result.isOnline]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return result;
}

async function getDueMonitors() {
  const { rows } = await pool.query(
    `SELECT m.id, m.url, m.interval_minutes
     FROM monitors m
     LEFT JOIN LATERAL (
       SELECT checked_at FROM checks WHERE monitor_id = m.id
       ORDER BY checked_at DESC LIMIT 1
     ) c ON TRUE
     WHERE m.is_active
       AND COALESCE(c.checked_at, '-infinity'::timestamptz)
         <= NOW() - (m.interval_minutes * INTERVAL '1 minute')
     ORDER BY COALESCE(c.checked_at, m.created_at) ASC`
  );
  return rows;
}

async function deleteExpiredChecks() {
  const result = await pool.query("DELETE FROM checks WHERE checked_at < NOW() - INTERVAL '30 days'");
  return result.rowCount;
}

module.exports = {
  checkAndStoreMonitor,
  createMonitor,
  deleteExpiredChecks,
  deleteMonitor,
  getDueMonitors,
  listChecks,
  listMonitors
};
