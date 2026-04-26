const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/requireAuth');
const {
  getIngresosTotales,
  getResumenPeriodo,
  listGastos,
  createGasto,
  updateGasto,
  deleteGasto,
  listNomina,
  getNominaHorasPeriodo,
  getNominaDefaults,
  patchNominaDefaults,
  upsertNomina,
  listFacturas,
  upsertFactura,
  deleteFactura,
  listAuditoria,
} = require('../controllers/finanzasController');
const {
  exportResumenExcel,
  exportNominaExcel,
  exportGastosExcel,
  exportFacturasExcel,
} = require('../controllers/finanzasExportController');

// GET /api/finanzas/ingresos - Ingresos totales (tareas aprobadas)
router.get('/ingresos', requireAdmin, getIngresosTotales);
router.get('/resumen', requireAdmin, getResumenPeriodo);

router.get('/gastos', requireAdmin, listGastos);
router.post('/gastos', requireAdmin, createGasto);
router.put('/gastos/:id', requireAdmin, updateGasto);
router.delete('/gastos/:id', requireAdmin, deleteGasto);

router.get('/nomina/horas-periodo', requireAdmin, getNominaHorasPeriodo);
router.get('/nomina-defaults', requireAdmin, getNominaDefaults);
router.patch('/nomina-defaults', requireAdmin, patchNominaDefaults);
router.get('/nomina', requireAdmin, listNomina);
router.post('/nomina', requireAdmin, upsertNomina);

router.get('/facturas', requireAdmin, listFacturas);
router.post('/facturas', requireAdmin, upsertFactura);
router.delete('/facturas/:id', requireAdmin, deleteFactura);

router.get('/auditoria', requireAdmin, listAuditoria);

router.get('/export/resumen', requireAdmin, exportResumenExcel);
router.get('/export/nomina', requireAdmin, exportNominaExcel);
router.get('/export/gastos', requireAdmin, exportGastosExcel);
router.get('/export/facturas', requireAdmin, exportFacturasExcel);

module.exports = router;

