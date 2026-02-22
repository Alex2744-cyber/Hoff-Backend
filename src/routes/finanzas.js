const express = require('express');
const router = express.Router();
const { getIngresosTotales } = require('../controllers/finanzasController');

// GET /api/finanzas/ingresos - Obtener ingresos totales de tareas pagadas
router.get('/ingresos', getIngresosTotales);

module.exports = router;

