const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { uploadMediaSingle } = require('../config/upload');
const { uploadMedia } = require('../controllers/mediaController');

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_UPLOAD_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas subidas. Intenta nuevamente en unos minutos.' },
});

router.post('/upload', uploadLimiter, uploadMediaSingle, uploadMedia);

module.exports = router;
