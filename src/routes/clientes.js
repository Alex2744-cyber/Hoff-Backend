const express = require('express');
const router = express.Router();
const {
  getAllClientes,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente,
  getTareasCliente
} = require('../controllers/clientesController');
const { listContratosByCliente } = require('../controllers/contratosController');

// GET /api/clientes - Obtener todos los clientes
router.get('/', getAllClientes);

// GET /api/clientes/:id - Obtener cliente por ID
router.get('/:id', getClienteById);

// POST /api/clientes - Crear nuevo cliente
router.post('/', createCliente);

// PUT /api/clientes/:id - Actualizar cliente
router.put('/:id', updateCliente);

// DELETE /api/clientes/:id - Desactivar cliente
router.delete('/:id', deleteCliente);

// GET /api/clientes/:id/tareas - Obtener tareas del cliente
router.get('/:id/tareas', getTareasCliente);
// GET /api/clientes/:id/contratos - Obtener contratos del cliente
router.get('/:id/contratos', listContratosByCliente);

module.exports = router;


