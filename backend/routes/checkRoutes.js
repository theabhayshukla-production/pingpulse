const express = require('express');
const { checkUrl } = require('../services/checker');

const router = express.Router();

router.post('/check', async (req, res, next) => {
  try {
    if (!req.body || !req.body.url) {
      res.status(400).json({
        error: { code: 'URL_REQUIRED', message: 'URL parameter is required.' }
      });
      return;
    }
    res.json(await checkUrl(req.body.url));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
