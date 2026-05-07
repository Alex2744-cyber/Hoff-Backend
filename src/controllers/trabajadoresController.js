const { pool } = require('../config/database');
const { hashPassword, verifyOnly } = require('../utils/password');
const MIN_PASSWORD_LENGTH = 6;

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeOptionalText(value, maxLen = 120) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function normalizeFechaIngreso(value) {
  if (value == null) return { ok: true, value: null };
  const s = String(value).trim();
  if (!s) return { ok: true, value: null };
  if (!DATE_ONLY_REGEX.test(s)) {
    return { ok: false, error: 'La fecha de ingreso debe tener formato YYYY-MM-DD' };
  }
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: 'La fecha de ingreso no es válida' };
  }
  return { ok: true, value: s };
}

// Obtener todos los trabajadores
const getAllTrabajadores = async (req, res, next) => {
  try {
    const query = `
      SELECT id, usuario, nombre, cargo, fecha_ingreso, contacto_emergencia, descripcion, foto_perfil, tarifa_hora_predeterminada, fecha_creacion, activo
      FROM trabajadores
      ORDER BY nombre ASC
    `;
    const [results] = await pool.query(query);
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

// Obtener trabajador por ID
const getTrabajadorById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT id, usuario, nombre, cargo, fecha_ingreso, contacto_emergencia, descripcion, foto_perfil, tarifa_hora_predeterminada, fecha_creacion, activo
      FROM trabajadores
      WHERE id = ?
    `;
    
    const [results] = await pool.query(query, [id]);
    
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Trabajador no encontrado'
      });
    }
    
    // Obtener estadísticas del trabajador
    // Usar detalle_horas_aprobadas para horas aprobadas (fuente de verdad para nóminas)
    const queryStats = `
      SELECT 
        COUNT(DISTINCT tt.tarea_id) as total_tareas,
        COALESCE(SUM(dha.horas_trabajadas), 0) as total_horas
      FROM trabajadores tr
      LEFT JOIN tarea_trabajadores tt ON tr.id = tt.trabajador_id
      LEFT JOIN detalle_horas_aprobadas dha ON tr.id = dha.trabajador_id
      WHERE tr.id = ?
    `;
    const [stats] = await pool.query(queryStats, [id]);
    
    res.json({
      success: true,
      data: {
        ...results[0],
        estadisticas: stats[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

// Crear nuevo trabajador
const createTrabajador = async (req, res, next) => {
  try {
    const { usuario, password, nombre, descripcion, foto_perfil, cargo, fecha_ingreso, contacto_emergencia } =
      req.body;

    if (!usuario || !password || !nombre) {
      return res.status(400).json({
        success: false,
        error: 'Usuario, contraseña y nombre son requeridos'
      });
    }

    // Verificar si el usuario ya existe
    const [existing] = await pool.query(
      'SELECT id FROM trabajadores WHERE usuario = ?',
      [usuario]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'El usuario ya existe'
      });
    }

    const passwordHash = await hashPassword(password);

    const isAdmin = req.auth && req.auth.tipo === 'admin';
    let tarifaPredeterminada = null;
    if (isAdmin && req.body.tarifa_hora_predeterminada != null && req.body.tarifa_hora_predeterminada !== '') {
      const t = Number(req.body.tarifa_hora_predeterminada);
      if (Number.isFinite(t) && t >= 0) {
        tarifaPredeterminada = t;
      }
    }

    const query = `
      INSERT INTO trabajadores 
      (usuario, password_hash, nombre, cargo, fecha_ingreso, contacto_emergencia, descripcion, foto_perfil, tarifa_hora_predeterminada)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const fotoNorm =
      foto_perfil != null && String(foto_perfil).trim() ? String(foto_perfil).trim() : null;
    const cargoNorm = normalizeOptionalText(cargo, 120);
    const contactoEmergenciaNorm = normalizeOptionalText(contacto_emergencia, 255);
    const fechaIngresoNorm = normalizeFechaIngreso(fecha_ingreso);
    if (!fechaIngresoNorm.ok) {
      return res.status(400).json({
        success: false,
        error: fechaIngresoNorm.error,
      });
    }

    const [result] = await pool.query(query, [
      usuario,
      passwordHash,
      nombre,
      cargoNorm,
      fechaIngresoNorm.value,
      contactoEmergenciaNorm,
      descripcion || null,
      fotoNorm,
      tarifaPredeterminada,
    ]);

    res.status(201).json({
      success: true,
      message: 'Trabajador creado exitosamente',
      data: {
        id: result.insertId,
        usuario,
        nombre,
        cargo: cargoNorm,
        fecha_ingreso: fechaIngresoNorm.value,
        contacto_emergencia: contactoEmergenciaNorm,
      }
    });
  } catch (error) {
    next(error);
  }
};

// Actualizar trabajador
const updateTrabajador = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      cargo,
      fecha_ingreso,
      contacto_emergencia,
      descripcion,
      foto_perfil,
      activo,
      tarifa_hora_predeterminada,
    } = req.body;

    const updates = [];
    const values = [];
    const isAdmin = req.auth && req.auth.tipo === 'admin';
    const targetId = Number(id);

    if (req.auth.tipo === 'trabajador' && targetId !== req.auth.userId) {
      return res.status(403).json({
        success: false,
        error: 'No puedes modificar el perfil de otro trabajador',
      });
    }

    if (nombre) {
      updates.push('nombre = ?');
      values.push(nombre);
    }
    if (cargo !== undefined) {
      updates.push('cargo = ?');
      values.push(normalizeOptionalText(cargo, 120));
    }
    if (fecha_ingreso !== undefined) {
      const fechaIngresoNorm = normalizeFechaIngreso(fecha_ingreso);
      if (!fechaIngresoNorm.ok) {
        return res.status(400).json({
          success: false,
          error: fechaIngresoNorm.error,
        });
      }
      updates.push('fecha_ingreso = ?');
      values.push(fechaIngresoNorm.value);
    }
    if (contacto_emergencia !== undefined) {
      updates.push('contacto_emergencia = ?');
      values.push(normalizeOptionalText(contacto_emergencia, 255));
    }
    if (descripcion !== undefined) {
      updates.push('descripcion = ?');
      values.push(descripcion);
    }
    // foto_perfil: URL absoluta (p. ej. devuelta por POST /api/media/upload) o null para quitar
    if (foto_perfil !== undefined) {
      updates.push('foto_perfil = ?');
      values.push(
        foto_perfil != null && String(foto_perfil).trim()
          ? String(foto_perfil).trim()
          : null
      );
    }
    if (activo !== undefined && isAdmin) {
      updates.push('activo = ?');
      values.push(activo);
    }
    if (isAdmin && tarifa_hora_predeterminada !== undefined) {
      if (tarifa_hora_predeterminada === null || tarifa_hora_predeterminada === '') {
        updates.push('tarifa_hora_predeterminada = ?');
        values.push(null);
      } else {
        const t = Number(tarifa_hora_predeterminada);
        if (Number.isFinite(t) && t >= 0) {
          updates.push('tarifa_hora_predeterminada = ?');
          values.push(t);
        }
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar'
      });
    }

    values.push(id);
    const query = `UPDATE trabajadores SET ${updates.join(', ')} WHERE id = ?`;

    await pool.query(query, values);

    res.json({
      success: true,
      message: 'Trabajador actualizado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// Cambiar contraseña
const cambiarPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const targetId = Number(id);
    if (req.auth.tipo === 'trabajador' && targetId !== req.auth.userId) {
      return res.status(403).json({
        success: false,
        error: 'No puedes cambiar la contraseña de otro trabajador',
      });
    }
    const { password_actual, password_nueva } = req.body;

    if (!password_actual || !password_nueva) {
      return res.status(400).json({
        success: false,
        error: 'Contraseña actual y nueva son requeridas'
      });
    }

    const [rows] = await pool.query(
      'SELECT password_hash FROM trabajadores WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Trabajador no encontrado'
      });
    }

    const ok = await verifyOnly('trabajadores', Number(id), password_actual, rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({
        success: false,
        error: 'Contraseña actual incorrecta'
      });
    }

    const newHash = await hashPassword(password_nueva);
    await pool.query('UPDATE trabajadores SET password_hash = ? WHERE id = ?', [newHash, id]);

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// Resetear contraseña de trabajador (solo admin, con reautenticación)
const resetPasswordByAdmin = async (req, res, next) => {
  try {
    if (!req.auth || req.auth.tipo !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Solo administradores pueden restablecer contraseñas',
      });
    }

    const { id } = req.params;
    const { admin_password, new_password } = req.body || {};

    if (!admin_password || !new_password) {
      return res.status(400).json({
        success: false,
        error: 'La contraseña del admin y la nueva contraseña son requeridas',
      });
    }

    if (String(new_password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
      });
    }

    const [adminRows] = await pool.query(
      'SELECT password_hash FROM administradores WHERE id = ? AND activo = TRUE',
      [req.auth.userId]
    );

    if (adminRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Administrador no encontrado',
      });
    }

    const adminOk = await verifyOnly(
      'administradores',
      Number(req.auth.userId),
      String(admin_password),
      adminRows[0].password_hash
    );
    if (!adminOk) {
      return res.status(401).json({
        success: false,
        error: 'Contraseña de administrador incorrecta',
      });
    }

    const [trabRows] = await pool.query(
      'SELECT id FROM trabajadores WHERE id = ?',
      [id]
    );
    if (trabRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Trabajador no encontrado',
      });
    }

    const newHash = await hashPassword(String(new_password));
    await pool.query('UPDATE trabajadores SET password_hash = ? WHERE id = ?', [newHash, id]);

    return res.json({
      success: true,
      message: 'Contraseña del trabajador restablecida correctamente',
    });
  } catch (error) {
    next(error);
  }
};

// Eliminar trabajador (desactivar)
const deleteTrabajador = async (req, res, next) => {
  try {
    const { id } = req.params;

    // En lugar de eliminar, desactivamos
    const query = 'UPDATE trabajadores SET activo = FALSE WHERE id = ?';
    await pool.query(query, [id]);

    res.json({
      success: true,
      message: 'Trabajador desactivado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// Obtener horas aprobadas por trabajador (desde detalle_horas_aprobadas - fuente de verdad para nóminas)
const getHorasTrabajadas = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mes, anio } = req.query;

    // Usar detalle_horas_aprobadas que tiene mes_nomina y anio_nomina basados en fecha_realizacion
    let query = `
      SELECT 
        dha.id,
        dha.tarea_id,
        dha.horas_trabajadas as horas,
        dha.fecha_registro_horas as fecha_registro,
        dha.descripcion_horas as descripcion,
        ta.descripcion_general as tarea_descripcion,
        ta.cliente_nombre,
        ta.fecha_realizacion,
        ta.mes_nomina,
        ta.anio_nomina,
        ta.estado_pago
      FROM detalle_horas_aprobadas dha
      JOIN tareas_aprobadas ta ON dha.tarea_aprobada_id = ta.id
      WHERE dha.trabajador_id = ?
    `;

    const params = [id];

    // Filtrar por mes_nomina y anio_nomina (basados en fecha_realizacion, no fecha_registro)
    if (mes && anio) {
      query += ' AND ta.mes_nomina = ? AND ta.anio_nomina = ?';
      params.push(mes, anio);
    }

    query += ' ORDER BY ta.fecha_realizacion DESC, dha.fecha_registro_horas DESC';

    const [results] = await pool.query(query, params);

    // Calcular total
    const total = results.reduce((sum, row) => sum + parseFloat(row.horas), 0);

    res.json({
      success: true,
      data: results,
      total_horas: total
    });
  } catch (error) {
    next(error);
  }
};

// Obtener horas asignadas activas por trabajador
const getHorasAsignadas = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Obtener tareas activas (pendiente, asignada, completada)
    // y calcular horas asignadas por trabajador
    const query = `
      SELECT 
        t.id as tarea_id,
        t.descripcion_general,
        t.estado,
        t.numero_horas,
        c.nombre as cliente_nombre,
        tt.horas_asignadas,
        tt.horas_aprobadas
      FROM tarea_trabajadores tt
      JOIN tareas t ON tt.tarea_id = t.id
      JOIN clientes c ON t.cliente_id = c.id
      WHERE tt.trabajador_id = ?
        AND t.estado IN ('pendiente', 'asignada', 'completada')
      ORDER BY t.fecha_realizacion ASC
    `;

    const [results] = await pool.query(query, [id]);

    // Calcular horas asignadas para cada tarea y total
    const tareasConHoras = results.map(tarea => {
      // horas_aprobadas → horas_asignadas del join → duración de la tarea
      let horas = null;
      if (tarea.horas_aprobadas) {
        horas = parseFloat(tarea.horas_aprobadas);
      } else if (tarea.horas_asignadas) {
        horas = parseFloat(tarea.horas_asignadas);
      } else if (tarea.numero_horas) {
        horas = parseFloat(tarea.numero_horas);
      }

      return {
        tarea_id: tarea.tarea_id,
        descripcion: tarea.descripcion_general,
        cliente_nombre: tarea.cliente_nombre,
        estado: tarea.estado,
        horas_asignadas: horas
      };
    });

    // Calcular total de horas asignadas
    const total_horas = tareasConHoras.reduce((sum, tarea) => {
      return sum + (tarea.horas_asignadas || 0);
    }, 0);

    res.json({
      success: true,
      data: tareasConHoras,
      total_horas_asignadas: total_horas
    });
  } catch (error) {
    next(error);
  }
};

// Obtener estadísticas de tareas aprobadas por trabajador (para mostrar tareas aprobadas del mes)
const getTareasAprobadas = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mes, anio } = req.query;

    let query = `
      SELECT 
        ta.id as tarea_aprobada_id,
        ta.tarea_id,
        ta.cliente_nombre,
        ta.descripcion_general as tarea_descripcion,
        ta.fecha_realizacion,
        ta.mes_nomina,
        ta.anio_nomina,
        ta.estado_pago,
        dha.horas_trabajadas,
        dha.descripcion_horas
      FROM detalle_horas_aprobadas dha
      JOIN tareas_aprobadas ta ON dha.tarea_aprobada_id = ta.id
      WHERE dha.trabajador_id = ?
    `;

    const params = [id];

    // Filtrar por mes_nomina y anio_nomina
    if (mes && anio) {
      query += ' AND ta.mes_nomina = ? AND ta.anio_nomina = ?';
      params.push(mes, anio);
    }

    query += ' ORDER BY ta.fecha_realizacion DESC';

    const [results] = await pool.query(query, params);

    // Calcular totales
    const total_tareas = results.length;
    const total_horas = results.reduce((sum, row) => sum + parseFloat(row.horas_trabajadas), 0);

    res.json({
      success: true,
      data: results,
      total_tareas: total_tareas,
      total_horas: total_horas
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllTrabajadores,
  getTrabajadorById,
  createTrabajador,
  updateTrabajador,
  cambiarPassword,
  resetPasswordByAdmin,
  deleteTrabajador,
  getHorasTrabajadas,
  getHorasAsignadas,
  getTareasAprobadas
};


