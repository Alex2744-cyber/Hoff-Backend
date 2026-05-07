const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/requireAuth');
const {
  createContrato,
  createContratoTareas,
  getContratoById,
  listContratosByCliente,
  updateContrato,
  pagarContrato,
  cerrarContrato,
  removeContratoTarea,
} = require('../controllers/contratosController');

router.get('/cliente/:clienteId', requireAdmin, listContratosByCliente);
router.get('/:id', requireAdmin, getContratoById);
router.post('/', requireAdmin, createContrato);
router.post('/:id/tareas', requireAdmin, createContratoTareas);
router.delete('/:id/tareas/:tareaId', requireAdmin, removeContratoTarea);
router.put('/:id', requireAdmin, updateContrato);
router.post('/:id/pagar', requireAdmin, pagarContrato);
router.post('/:id/cerrar', requireAdmin, cerrarContrato);

module.exports = router;
