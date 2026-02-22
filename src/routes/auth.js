const express = require('express');
const router = express.Router();
const { login } = require('../controllers/authController');

// POST /api/auth/login (único endpoint: prueba admin luego trabajador)
router.post('/login', login);

module.exports = router;
