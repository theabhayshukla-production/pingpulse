const cron = require('node-cron');
const monitorService = require('../services/monitorService');

const MAX_CONCURRENCY = 5;
let isRunning = false;
let minuteJob;
let retentionJob;

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await callback(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

async function runDueMonitors() {
  if (isRunning) {
    return { status: 'already_running', checked: 0 };
  }
  isRunning = true;
  try {
    const dueMonitors = await monitorService.getDueMonitors();
    const results = await mapWithConcurrency(dueMonitors, MAX_CONCURRENCY, async (monitor) => {
      try {
        await monitorService.checkAndStoreMonitor(monitor);
        return { id: monitor.id, stored: true };
      } catch (error) {
        console.error(`Monitor check could not be stored for ${monitor.id}.`, error);
        return { id: monitor.id, stored: false };
      }
    });
    return {
      status: 'complete',
      checked: results.filter((result) => result.stored).length,
      failedToStore: results.filter((result) => !result.stored).length
    };
  } finally {
    isRunning = false;
  }
}

function startScheduler() {
  if (minuteJob) {
    return;
  }
  minuteJob = cron.schedule('* * * * *', () => {
    runDueMonitors().catch((error) => console.error('Scheduled monitor run failed.', error));
  });
  retentionJob = cron.schedule('17 3 * * *', async () => {
    try {
      const deleted = await monitorService.deleteExpiredChecks();
      console.log(`Retention job deleted ${deleted} expired checks.`);
    } catch (error) {
      console.error('Check retention job failed.', error);
    }
  });
}

function stopScheduler() {
  if (minuteJob) {
    minuteJob.stop();
    minuteJob = undefined;
  }
  if (retentionJob) {
    retentionJob.stop();
    retentionJob = undefined;
  }
}

module.exports = { mapWithConcurrency, runDueMonitors, startScheduler, stopScheduler };
