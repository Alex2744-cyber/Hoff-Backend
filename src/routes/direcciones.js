const express = require('express');
const router = express.Router();
const {
  getAllDirecciones,
  getDireccionById,
  createDireccion,
  updateDireccion,
  deleteDireccion,
  buscarDirecciones,
  getDireccionesByCliente
} = require('../controllers/direccionesController');

// GET /api/direcciones - Obtener todas las direcciones
router.get('/', getAllDirecciones);

// GET /api/direcciones/buscar?busqueda=calle - Buscar direcciones
router.get('/buscar', buscarDirecciones);

// GET /api/direcciones/cliente/:clienteId - Obtener direcciones de un cliente
router.get('/cliente/:clienteId', getDireccionesByCliente);

// GET /api/direcciones/:id - Obtener dirección por ID
router.get('/:id', getDireccionById);

// POST /api/direcciones - Crear nueva dirección
router.post('/', createDireccion);

// PUT /api/direcciones/:id - Actualizar dirección
router.put('/:id', updateDireccion);

// DELETE /api/direcciones/:id - Eliminar dirección
router.delete('/:id', deleteDireccion);

module.exports = router;


