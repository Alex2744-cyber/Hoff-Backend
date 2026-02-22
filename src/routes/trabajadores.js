const express = require('express');
const router = express.Router();
const {
  getAllTrabajadores,
  getTrabajadorById,
  createTrabajador,
  updateTrabajador,
  cambiarPassword,
  deleteTrabajador,
  getHorasTrabajadas,
  getHorasAsignadas,
  getTareasAprobadas
} = require('../controllers/trabajadoresController');

// GET /api/trabajadores - Obtener todos los trabajadores
router.get('/', getAllTrabajadores);

// GET /api/trabajadores/:id - Obtener trabajador por ID
router.get('/:id', getTrabajadorById);

// POST /api/trabajadores - Crear nuevo trabajador
router.post('/', createTrabajador);

// PUT /api/trabajadores/:id - Actualizar trabajador
router.put('/:id', updateTrabajador);

// PUT /api/trabajadores/:id/password - Cambiar contraseña
router.put('/:id/password', cambiarPassword);

// DELETE /api/trabajadores/:id - Desactivar trabajador
router.delete('/:id', deleteTrabajador);

// GET /api/trabajadores/:id/horas - Obtener horas trabajadas
router.get('/:id/horas', getHorasTrabajadas);

// GET /api/trabajadores/:id/horas-asignadas - Obtener horas asignadas activas
router.get('/:id/horas-asignadas', getHorasAsignadas);

// GET /api/trabajadores/:id/tareas-aprobadas - Obtener tareas aprobadas (filtrado por mes/año opcional)
router.get('/:id/tareas-aprobadas', getTareasAprobadas);

module.exports = router;


