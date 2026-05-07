const path = require('path');
const fs = require('fs').promises;
const { pool } = require('../config/database');
const { getUploadRoot } = require('../config/upload');

function normalizeEvidencePath(relPath) {
  const raw = String(relPath || '').trim();
  if (!raw.startsWith('/uploads/media/')) return null;
  const relativeToUploads = raw.replace(/^\/uploads\//, '');
  const absolute = path.resolve(getUploadRoot(), relativeToUploads);
  const mediaRoot = path.resolve(getUploadRoot(), 'media');
  if (!absolute.startsWith(mediaRoot)) return null;
  return absolute;
}

async function safeDeleteEvidenceFile(relPath) {
  const absolute = normalizeEvidencePath(relPath);
  if (!absolute) return;
  await fs.unlink(absolute).catch(() => {});
}

const MAX_TAREA_EVIDENCIAS = 5;

/** Body opcional `hora_inicio` → valor SQL TIME o null; `skip` si no viene la clave. */
function parseHoraInicioBody(value) {
  if (value === undefined) return { skip: true };
  if (value === null || value === '') return { ok: true, sql: null };
  const s = String(value).trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return { ok: false, error: 'hora_inicio debe ser HH:MM (ej. 09:30)' };
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) {
    return { ok: false, error: 'hora_inicio fuera de rango' };
  }
  return {
    ok: true,
    sql: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`,
  };
}

/** Normaliza TIME de MySQL a string HH:MM para JSON. */
function formatHoraInicioRow(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const H = val.getHours();
    const M = val.getMinutes();
    return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
  }
  if (typeof val === 'object' && val !== null) {
    const H = val.hours ?? val.Hours;
    const M = val.minutes ?? val.Minutes;
    if (H !== undefined && M !== undefined) {
      return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
    }
  }
  const str = String(val);
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(str);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function mapTrabajadoresHoraInicio(rows) {
  return rows.map((r) => ({
    ...r,
    hora_inicio: formatHoraInicioRow(r.hora_inicio),
  }));
}

/**
 * Borra filas y archivos en disco para la tarea.
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} q pool o conexión con transacción
 */
async function removeAllEvidencesForTarea(tareaId, q) {
  const [rows] = await q.query('SELECT path FROM tarea_evidencia WHERE tarea_id = ?', [tareaId]);
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    await safeDeleteEvidenceFile(row.path);
  }
  await q.query('DELETE FROM tarea_evidencia WHERE tarea_id = ?', [tareaId]);
}

// Obtener todas las tareas
const getAllTareas = async (req, res, next) => {
  try {
    const query = 'SELECT * FROM vista_tareas_completas ORDER BY fecha_realizacion DESC';
    const [results] = await pool.query(query);
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

// Obtener tarea por ID
const getTareaById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const auth = req.auth;
    const isTrabajador = auth && auth.tipo === 'trabajador';

    if (isTrabajador) {
      const [asigRows] = await pool.query(
        'SELECT 1 FROM tarea_trabajadores WHERE tarea_id = ? AND trabajador_id = ?',
        [id, auth.userId]
      );
      if (asigRows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Tarea no encontrada',
        });
      }

      const queryTarea = `
        SELECT t.id, t.contrato_id, t.fecha_realizacion, t.fecha_creacion, t.descripcion_general, t.detalles_especificos,
               t.estado, t.comentarios_trabajador, t.mensaje_rechazo,
               t.evidencia_url, t.evidencia_path, t.evidencia_subida_at, t.aprobada_por, t.fecha_aprobacion,
               d.direccion_completa, d.ciudad, d.codigo_postal
        FROM tareas t
        JOIN direcciones d ON t.direccion_id = d.id
        WHERE t.id = ?
      `;
      const [results] = await pool.query(queryTarea, [id]);
      if (results.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Tarea no encontrada',
        });
      }

      const queryTrabajadores = `
        SELECT tr.id, tr.nombre, tr.foto_perfil,
               tt.horas_asignadas, tt.horas_aprobadas, tt.hora_inicio
        FROM trabajadores tr
        JOIN tarea_trabajadores tt ON tr.id = tt.trabajador_id
        WHERE tt.tarea_id = ? AND tr.id = ?
      `;
      const [trabajadoresRaw] = await pool.query(queryTrabajadores, [id, auth.userId]);
      const trabajadores = mapTrabajadoresHoraInicio(trabajadoresRaw);

      const tareaData = {
        ...results[0],
        trabajadores,
      };

      const [evidencias] = await pool.query(
        'SELECT id, url, path, sort_order FROM tarea_evidencia WHERE tarea_id = ? ORDER BY sort_order ASC, id ASC',
        [id]
      );
      tareaData.evidencias = evidencias;

      if (results[0].estado === 'aprobada') {
        const queryAprobada = `
          SELECT ta.id as aprobacion_id,
                 ta.admin_nombre as aprobado_por_nombre,
                 ta.fecha_aprobacion,
                 ta.notas_aprobacion
          FROM tareas_aprobadas ta
          WHERE ta.tarea_id = ?
          LIMIT 1
        `;
        const [aprobadaData] = await pool.query(queryAprobada, [id]);

        if (aprobadaData.length > 0) {
          tareaData.registro_aprobacion = {
            aprobacion_id: aprobadaData[0].aprobacion_id,
            aprobado_por_nombre: aprobadaData[0].aprobado_por_nombre,
            fecha_aprobacion: aprobadaData[0].fecha_aprobacion,
            notas_aprobacion: aprobadaData[0].notas_aprobacion,
          };

          const queryHorasAprobadas = `
            SELECT dha.trabajador_id,
                   tr.nombre as trabajador_nombre,
                   dha.horas_trabajadas as horas_aprobadas_finales
            FROM detalle_horas_aprobadas dha
            JOIN trabajadores tr ON dha.trabajador_id = tr.id
            WHERE dha.tarea_aprobada_id = ? AND dha.trabajador_id = ?
          `;
          const [horasAprobadas] = await pool.query(queryHorasAprobadas, [
            aprobadaData[0].aprobacion_id,
            auth.userId,
          ]);
          tareaData.horas_aprobadas_finales = horasAprobadas;
        }
      }

      return res.json({
        success: true,
        data: tareaData,
      });
    }

    const query = `
      SELECT t.*, 
             c.nombre as cliente_nombre, 
             c.tipo as cliente_tipo,
             c.telefono as cliente_telefono,
             c.email as cliente_email,
             c.administrador_nombre as cliente_administrador_nombre,
             c.administrador_telefono as cliente_administrador_telefono,
             c.administrador_email as cliente_administrador_email,
             d.direccion_completa, 
             d.ciudad, 
             d.codigo_postal
      FROM tareas t
      JOIN clientes c ON t.cliente_id = c.id
      JOIN direcciones d ON t.direccion_id = d.id
      WHERE t.id = ?
    `;

    const [results] = await pool.query(query, [id]);

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada',
      });
    }

    const queryTrabajadores = `
      SELECT tr.id, tr.nombre, tr.foto_perfil,
             tt.horas_asignadas, tt.horas_aprobadas, tt.hora_inicio, tt.notas
      FROM trabajadores tr
      JOIN tarea_trabajadores tt ON tr.id = tt.trabajador_id
      WHERE tt.tarea_id = ?
    `;
    const [trabajadoresRaw] = await pool.query(queryTrabajadores, [id]);
    const trabajadores = mapTrabajadoresHoraInicio(trabajadoresRaw);

    const tareaData = {
      ...results[0],
      trabajadores,
    };

    const [evidencias] = await pool.query(
      'SELECT id, url, path, sort_order FROM tarea_evidencia WHERE tarea_id = ? ORDER BY sort_order ASC, id ASC',
      [id]
    );
    tareaData.evidencias = evidencias;

    if (results[0].estado === 'aprobada') {
      const queryAprobada = `
        SELECT ta.id as aprobacion_id,
               ta.admin_nombre as aprobado_por_nombre,
               ta.fecha_aprobacion,
               ta.notas_aprobacion,
               ta.total_horas_trabajadas,
               ta.numero_trabajadores,
               ta.mes_nomina,
               ta.anio_nomina,
               ta.estado_pago,
               ta.fecha_pago,
               ta.referencia_pago
        FROM tareas_aprobadas ta
        WHERE ta.tarea_id = ?
        LIMIT 1
      `;
      const [aprobadaData] = await pool.query(queryAprobada, [id]);

      if (aprobadaData.length > 0) {
        tareaData.registro_aprobacion = aprobadaData[0];

        const queryHorasAprobadas = `
          SELECT dha.trabajador_id,
                 tr.nombre as trabajador_nombre,
                 dha.horas_trabajadas as horas_aprobadas_finales
          FROM detalle_horas_aprobadas dha
          JOIN trabajadores tr ON dha.trabajador_id = tr.id
          WHERE dha.tarea_aprobada_id = ?
        `;
        const [horasAprobadas] = await pool.query(queryHorasAprobadas, [aprobadaData[0].aprobacion_id]);

        tareaData.horas_aprobadas_finales = horasAprobadas;
      }
    }

    res.json({
      success: true,
      data: tareaData,
    });
  } catch (error) {
    next(error);
  }
};

// Crear nueva tarea
const createTarea = async (req, res, next) => {
  try {
    const {
      cliente_id,
      direccion_id,
      contrato_id,
      fecha_realizacion,
      descripcion_general,
      detalles_especificos,
      numero_horas,
      valor_servicio,
      trabajadores // Array de IDs de trabajadores (opcional)
    } = req.body;

    // Validar campos requeridos
    if (!cliente_id || !direccion_id || !fecha_realizacion || !descripcion_general) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos'
      });
    }
    const valorParsed = Number(valor_servicio);
    if (!contrato_id && (!Number.isFinite(valorParsed) || valorParsed <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'valor_servicio debe ser mayor a 0 para tareas sin contrato',
      });
    }
    if (contrato_id && (!Number.isFinite(valorParsed) || valorParsed < 0)) {
      return res.status(400).json({
        success: false,
        error: 'valor_servicio inválido para tarea contractual',
      });
    }

    const query = `
      INSERT INTO tareas 
      (cliente_id, direccion_id, contrato_id, fecha_realizacion, descripcion_general, detalles_especificos, numero_horas, valor_servicio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(query, [
      cliente_id,
      direccion_id,
      contrato_id || null,
      fecha_realizacion,
      descripcion_general,
      detalles_especificos || null,
      numero_horas || null,
      valor_servicio
    ]);

    const tareaId = result.insertId;

    // Nota: Los trabajadores ahora se asignan usando el endpoint asignarTrabajador
    // para poder especificar horas_asignadas individuales

    res.status(201).json({
      success: true,
      message: 'Tarea creada exitosamente',
      data: {
        id: tareaId
      }
    });
  } catch (error) {
    next(error);
  }
};

// Actualizar tarea
const updateTarea = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      fecha_realizacion,
      descripcion_general,
      detalles_especificos,
      numero_horas,
      valor_servicio,
      estado
    } = req.body;

    const updates = [];
    const values = [];

    if (fecha_realizacion) {
      updates.push('fecha_realizacion = ?');
      values.push(fecha_realizacion);
    }
    if (descripcion_general) {
      updates.push('descripcion_general = ?');
      values.push(descripcion_general);
    }
    if (detalles_especificos !== undefined) {
      updates.push('detalles_especificos = ?');
      values.push(detalles_especificos);
    }
    if (numero_horas !== undefined) {
      updates.push('numero_horas = ?');
      values.push(numero_horas);
    }
    if (valor_servicio) {
      updates.push('valor_servicio = ?');
      values.push(valor_servicio);
    }
    if (estado) {
      updates.push('estado = ?');
      values.push(estado);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar'
      });
    }

    values.push(id);
    const query = `UPDATE tareas SET ${updates.join(', ')} WHERE id = ?`;

    await pool.query(query, values);

    res.json({
      success: true,
      message: 'Tarea actualizada exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// Eliminar tarea
const deleteTarea = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verificar que la tarea existe
    const [tarea] = await pool.query('SELECT estado FROM tareas WHERE id = ?', [id]);
    
    if (tarea.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    // Cambiar estado a 'cancelada' en vez de eliminar
    await pool.query(
      "UPDATE tareas SET estado = 'cancelada' WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: 'Tarea cancelada exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// Obtener tareas por trabajador
const getTareasByTrabajador = async (req, res, next) => {
  try {
    const { trabajadorId } = req.params;
    const tid = Number(trabajadorId);
    if (!Number.isFinite(tid) || tid <= 0) {
      return res.status(400).json({
        success: false,
        error: 'ID de trabajador inválido',
      });
    }

    if (req.auth.tipo === 'trabajador' && req.auth.userId !== tid) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado',
      });
    }

    if (req.auth.tipo === 'trabajador') {
      const query = `
        SELECT t.id, t.fecha_realizacion, t.fecha_creacion, t.descripcion_general, t.estado,
               t.comentarios_trabajador, t.mensaje_rechazo,
               d.direccion_completa, d.ciudad,
               tt.horas_asignadas, tt.horas_aprobadas, tt.hora_inicio
        FROM tareas t
        JOIN tarea_trabajadores tt ON t.id = tt.tarea_id
        JOIN direcciones d ON t.direccion_id = d.id
        WHERE tt.trabajador_id = ?
        ORDER BY t.fecha_realizacion DESC
      `;
      const [results] = await pool.query(query, [tid]);
      const data = results.map((row) => ({
        ...row,
        hora_inicio: formatHoraInicioRow(row.hora_inicio),
      }));
      return res.json({
        success: true,
        data,
      });
    }

    const query = `
      SELECT t.*, 
             c.nombre as cliente_nombre,
             d.direccion_completa,
             d.ciudad,
             tt.horas_asignadas,
             tt.horas_aprobadas,
             tt.hora_inicio
      FROM tareas t
      JOIN tarea_trabajadores tt ON t.id = tt.tarea_id
      JOIN clientes c ON t.cliente_id = c.id
      JOIN direcciones d ON t.direccion_id = d.id
      WHERE tt.trabajador_id = ?
      ORDER BY t.fecha_realizacion DESC
    `;

    const [results] = await pool.query(query, [tid]);
    const data = results.map((row) => ({
      ...row,
      hora_inicio: formatHoraInicioRow(row.hora_inicio),
    }));

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

// Asignar trabajador a tarea
const asignarTrabajador = async (req, res, next) => {
  try {
    const { tareaId } = req.params;
    const { trabajador_id, horas_asignadas, notas, hora_inicio } = req.body;

    if (!trabajador_id) {
      return res.status(400).json({
        success: false,
        error: 'trabajador_id es requerido'
      });
    }

    const hiParsed = parseHoraInicioBody(hora_inicio);
    if (!hiParsed.skip && !hiParsed.ok) {
      return res.status(400).json({ success: false, error: hiParsed.error });
    }
    const horaInicioSql = hiParsed.skip ? null : hiParsed.sql;

    // Verificar si ya está asignado
    const [existing] = await pool.query(
      'SELECT * FROM tarea_trabajadores WHERE tarea_id = ? AND trabajador_id = ?',
      [tareaId, trabajador_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'El trabajador ya está asignado a esta tarea'
      });
    }

    const [tareaRows] = await pool.query('SELECT numero_horas FROM tareas WHERE id = ?', [tareaId]);
    if (tareaRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    const numeroHorasRaw = tareaRows[0].numero_horas;
    const numeroHoras =
      numeroHorasRaw != null && numeroHorasRaw !== ''
        ? parseFloat(numeroHorasRaw)
        : null;

    let finalHoras = null;
    const bodyHoras =
      horas_asignadas !== undefined && horas_asignadas !== null && horas_asignadas !== ''
        ? parseFloat(horas_asignadas)
        : NaN;

    if (!Number.isNaN(bodyHoras)) {
      if (numeroHoras != null && !Number.isNaN(numeroHoras)) {
        finalHoras = Math.min(bodyHoras, numeroHoras);
      } else {
        finalHoras = bodyHoras;
      }
    } else {
      if (numeroHoras != null && !Number.isNaN(numeroHoras)) {
        finalHoras = numeroHoras;
      }
    }

    const query =
      'INSERT INTO tarea_trabajadores (tarea_id, trabajador_id, horas_asignadas, hora_inicio, notas) VALUES (?, ?, ?, ?, ?)';
    await pool.query(query, [tareaId, trabajador_id, finalHoras, horaInicioSql, notas || null]);

    // Actualizar estado de la tarea a 'asignada' si estaba 'pendiente'
    await pool.query(
      "UPDATE tareas SET estado = 'asignada' WHERE id = ? AND estado = 'pendiente'",
      [tareaId]
    );

    res.json({
      success: true,
      message: 'Trabajador asignado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// Desasignar trabajador de tarea
const desasignarTrabajador = async (req, res, next) => {
  try {
    const { tareaId, trabajadorId } = req.params;

    // Verificar que la tarea existe
    const [tarea] = await pool.query('SELECT estado FROM tareas WHERE id = ?', [tareaId]);
    if (tarea.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    // Eliminar la asignación
    const query = 'DELETE FROM tarea_trabajadores WHERE tarea_id = ? AND trabajador_id = ?';
    await pool.query(query, [tareaId, trabajadorId]);

    // Verificar si quedan trabajadores asignados
    const [asignaciones] = await pool.query(
      'SELECT COUNT(*) as count FROM tarea_trabajadores WHERE tarea_id = ?',
      [tareaId]
    );

    // Si no quedan trabajadores y la tarea estaba asignada, volver a pendiente
    if (asignaciones[0].count === 0 && tarea[0].estado === 'asignada') {
      await pool.query(
        "UPDATE tareas SET estado = 'pendiente' WHERE id = ?",
        [tareaId]
      );
    }

    res.json({
      success: true,
      message: 'Trabajador desasignado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// Actualizar horas asignadas de un trabajador
const actualizarHorasTrabajador = async (req, res, next) => {
  try {
    const { tareaId, trabajadorId } = req.params;
    const { horas_asignadas, hora_inicio } = req.body;

    if (
      horas_asignadas === undefined &&
      hora_inicio === undefined
    ) {
      return res.status(400).json({
        success: false,
        error: 'Indica horas_asignadas y/o hora_inicio',
      });
    }

    const hiParsed = parseHoraInicioBody(hora_inicio);
    if (!hiParsed.skip && !hiParsed.ok) {
      return res.status(400).json({ success: false, error: hiParsed.error });
    }

    // Verificar que la tarea existe
    const [tarea] = await pool.query('SELECT estado FROM tareas WHERE id = ?', [tareaId]);
    if (tarea.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    // Verificar que el trabajador está asignado
    const [asignacion] = await pool.query(
      'SELECT * FROM tarea_trabajadores WHERE tarea_id = ? AND trabajador_id = ?',
      [tareaId, trabajadorId]
    );

    if (asignacion.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'El trabajador no está asignado a esta tarea'
      });
    }

    // Solo permitir modificar horas si la tarea no ha sido iniciada por el trabajador
    // (estado 'pendiente' o 'asignada' o si el trabajador no ha iniciado aún)
    const estadoTarea = tarea[0].estado;
    if (estadoTarea === 'completada' || estadoTarea === 'aprobada') {
      return res.status(400).json({
        success: false,
        error: 'No se pueden modificar las horas de una tarea completada o aprobada'
      });
    }

    // Validar horas si se proporcionan
    if (horas_asignadas !== undefined && horas_asignadas !== null) {
      const horasNum = parseFloat(horas_asignadas);
      if (isNaN(horasNum) || horasNum < 0) {
        return res.status(400).json({
          success: false,
          error: 'Las horas asignadas deben ser un número mayor o igual a 0'
        });
      }

      // Opcional: Validar contra numero_horas de la tarea si existe
      const [tareaInfo] = await pool.query('SELECT numero_horas FROM tareas WHERE id = ?', [tareaId]);
      if (tareaInfo[0].numero_horas && horasNum > parseFloat(tareaInfo[0].numero_horas)) {
        return res.status(400).json({
          success: false,
          error: `Las horas asignadas no pueden superar las horas estimadas de la tarea (${tareaInfo[0].numero_horas}h)`
        });
      }
    }

    const sets = [];
    const vals = [];
    if (horas_asignadas !== undefined && horas_asignadas !== null) {
      const horasNum = parseFloat(horas_asignadas);
      sets.push('horas_asignadas = ?');
      vals.push(Number.isNaN(horasNum) ? null : horasNum);
    }
    if (hora_inicio !== undefined) {
      sets.push('hora_inicio = ?');
      vals.push(hiParsed.ok ? hiParsed.sql : null);
    }
    if (sets.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay cambios que aplicar',
      });
    }
    vals.push(tareaId, trabajadorId);
    const query = `UPDATE tarea_trabajadores SET ${sets.join(', ')} WHERE tarea_id = ? AND trabajador_id = ?`;
    await pool.query(query, vals);

    res.json({
      success: true,
      message: 'Asignación actualizada exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// Buscar tareas por dirección
const buscarTareasPorDireccion = async (req, res, next) => {
  try {
    const { busqueda } = req.query;

    if (!busqueda) {
      return res.status(400).json({
        success: false,
        error: 'Parámetro de búsqueda requerido'
      });
    }

    const query = `
      SELECT t.*, 
             c.nombre as cliente_nombre,
             d.direccion_completa,
             d.ciudad
      FROM tareas t
      JOIN clientes c ON t.cliente_id = c.id
      JOIN direcciones d ON t.direccion_id = d.id
      WHERE d.direccion_completa LIKE ? 
         OR d.calle LIKE ?
         OR d.ciudad LIKE ?
      ORDER BY t.fecha_realizacion DESC
    `;

    const searchTerm = `%${busqueda}%`;
    const [results] = await pool.query(query, [searchTerm, searchTerm, searchTerm]);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

// Completar tarea (trabajador marca que terminó)
const completarTarea = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { trabajador_id, comentarios, evidencias, evidencia_url, evidencia_path } = req.body;

    // Verificar que la tarea existe
    const [tarea] = await pool.query(
      'SELECT estado, mensaje_rechazo FROM tareas WHERE id = ?',
      [id]
    );

    if (tarea.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    // Permitir completar si está asignada O si está completada pero tiene mensaje_rechazo (fue devuelta)
    const puedeCompletar = tarea[0].estado === 'asignada' ||
                           (tarea[0].estado === 'completada' && tarea[0].mensaje_rechazo);

    if (!puedeCompletar) {
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden completar tareas asignadas o tareas devueltas por el administrador'
      });
    }

    // Verificar que el trabajador está asignado a esta tarea
    const [asignacion] = await pool.query(
      'SELECT * FROM tarea_trabajadores WHERE tarea_id = ? AND trabajador_id = ?',
      [id, trabajador_id]
    );

    if (asignacion.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para completar esta tarea'
      });
    }

    let items = Array.isArray(evidencias) ? [...evidencias] : [];
    if (
      items.length === 0 &&
      typeof evidencia_url === 'string' &&
      evidencia_url.trim() &&
      typeof evidencia_path === 'string' &&
      evidencia_path.trim()
    ) {
      items = [{ url: evidencia_url.trim(), path: evidencia_path.trim() }];
    }
    if (items.length > MAX_TAREA_EVIDENCIAS) {
      return res.status(400).json({
        success: false,
        error: `Máximo ${MAX_TAREA_EVIDENCIAS} imágenes de evidencia por tarea`,
      });
    }
    for (let i = 0; i < items.length; i += 1) {
      const e = items[i];
      if (!e || typeof e.url !== 'string' || !e.url.trim() || typeof e.path !== 'string' || !e.path.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Cada evidencia debe incluir url y path',
        });
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await removeAllEvidencesForTarea(id, conn);

      const [legacyRow] = await conn.query('SELECT evidencia_path FROM tareas WHERE id = ?', [id]);
      const legacyPath = legacyRow?.[0]?.evidencia_path || null;
      if (legacyPath) {
        await safeDeleteEvidenceFile(legacyPath);
      }

      for (let i = 0; i < items.length; i += 1) {
        const e = items[i];
        // eslint-disable-next-line no-await-in-loop
        await conn.query(
          'INSERT INTO tarea_evidencia (tarea_id, url, path, sort_order) VALUES (?, ?, ?, ?)',
          [id, e.url.trim(), e.path.trim(), i]
        );
      }

      await conn.query(
        `UPDATE tareas
         SET estado = ?,
             comentarios_trabajador = ?,
             mensaje_rechazo = NULL,
             evidencia_url = NULL,
             evidencia_path = NULL,
             evidencia_subida_at = NULL
         WHERE id = ?`,
        ['completada', comentarios || null, id]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.json({
      success: true,
      message: 'Tarea completada exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// Aprobar tarea (admin aprueba trabajo completado)
const aprobarTarea = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { admin_id, notas_aprobacion, horas_trabajadores } = req.body;

    if (!admin_id) {
      return res.status(400).json({
        success: false,
        error: 'admin_id es requerido'
      });
    }

    // Actualizar horas_aprobadas si el admin las ajustó
    if (horas_trabajadores && Array.isArray(horas_trabajadores) && horas_trabajadores.length > 0) {
      for (const item of horas_trabajadores) {
        await pool.query(
          'UPDATE tarea_trabajadores SET horas_aprobadas = ? WHERE tarea_id = ? AND trabajador_id = ?',
          [item.horas, id, item.trabajador_id]
        );
      }
    }

    // Llamar al procedimiento almacenado
    const [result] = await pool.query(
      'CALL aprobar_tarea(?, ?, ?)',
      [id, admin_id, notas_aprobacion || null]
    );

    res.json({
      success: true,
      message: 'Tarea aprobada exitosamente',
      data: result[0][0]
    });
  } catch (error) {
    // El procedimiento lanza errores descriptivos
    if (error.sqlMessage) {
      return res.status(400).json({
        success: false,
        error: error.sqlMessage
      });
    }
    next(error);
  }
};

// Devolver tarea completada (admin devuelve tarea con mensaje)
const devolverTarea = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { admin_id, mensaje, estado_anterior } = req.body;

    if (!admin_id || !mensaje) {
      return res.status(400).json({
        success: false,
        error: 'admin_id y mensaje son requeridos'
      });
    }

    // Verificar que la tarea existe y está completada
    const [tarea] = await pool.query(
      'SELECT estado FROM tareas WHERE id = ?',
      [id]
    );

    if (tarea.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    if (tarea[0].estado !== 'completada') {
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden devolver tareas completadas'
      });
    }

    // Verificar que el admin existe
    const [admin] = await pool.query(
      'SELECT id FROM administradores WHERE id = ?',
      [admin_id]
    );

    if (admin.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Administrador no encontrado'
      });
    }

    const [tareaPaths] = await pool.query('SELECT evidencia_path FROM tareas WHERE id = ?', [id]);
    const legacyPath = tareaPaths?.[0]?.evidencia_path || null;
    await removeAllEvidencesForTarea(id, pool);
    if (legacyPath) {
      await safeDeleteEvidenceFile(legacyPath);
    }

    const nuevoEstado = estado_anterior || 'asignada';
    await pool.query(
      `UPDATE tareas
       SET estado = ?,
           mensaje_rechazo = ?,
           evidencia_url = NULL,
           evidencia_path = NULL,
           evidencia_subida_at = NULL
       WHERE id = ?`,
      [nuevoEstado, mensaje, id]
    );

    res.json({
      success: true,
      message: 'Tarea devuelta exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};

