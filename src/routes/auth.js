const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { login, changePassword, getMe, updateMe } = require('../controllers/authController');
const { requireAuth } = require('../middleware/requireAuth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados intentos de inicio de sesión. Intenta más tarde.' },
});

// POST /api/auth/login
router.post('/login', loginLimiter, login);

// PUT /api/auth/password
router.put('/password', requireAuth, changePassword);

// GET/PUT /api/auth/me
router.get('/me', requireAuth, getMe);
router.put('/me', requireAuth, updateMe);

module.exports = router;
