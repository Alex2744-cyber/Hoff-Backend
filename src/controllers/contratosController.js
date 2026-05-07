const { pool } = require('../config/database');

function toNumber(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDateOnly(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

const createContrato = async (req, res, next) => {
  try {
    const {
      cliente_id,
      direccion_id,
      descripcion_contrato,
      valor_contrato,
      fecha_inicio,
      fecha_fin,
      estado,
    } = req.body;

    if (!cliente_id || !descripcion_contrato || valor_contrato == null) {
      return res.status(400).json({ success: false, error: 'Faltan campos requeridos del contrato' });
    }
    const valor = toNumber(valor_contrato, -1);
    if (valor < 0) {
      return res.status(400).json({ success: false, error: 'valor_contrato debe ser mayor o igual a 0' });
    }

    const estadoFinal = ['borrador', 'activo', 'cerrado', 'pagado', 'anulado'].includes(estado)
      ? estado
      : 'activo';

    const [result] = await pool.query(
      `INSERT INTO contratos
       (cliente_id, direccion_id, descripcion_contrato, valor_contrato, estado, fecha_inicio, fecha_fin, creado_por_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cliente_id,
        direccion_id || null,
        String(descripcion_contrato).trim(),
        valor,
        estadoFinal,
        normalizeDateOnly(fecha_inicio),
        normalizeDateOnly(fecha_fin),
        req.auth.userId,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Contrato creado exitosamente',
      data: { id: result.insertId },
    });
  } catch (error) {
    next(error);
  }
};

const createContratoTareas = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const contratoId = Number(req.params.id);
    const {
      cliente_id,
      direccion_id,
      descripcion_general,
      detalles_especificos,
      numero_horas,
      fechas,
    } = req.body;

    if (!Number.isFinite(contratoId) || contratoId <= 0) {
      return res.status(400).json({ success: false, error: 'ID de contrato inválido' });
    }
    if (!cliente_id || !direccion_id || !descripcion_general || !Array.isArray(fechas) || fechas.length === 0) {
      return res.status(400).json({ success: false, error: 'Faltan datos para crear tareas del contrato' });
    }

    await conn.beginTransaction();
    const [contratoRows] = await conn.query('SELECT id, cliente_id, estado FROM contratos WHERE id = ?', [contratoId]);
    if (contratoRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Contrato no encontrado' });
    }
    const contrato = contratoRows[0];
    if (Number(contrato.cliente_id) !== Number(cliente_id)) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'El contrato no pertenece al cliente indicado' });
    }
    if (['cerrado', 'pagado', 'anulado'].includes(String(contrato.estado))) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'No se pueden crear tareas para este contrato' });
    }

    const createdIds = [];
    for (const rawFecha of fechas) {
      const fecha = normalizeDateOnly(rawFecha);
      if (!fecha) continue;
      // eslint-disable-next-line no-await-in-loop
      const [ins] = await conn.query(
        `INSERT INTO tareas
         (cliente_id, direccion_id, contrato_id, fecha_realizacion, descripcion_general, detalles_especificos, numero_horas, valor_servicio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cliente_id,
          direccion_id,
          contratoId,
          fecha,
          String(descripcion_general).trim(),
          detalles_especificos ? String(detalles_especificos).trim() : null,
          numero_horas != null && numero_horas !== '' ? toNumber(numero_horas) : null,
          0,
        ]
      );
      createdIds.push(ins.insertId);
    }

    if (createdIds.length === 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'No se generaron tareas válidas' });
    }

    await conn.commit();
    return res.status(201).json({
      success: true,
      message: 'Tareas del contrato creadas exitosamente',
      data: { contrato_id: contratoId, tareas_ids: createdIds, total: createdIds.length },
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

const getContratoById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(
      `SELECT c.*, cl.nombre AS cliente_nombre, d.direccion_completa
       FROM contratos c
       JOIN clientes cl ON cl.id = c.cliente_id
       LEFT JOIN direcciones d ON d.id = c.direccion_id
       WHERE c.id = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contrato no encontrado' });
    }
    const [tareas] = await pool.query(
      `SELECT id, fecha_realizacion, estado, descripcion_general, valor_servicio
       FROM tareas
       WHERE contrato_id = ?
       ORDER BY fecha_realizacion DESC, id DESC`,
      [id]
    );
    return res.json({ success: true, data: { ...rows[0], tareas } });
  } catch (error) {
    next(error);
  }
};

const listContratosByCliente = async (req, res, next) => {
  try {
    const clienteId = Number(req.params.id || req.params.clienteId);
    const [rows] = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM tareas t WHERE t.contrato_id = c.id) AS total_tareas
       FROM contratos c
       WHERE c.cliente_id = ?
       ORDER BY c.created_at DESC, c.id DESC`,
      [clienteId]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

const updateContrato = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(
      'SELECT id, estado, subido_registro_permanente FROM contratos WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contrato no encontrado' });
    }
    const contrato = rows[0];
    if (contrato.subido_registro_permanente || ['cerrado', 'pagado', 'anulado'].includes(String(contrato.estado))) {
      return res.status(400).json({ success: false, error: 'El contrato ya no permite edición financiera' });
    }

    const updates = [];
    const values = [];
    if (req.body.descripcion_contrato !== undefined) {
      updates.push('descripcion_contrato = ?');
      values.push(String(req.body.descripcion_contrato || '').trim());
    }
    if (req.body.valor_contrato !== undefined) {
      const v = toNumber(req.body.valor_contrato, -1);
      if (v < 0) {
        return res.status(400).json({ success: false, error: 'valor_contrato debe ser mayor o igual a 0' });
      }
      updates.push('valor_contrato = ?');
      values.push(v);
    }
    if (req.body.fecha_inicio !== undefined) {
      updates.push('fecha_inicio = ?');
      values.push(normalizeDateOnly(req.body.fecha_inicio));
    }
    if (req.body.fecha_fin !== undefined) {
      updates.push('fecha_fin = ?');
      values.push(normalizeDateOnly(req.body.fecha_fin));
    }
    if (req.body.estado !== undefined) {
      const estado = String(req.body.estado);
      if (['borrador', 'activo', 'cerrado', 'pagado', 'anulado'].includes(estado)) {
        updates.push('estado = ?');
        values.push(estado);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay campos para actualizar' });
    }

    values.push(id);
    await pool.query(`UPDATE contratos SET ${updates.join(', ')} WHERE id = ?`, values);
    return res.json({ success: true, message: 'Contrato actualizado' });
  } catch (error) {
    next(error);
  }
};

const pagarContrato = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    const [rows] = await conn.query(
      'SELECT id, cliente_id, valor_contrato, estado FROM contratos WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contrato no encontrado' });
    }
    const contrato = rows[0];
    if (String(contrato.estado) === 'pagado') {
      return res.status(400).json({ success: false, error: 'El contrato ya está pagado' });
    }

    const monto = req.body.monto != null ? toNumber(req.body.monto, -1) : toNumber(contrato.valor_contrato, 0);
    if (monto < 0) {
      return res.status(400).json({ success: false, error: 'monto inválido' });
    }
    const fechaPago = normalizeDateOnly(req.body.fecha_pago) || new Date().toISOString().slice(0, 10);

    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO finanzas_pagos_contrato
       (contrato_id, cliente_id, monto, estado_pago, fecha_pago, referencia_pago, comprobante_url, notas, creado_por_admin_id)
       VALUES (?, ?, ?, 'pagado', ?, ?, ?, ?, ?)`,
      [
        id,
        contrato.cliente_id,
        monto,
        fechaPago,
        req.body.referencia_pago || null,
        req.body.comprobante_url || null,
        req.body.notas || null,
        req.auth.userId,
      ]
    );
    await conn.query(
      `UPDATE contratos
       SET estado = 'pagado', fecha_pago = ?, referencia_pago = ?, notas_pago = ?
       WHERE id = ?`,
      [fechaPago, req.body.referencia_pago || null, req.body.notas || null, id]
    );
    await conn.commit();
    return res.json({ success: true, message: 'Contrato marcado como pagado' });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

const cerrarContrato = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await pool.query(
      `UPDATE contratos
       SET estado = 'cerrado', subido_registro_permanente = TRUE
       WHERE id = ?`,
      [id]
    );
    return res.json({ success: true, message: 'Contrato cerrado y bloqueado para edición financiera' });
  } catch (error) {
    next(error);
  }
};

const removeContratoTarea = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const contratoId = Number(req.params.id);
    const tareaId = Number(req.params.tareaId);
    if (!Number.isFinite(contratoId) || contratoId <= 0 || !Number.isFinite(tareaId) || tareaId <= 0) {
      return res.status(400).json({ success: false, error: 'IDs inválidos' });
    }

    await conn.beginTransaction();
    const [tRows] = await conn.query(
      `SELECT id, contrato_id, estado, evidencia_path
       FROM tareas
       WHERE id = ? FOR UPDATE`,
      [tareaId]
    );
    if (tRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Tarea no encontrada' });
    }
    const tarea = tRows[0];
    if (Number(tarea.contrato_id) !== contratoId) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'La tarea no pertenece al contrato indicado' });
    }

    const estado = String(tarea.estado || '').toLowerCase();
    if (!['pendiente', 'asignada'].includes(estado)) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden quitar tareas en estado pendiente o asignada',
      });
    }

    const [evRows] = await conn.query('SELECT COUNT(*) AS total FROM tarea_evidencia WHERE tarea_id = ?', [tareaId]);
    const evidenciasCount = Number(evRows[0]?.total || 0);
    const hasLegacyEvidence = Boolean(tarea.evidencia_path && String(tarea.evidencia_path).trim());
    if (evidenciasCount > 0 || hasLegacyEvidence) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        error: 'No se puede quitar: la tarea tiene evidencias registradas',
      });
    }

    await conn.query('DELETE FROM tarea_trabajadores WHERE tarea_id = ?', [tareaId]);
    await conn.query('DELETE FROM tareas WHERE id = ?', [tareaId]);
    await conn.commit();
    return res.json({ success: true, message: 'Tarea quitada del contrato y eliminada' });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

module.exports = {
  createContrato,
  createContratoTareas,
  getContratoById,
  listContratosByCliente,
  updateContrato,
  pagarContrato,
  cerrarContrato,
  removeContratoTarea,
};
