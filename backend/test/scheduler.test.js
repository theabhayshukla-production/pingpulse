const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/pingpulse';
process.env.ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'unit-test-cron-secret-with-at-least-32-characters';
process.env.MONITOR_API_KEY = process.env.MONITOR_API_KEY || 'unit-test-monitor-key-with-at-least-32-characters';

const { mapWithConcurrency } = require('../jobs/scheduler');
const { secretsMatch } = require('../middleware/cronAuth');

test('compares API secrets safely and rejects empty or wrong secrets', () => {
  const expected = 'a-secret-that-is-at-least-thirty-two-characters';
  assert.equal(secretsMatch(expected, expected), true);
  assert.equal(secretsMatch('wrong-secret', expected), false);
  assert.equal(secretsMatch('', expected), false);
});

test('runs monitor checks with a maximum concurrency of five', async () => {
  let active = 0;
  let peak = 0;
  const values = Array.from({ length: 20 }, (_, index) => index);

  const results = await mapWithConcurrency(values, 5, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  });

  assert.equal(peak, 5);
  assert.deepEqual(results, values.map((value) => value * 2));
});
