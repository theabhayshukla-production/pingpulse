const express = require('express');
const requireMonitorKey = require('../middleware/monitorAuth');
const monitorService = require('../services/monitorService');

const router = express.Router();
router.use(requireMonitorKey);

router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const monitor = await monitorService.createMonitor({
      name: body.name,
      url: body.url,
      intervalMinutes: body.interval_minutes === undefined
        ? 5
        : body.interval_minutes
    });
    res.status(201).json({ monitor });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    res.json({ monitors: await monitorService.listMonitors() });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await monitorService.deleteMonitor(req.params.id);
    if (!deleted) {
      res.status(404).json({
        error: { code: 'MONITOR_NOT_FOUND', message: 'Monitor was not found.' }
      });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/:id/checks', async (req, res, next) => {
  try {
    const rawLimit = req.query.limit === undefined ? '20' : req.query.limit;
    const limit = /^\d+$/.test(rawLimit) ? Number(rawLimit) : NaN;
    res.json({ checks: await monitorService.listChecks(req.params.id, limit) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
