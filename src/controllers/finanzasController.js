const { pool } = require('../config/database');

function toNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'bigint') return Number(value);
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function toInt(value, fallback = 0) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function getPeriodo(req) {
  const now = new Date();
  const mes = Math.min(12, Math.max(1, toInt(req.query.mes, now.getMonth() + 1)));
  const anio = toInt(req.query.anio, now.getFullYear());
  return { mes, anio };
}

/** Suma horas aprobadas del trabajador en el periodo (mes_nomina / anio_nomina de tareas_aprobadas). */
async function sumHorasAprobadasPeriodo(trabajadorId, mes, anio) {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(dha.horas_trabajadas), 0) AS total
     FROM detalle_horas_aprobadas dha
     JOIN tareas_aprobadas ta ON dha.tarea_aprobada_id = ta.id
     WHERE dha.trabajador_id = ? AND ta.mes_nomina = ? AND ta.anio_nomina = ?`,
    [trabajadorId, mes, anio]
  );
  return toNumber(rows[0]?.total);
}

async function logAuditoria({
  adminId,
  accion,
  modulo,
  registroId = null,
  before = null,
  after = null,
  detalle = null,
}) {
  await pool.query(
    `INSERT INTO finanzas_auditoria
     (admin_id, accion, modulo, registro_id, payload_before, payload_after, detalle)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      adminId,
      accion,
      modulo,
      registroId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      detalle,
    ]
  );
}

const getIngresosTotales = async (req, res, next) => {
  try {
    const query = `
      SELECT
        (SELECT COALESCE(SUM(COALESCE(valor_servicio, 0)), 0) FROM tareas WHERE estado = 'aprobada' AND contrato_id IS NULL) AS sum_tareas,
        (SELECT COUNT(*) FROM tareas WHERE estado = 'aprobada' AND contrato_id IS NULL) AS cnt_tareas,
        (SELECT COALESCE(SUM(COALESCE(valor_servicio, 0)), 0) FROM tareas_aprobadas WHERE tarea_id IN (SELECT id FROM tareas WHERE contrato_id IS NULL)) AS sum_registro,
        (SELECT COUNT(*) FROM tareas_aprobadas) AS cnt_registro
    `;
    const [results] = await pool.query(query);
    const row = results[0] || {};
    const sumTareas = toNumber(row.sum_tareas);
    const sumRegistro = toNumber(row.sum_registro);
    const cntTareas = toInt(row.cnt_tareas);
    const cntRegistro = toInt(row.cnt_registro);

    res.json({
      success: true,
      data: {
        ingresos_totales:
          (sumTareas > 0 ? sumTareas : sumRegistro) +
          toNumber(
            (
              await pool.query(
                `SELECT COALESCE(SUM(monto), 0) AS total
                 FROM finanzas_pagos_contrato
                 WHERE estado_pago = 'pagado'`
              )
            )[0][0]?.total
          ),
        total_tareas_aprobadas: cntTareas > 0 ? cntTareas : cntRegistro,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getResumenPeriodo = async (req, res, next) => {
  try {
    const { mes, anio } = getPeriodo(req);
    const [rows] = await pool.query(
      `SELECT
        (SELECT COALESCE(SUM(valor_servicio), 0) FROM tareas_aprobadas WHERE mes_nomina = ? AND anio_nomina = ? AND tarea_id IN (SELECT id FROM tareas WHERE contrato_id IS NULL)) AS ingresos_tareas,
        (SELECT COALESCE(SUM(monto), 0) FROM finanzas_pagos_contrato WHERE MONTH(fecha_pago) = ? AND YEAR(fecha_pago) = ? AND estado_pago = 'pagado') AS ingresos_contratos,
        (SELECT COALESCE(SUM(monto_neto), 0) FROM finanzas_pagos_nomina WHERE mes = ? AND anio = ?) AS egresos_nomina,
        (SELECT COALESCE(SUM(monto), 0) FROM finanzas_gastos WHERE MONTH(fecha) = ? AND YEAR(fecha) = ?) AS egresos_gastos,
        (SELECT COUNT(*) FROM tareas_aprobadas WHERE mes_nomina = ? AND anio_nomina = ?) AS tareas_aprobadas,
        (SELECT COUNT(*) FROM finanzas_pagos_contrato WHERE MONTH(fecha_pago) = ? AND YEAR(fecha_pago) = ? AND estado_pago = 'pagado') AS contratos_pagados,
        (SELECT COUNT(*) FROM finanzas_pagos_nomina WHERE mes = ? AND anio = ?) AS pagos_nomina,
        (SELECT COUNT(*) FROM finanzas_gastos WHERE MONTH(fecha) = ? AND YEAR(fecha) = ?) AS gastos
      `,
      [mes, anio, mes, anio, mes, anio, mes, anio, mes, anio, mes, anio, mes, anio]
    );
    const r = rows[0] || {};
    const ingresos = toNumber(r.ingresos_tareas) + toNumber(r.ingresos_contratos);
    const egresosNomina = toNumber(r.egresos_nomina);
    const egresosGastos = toNumber(r.egresos_gastos);
    const egresos = egresosNomina + egresosGastos;
    res.json({
      success: true,
      data: {
        periodo: { mes, anio },
        ingresos_periodo: ingresos,
        egresos_nomina_periodo: egresosNomina,
        egresos_gastos_periodo: egresosGastos,
        egresos_periodo: egresos,
        presupuesto_total_periodo: ingresos - egresos,
        tareas_aprobadas: toInt(r.tareas_aprobadas),
        contratos_pagados: toInt(r.contratos_pagados),
        pagos_nomina: toInt(r.pagos_nomina),
        gastos: toInt(r.gastos),
      },
    });
  } catch (error) {
    next(error);
  }
};

const listGastos = async (req, res, next) => {
  try {
    const { mes, anio } = getPeriodo(req);
    const [rows] = await pool.query(
      `SELECT * FROM finanzas_gastos WHERE MONTH(fecha) = ? AND YEAR(fecha) = ? ORDER BY fecha DESC, id DESC`,
      [mes, anio]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

const createGasto = async (req, res, next) => {
  try {
    const { categoria, proveedor, descripcion, monto, fecha, metodo_pago, referencia, comprobante_url } = req.body;
    if (!categoria || !fecha || !Number.isFinite(Number(monto)) || Number(monto) <= 0) {
      return res.status(400).json({ success: false, error: 'Datos de gasto inválidos' });
    }
    const [result] = await pool.query(
      `INSERT INTO finanzas_gastos
      (categoria, proveedor, descripcion, monto, fecha, metodo_pago, referencia, comprobante_url, creado_por_admin_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [categoria, proveedor || null, descripcion || null, Number(monto), fecha, metodo_pago || null, referencia || null, comprobante_url || null, req.auth.userId]
    );
    const [rows] = await pool.query('SELECT * FROM finanzas_gastos WHERE id = ?', [result.insertId]);
    await logAuditoria({
      adminId: req.auth.userId,
      accion: 'create',
      modulo: 'gastos',
      registroId: result.insertId,
      after: rows[0],
    });
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

const updateGasto = async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    const [beforeRows] = await pool.query('SELECT * FROM finanzas_gastos WHERE id = ?', [id]);
    if (beforeRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Gasto no encontrado' });
    }
    const before = beforeRows[0];
    const payload = {
      categoria: req.body.categoria ?? before.categoria,
      proveedor: req.body.proveedor ?? before.proveedor,
      descripcion: req.body.descripcion ?? before.descripcion,
      monto: req.body.monto ?? before.monto,
      fecha: req.body.fecha ?? before.fecha,
      metodo_pago: req.body.metodo_pago ?? before.metodo_pago,
      referencia: req.body.referencia ?? before.referencia,
      comprobante_url: req.body.comprobante_url ?? before.comprobante_url,
    };
    if (!payload.categoria || !payload.fecha || !Number.isFinite(Number(payload.monto)) || Number(payload.monto) <= 0) {
      return res.status(400).json({ success: false, error: 'Datos de gasto inválidos' });
    }
    await pool.query(
      `UPDATE finanzas_gastos
        SET categoria = ?, proveedor = ?, descripcion = ?, monto = ?, fecha = ?, metodo_pago = ?, referencia = ?, comprobante_url = ?
      WHERE id = ?`,
      [payload.categoria, payload.proveedor, payload.descripcion, Number(payload.monto), payload.fecha, payload.metodo_pago, payload.referencia, payload.comprobante_url, id]
    );
    const [afterRows] = await pool.query('SELECT * FROM finanzas_gastos WHERE id = ?', [id]);
    await logAuditoria({
      adminId: req.auth.userId,
      accion: 'update',
      modulo: 'gastos',
      registroId: id,
      before,
      after: afterRows[0],
    });
    return res.json({ success: true, data: afterRows[0] });
  } catch (error) {
    next(error);
  }
};

const deleteGasto = async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    const [beforeRows] = await pool.query('SELECT * FROM finanzas_gastos WHERE id = ?', [id]);
    if (beforeRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Gasto no encontrado' });
    }
    await pool.query('DELETE FROM finanzas_gastos WHERE id = ?', [id]);
    await logAuditoria({
      adminId: req.auth.userId,
      accion: 'delete',
      modulo: 'gastos',
      registroId: id,
      before: beforeRows[0],
    });
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const listNomina = async (req, res, next) => {
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
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

const getNominaHorasPeriodo = async (req, res, next) => {
  try {
    const { mes, anio } = getPeriodo(req);
    const [rows] = await pool.query(
      `SELECT t.id AS trabajador_id, COALESCE(SUM(dha.horas_trabajadas), 0) AS horas
       FROM trabajadores t
       LEFT JOIN detalle_horas_aprobadas dha ON dha.trabajador_id = t.id
       LEFT JOIN tareas_aprobadas ta ON dha.tarea_aprobada_id = ta.id
         AND ta.mes_nomina = ? AND ta.anio_nomina = ?
       WHERE t.activo = 1
       GROUP BY t.id, t.nombre
       ORDER BY t.nombre ASC`,
      [mes, anio]
    );
    const data = rows.map((r) => ({
      trabajador_id: r.trabajador_id,
      horas: toNumber(r.horas),
    }));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getNominaDefaults = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT tarifa_hora_global, fecha_pago_global FROM finanzas_nomina_defaults WHERE id = 1'
    );
    const row = rows[0] || {};
    res.json({
      success: true,
      data: {
        tarifa_hora_global: row.tarifa_hora_global != null ? toNumber(row.tarifa_hora_global) : null,
        fecha_pago_global: row.fecha_pago_global ? String(row.fecha_pago_global).slice(0, 10) : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

const patchNominaDefaults = async (req, res, next) => {
  try {
    const { tarifa_hora_global, fecha_pago_global } = req.body;
    const updates = [];
    const values = [];

    if (tarifa_hora_global !== undefined) {
      if (tarifa_hora_global === null || tarifa_hora_global === '') {
        updates.push('tarifa_hora_global = NULL');
      } else {
        const t = Number(tarifa_hora_global);
        if (!Number.isFinite(t) || t < 0) {
          return res.status(400).json({ success: false, error: 'Tarifa global inválida' });
        }
        updates.push('tarifa_hora_global = ?');
        values.push(t);
      }
    }

    if (fecha_pago_global !== undefined) {
      if (fecha_pago_global === null || fecha_pago_global === '') {
        updates.push('fecha_pago_global = NULL');
      } else {
        updates.push('fecha_pago_global = ?');
        values.push(String(fecha_pago_global).slice(0, 10));
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'Nada que actualizar' });
    }

    values.push(1);
    await pool.query(`UPDATE finanzas_nomina_defaults SET ${updates.join(', ')} WHERE id = ?`, values);

    await logAuditoria({
      adminId: req.auth.userId,
      accion: 'update',
      modulo: 'nomina_defaults',
      detalle: 'Actualización defaults globales nómina',
    });

    const [afterRows] = await pool.query(
      'SELECT tarifa_hora_global, fecha_pago_global FROM finanzas_nomina_defaults WHERE id = 1'
    );
    const row = afterRows[0] || {};
    return res.json({
      success: true,
      data: {
        tarifa_hora_global: row.tarifa_hora_global != null ? toNumber(row.tarifa_hora_global) : null,
        fecha_pago_global: row.fecha_pago_global ? String(row.fecha_pago_global).slice(0, 10) : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

const upsertNomina = async (req, res, next) => {
  try {
    const {
      trabajador_id,
      mes,
      anio,
      tarifa_hora,
      deducciones,
      extras,
      estado_pago,
      fecha_pago,
      referencia_pago,
      comprobante_url,
      notas,
    } = req.body;
    if (!trabajador_id || !mes || !anio) {
      return res.status(400).json({ success: false, error: 'Datos de nómina inválidos' });
    }
    const h = await sumHorasAprobadasPeriodo(trabajador_id, mes, anio);
    const tarifa = Number(tarifa_hora || 0);
    const subtotal = h * tarifa;
    const d = Number(deducciones || 0);
    const e = Number(extras || 0);
    const neto = subtotal - d + e;
    if (!Number.isFinite(neto) || neto < 0) {
      return res.status(400).json({
        success: false,
        error: 'El monto neto no puede ser negativo (revise horas, tarifa, deducciones y extras).',
      });
    }
    const [beforeRows] = await pool.query(
      'SELECT * FROM finanzas_pagos_nomina WHERE trabajador_id = ? AND mes = ? AND anio = ?',
      [trabajador_id, mes, anio]
    );
    await pool.query(
      `INSERT INTO finanzas_pagos_nomina
      (trabajador_id, mes, anio, horas, tarifa_hora, subtotal, deducciones, extras, monto_neto, estado_pago, fecha_pago, referencia_pago, comprobante_url, notas, creado_por_admin_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      horas = VALUES(horas),
      tarifa_hora = VALUES(tarifa_hora),
      subtotal = VALUES(subtotal),
      deducciones = VALUES(deducciones),
      extras = VALUES(extras),
      monto_neto = VALUES(monto_neto),
      estado_pago = VALUES(estado_pago),
      fecha_pago = VALUES(fecha_pago),
      referencia_pago = VALUES(referencia_pago),
      comprobante_url = VALUES(comprobante_url),
      notas = VALUES(notas)`,
      [
        trabajador_id,
        mes,
        anio,
        h,
        tarifa,
        subtotal,
        d,
        e,
        neto,
        estado_pago || 'pendiente',
        fecha_pago || null,
        referencia_pago || null,
        comprobante_url || null,
        notas || null,
        req.auth.userId,
      ]
    );
    const [afterRows] = await pool.query(
      'SELECT * FROM finanzas_pagos_nomina WHERE trabajador_id = ? AND mes = ? AND anio = ?',
      [trabajador_id, mes, anio]
    );
    await logAuditoria({
      adminId: req.auth.userId,
      accion: beforeRows.length > 0 ? 'update' : 'create',
      modulo: 'nomina',
      registroId: afterRows[0].id,
      before: beforeRows[0] || null,
      after: afterRows[0],
    });
    return res.json({ success: true, data: afterRows[0] });
  } catch (error) {
    next(error);
  }
};

const listFacturas = async (req, res, next) => {
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
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

const upsertFactura = async (req, res, next) => {
  try {
    const { tarea_id, numero_factura, estado, fecha_emision, fecha_pago, notas } = req.body;
    if (!tarea_id || !fecha_emision) {
      return res.status(400).json({ success: false, error: 'Datos de facturación inválidos' });
    }
    const [taskRows] = await pool.query(
      `SELECT t.id, t.valor_servicio, t.cliente_id
       FROM tareas t
       WHERE t.id = ? AND t.estado = 'aprobada'`,
      [tarea_id]
    );
    if (taskRows.length === 0) {
      return res.status(400).json({ success: false, error: 'La tarea debe estar aprobada para facturar' });
    }
    const task = taskRows[0];
    const [beforeRows] = await pool.query('SELECT * FROM finanzas_facturas WHERE tarea_id = ?', [tarea_id]);
    await pool.query(
      `INSERT INTO finanzas_facturas
      (tarea_id, cliente_id, numero_factura, monto, estado, fecha_emision, fecha_pago, notas, creado_por_admin_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      numero_factura = VALUES(numero_factura),
      monto = VALUES(monto),
      estado = VALUES(estado),
      fecha_emision = VALUES(fecha_emision),
      fecha_pago = VALUES(fecha_pago),
      notas = VALUES(notas)`,
      [
        tarea_id,
        task.cliente_id,
        numero_factura || null,
        Number(task.valor_servicio || 0),
        estado || 'emitida',
        fecha_emision,
        fecha_pago || null,
        notas || null,
        req.auth.userId,
      ]
    );
    const [afterRows] = await pool.query('SELECT * FROM finanzas_facturas WHERE tarea_id = ?', [tarea_id]);
    await logAuditoria({
      adminId: req.auth.userId,
      accion: beforeRows.length > 0 ? 'update' : 'create',
      modulo: 'facturas',
      registroId: afterRows[0].id,
      before: beforeRows[0] || null,
      after: afterRows[0],
    });
    return res.json({ success: true, data: afterRows[0] });
  } catch (error) {
    next(error);
  }
};

const deleteFactura = async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    const [beforeRows] = await pool.query('SELECT * FROM finanzas_facturas WHERE id = ?', [id]);
    if (beforeRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Factura no encontrada' });
    }
    await pool.query('DELETE FROM finanzas_facturas WHERE id = ?', [id]);
    await logAuditoria({
      adminId: req.auth.userId,
      accion: 'delete',
      modulo: 'facturas',
      registroId: id,
      before: beforeRows[0],
    });
    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const listAuditoria = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, ad.nombre AS admin_nombre
       FROM finanzas_auditoria a
       JOIN administradores ad ON ad.id = a.admin_id
       ORDER BY a.created_at DESC
       LIMIT 200`
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
  logAuditoria,
};

