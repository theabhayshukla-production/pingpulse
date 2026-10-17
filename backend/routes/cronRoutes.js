const express = require('express');
const requireCronSecret = require('../middleware/cronAuth');
const { runDueMonitors } = require('../jobs/scheduler');

const router = express.Router();

router.get('/run', requireCronSecret, async (req, res, next) => {
  try {
    res.json(await runDueMonitors());
  } catch (error) {
    next(error);
  }
});

module.exports = router;
