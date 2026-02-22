const express = require('express');
const router = express.Router();
const {
  registrarHoras,
  getHorasByTarea,
  updateHoras,
  deleteHoras
} = require('../controllers/horasController');

// POST /api/horas - Registrar horas trabajadas
router.post('/', registrarHoras);

// GET /api/horas/tarea/:tareaId - Obtener horas de una tarea
router.get('/tarea/:tareaId', getHorasByTarea);

// PUT /api/horas/:id - Actualizar registro de horas
router.put('/:id', updateHoras);

// DELETE /api/horas/:id - Eliminar registro de horas
router.delete('/:id', deleteHoras);

module.exports = router;


