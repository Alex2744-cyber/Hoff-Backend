const ExcelJS = require('exceljs');
const { pool } = require('../config/database');
const { logAuditoria } = require('./finanzasController');

function toInt(value, fallback) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function getPeriodo(req) {
  const now = new Date();
  const mes = Math.min(12, Math.max(1, toInt(req.query.mes, now.getMonth() + 1)));
  const anio = toInt(req.query.anio, now.getFullYear());
  return { mes, anio };
}

function formatName(prefix, mes, anio) {
  return `${prefix}_${anio}_${String(mes).padStart(2, '0')}.xlsx`;
}

async function sendWorkbook(res, workbook, fileName) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  await workbook.xlsx.write(res);
  return res.end();
}

async function exportResumenExcel(req, res, next) {
  try {
    const { mes, anio } = getPeriodo(req);
    const [rows] = await pool.query(
      `SELECT
        (SELECT COALESCE(SUM(valor_servicio), 0) FROM tareas_aprobadas WHERE mes_nomina = ? AND anio_nomina = ?) AS ingresos,
        (SELECT COALESCE(SUM(monto_neto), 0) FROM finanzas_pagos_nomina WHERE mes = ? AND anio = ?) AS nomina,
        (SELECT COALESCE(SUM(monto), 0) FROM finanzas_gastos WHERE MONTH(fecha) = ? AND YEAR(fecha) = ?) AS gastos`,
      [mes, anio, mes, anio, mes, anio]
    );
    const r = rows[0] || {};
    const ingresos = Number(r.ingresos || 0);
    const nomina = Number(r.nomina || 0);
    const gastos = Number(r.gastos || 0);
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Resumen');
    ws.columns = [
      { header: 'Periodo', key: 'periodo', width: 16 },
      { header: 'Ingresos', key: 'ingresos', width: 16 },
      { header: 'Egresos nómina', key: 'nomina', width: 16 },
      { header: 'Egresos gastos', key: 'gastos', width: 16 },
      { header: 'Balance', key: 'balance', width: 16 },
    ];
    ws.addRow({
      periodo: `${String(mes).padStart(2, '0')}/${anio}`,
      ingresos,
      nomina,
      gastos,
      balance: ingresos - nomina - gastos,
    });
    await logAuditoria({
      adminId: req.auth.userId,
      accion: 'export',
      modulo: 'resumen',
      detalle: `Exportación resumen ${mes}/${anio}`,
    });
    return sendWorkbook(res, workbook, formatName('resumen_finanzas', mes, anio));
  } catch (error) {
    next(error);
  }
}

async function exportNominaExcel(req, res, next) {
  try {
    const { mes, anio } = getPeriodo(req);
    const [rows] = await pool.query(
      `SELECT n.*, t.nombre AS trabajador_nombre
       FROM finanzas_pagos_nomina n
       JOIN trabajadores t ON t.id = n.trabajador_id
       WHERE n.mes = ? AND n.anio = ?
       ORDER BY t.nombre ASC`,
      [mes, anio]
    );
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Nomina');
    ws.columns = [
      { header: 'Trabajador', key: 'trabajador_nombre', width: 30 },
      { header: 'Horas', key: 'horas', width: 12 },
      { header: 'Tarifa/hora', key: 'tarifa_hora', width: 14 },
      { header: 'Subtotal', key: 'subtotal', width: 14 },
      { header: 'Deducciones', key: 'deducciones', width: 14 },
      { header: 'Extras', key: 'extras', width: 14 },
      { header: 'Monto neto', key: 'monto_neto', width: 14 },
      { header: 'Estado', key: 'estado_pago', width: 12 },
      { header: 'Fecha pago', key: 'fecha_pago', width: 14 },
      { header: 'Referencia', key: 'referencia_pago', width: 20 },
    ];
    rows.forEach((row) => ws.addRow(row));
    await logAuditoria({
      adminId: req.auth.userId,
      accion: 'export',
      modulo: 'nomina',
      detalle: `Exportación nómina ${mes}/${anio}`,
    });
    return sendWorkbook(res, workbook, formatName('nomina', mes, anio));
  } catch (error) {
    next(error);
  }
}

async function exportGastosExcel(req, res, next) {
  try {
    const { mes, anio } = getPeriodo(req);
    const [rows] = await pool.query(
      `SELECT * FROM finanzas_gastos
       WHERE MONTH(fecha) = ? AND YEAR(fecha) = ?
       ORDER BY fecha DESC, id DESC`,
      [mes, anio]
    );
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Gastos');
    ws.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Categoría', key: 'categoria', width: 20 },
      { header: 'Proveedor', key: 'proveedor', width: 24 },
      { header: 'Descripción', key: 'descripcion', width: 32 },
      { header: 'Monto', key: 'monto', width: 14 },
      { header: 'Método', key: 'metodo_pago', width: 16 },
      { header: 'Referencia', key: 'referencia', width: 20 },
    ];
    rows.forEach((row) => ws.addRow(row));
    await logAuditoria({
      adminId: req.auth.userId,
      accion: 'export',
      modulo: 'gastos',
      detalle: `Exportación gastos ${mes}/${anio}`,
    });
    return sendWorkbook(res, workbook, formatName('gastos', mes, anio));
  } catch (error) {
    next(error);
  }
}

async function exportFacturasExcel(req, res, next) {
  try {
    const { mes, anio } = getPeriodo(req);
    const [rows] = await pool.query(
      `SELECT f.*, t.descripcion_general, c.nombre AS cliente_nombre
       FROM finanzas_facturas f
       JOIN tareas t ON t.id = f.tarea_id
       JOIN clientes c ON c.id = f.cliente_id
       WHERE MONTH(f.fecha_emision) = ? AND YEAR(f.fecha_emision) = ?
       ORDER BY f.fecha_emision DESC, f.id DESC`,
      [mes, anio]
    );
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Facturas');
    ws.columns = [
      { header: 'Nº factura', key: 'numero_factura', width: 18 },
      { header: 'Cliente', key: 'cliente_nombre', width: 24 },
      { header: 'Tarea ID', key: 'tarea_id', width: 10 },
      { header: 'Concepto', key: 'descripcion_general', width: 36 },
      { header: 'Monto', key: 'monto', width: 14 },
      { header: 'Estado', key: 'estado', width: 12 },
      { header: 'Fecha emisión', key: 'fecha_emision', width: 14 },
      { header: 'Fecha pago', key: 'fecha_pago', width: 14 },
    ];
    rows.forEach((row) => ws.addRow(row));
    await logAuditoria({
      adminId: req.auth.userId,
      accion: 'export',
      modulo: 'facturas',
      detalle: `Exportación facturas ${mes}/${anio}`,
    });
    return sendWorkbook(res, workbook, formatName('facturas', mes, anio));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  exportResumenExcel,
  exportNominaExcel,
  exportGastosExcel,
  exportFacturasExcel,
};
