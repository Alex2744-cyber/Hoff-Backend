const express = require('express');
const router = express.Router();
const {
  getAllTareas,
  getTareaById,
  createTarea,
  updateTarea,
  deleteTarea,
  getTareasByTrabajador,
  asignarTrabajador,
  desasignarTrabajador,
  actualizarHorasTrabajador,
  buscarTareasPorDireccion,
  completarTarea,
  aprobarTarea,
  devolverTarea,
  marcarTareaComoPagada,
} = require('../controllers/tareasController');

// GET /api/tareas - Obtener todas las tareas
router.get('/', getAllTareas);

// GET /api/tareas/buscar?busqueda=calle - Buscar tareas por dirección
router.get('/buscar', buscarTareasPorDireccion);

// GET /api/tareas/:id - Obtener tarea por ID
router.get('/:id', getTareaById);

// POST /api/tareas - Crear nueva tarea
router.post('/', createTarea);

// PUT /api/tareas/:id - Actualizar tarea
router.put('/:id', updateTarea);

// DELETE /api/tareas/:id - Eliminar tarea
router.delete('/:id', deleteTarea);

// GET /api/tareas/trabajador/:trabajadorId - Obtener tareas de un trabajador
router.get('/trabajador/:trabajadorId', getTareasByTrabajador);

// POST /api/tareas/:tareaId/asignar - Asignar trabajador a tarea
router.post('/:tareaId/asignar', asignarTrabajador);

// DELETE /api/tareas/:tareaId/trabajador/:trabajadorId - Desasignar trabajador
router.delete('/:tareaId/trabajador/:trabajadorId', desasignarTrabajador);

// PUT /api/tareas/:tareaId/trabajador/:trabajadorId/horas - Actualizar horas asignadas de trabajador
router.put('/:tareaId/trabajador/:trabajadorId/horas', actualizarHorasTrabajador);

// PUT /api/tareas/:id/completar - Completar tarea (trabajador)
router.put('/:id/completar', completarTarea);

// POST /api/tareas/:id/aprobar - Aprobar tarea (admin)
router.post('/:id/aprobar', aprobarTarea);

// PUT /api/tareas/:id/devolver - Devolver tarea completada (admin)
router.put('/:id/devolver', devolverTarea);

// PUT /api/tareas/:id/marcar-pagado - Marcar tarea como pagada (admin)
router.put('/:id/marcar-pagado', marcarTareaComoPagada);

module.exports = router;


