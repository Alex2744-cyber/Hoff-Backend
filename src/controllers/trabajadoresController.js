const { pool } = require('../config/database');

// Obtener todos los trabajadores
const getAllTrabajadores = async (req, res, next) => {
  try {
    const query = `
      SELECT id, usuario, nombre, descripcion, foto_perfil, fecha_creacion, activo
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
      SELECT id, usuario, nombre, descripcion, foto_perfil, fecha_creacion, activo
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
    const { usuario, password, nombre, descripcion, foto_perfil } = req.body;

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

    const query = `
      INSERT INTO trabajadores 
      (usuario, password_hash, nombre, descripcion, foto_perfil)
      VALUES (?, SHA2(?, 256), ?, ?, ?)
    `;

    const [result] = await pool.query(query, [
      usuario,
      password,
      nombre,
      descripcion || null,
      foto_perfil || null
    ]);

    res.status(201).json({
      success: true,
      message: 'Trabajador creado exitosamente',
      data: {
        id: result.insertId,
        usuario,
        nombre
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
    const { nombre, descripcion, foto_perfil, activo } = req.body;

    const updates = [];
    const values = [];

    if (nombre) {
      updates.push('nombre = ?');
      values.push(nombre);
    }
    if (descripcion !== undefined) {
      updates.push('descripcion = ?');
      values.push(descripcion);
    }
    if (foto_perfil !== undefined) {
      updates.push('foto_perfil = ?');
      values.push(foto_perfil);
    }
    if (activo !== undefined) {
      updates.push('activo = ?');
      values.push(activo);
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
    const { password_actual, password_nueva } = req.body;

    if (!password_actual || !password_nueva) {
      return res.status(400).json({
        success: false,
        error: 'Contraseña actual y nueva son requeridas'
      });
    }

    // Verificar contraseña actual
    const [trabajador] = await pool.query(
      'SELECT id FROM trabajadores WHERE id = ? AND password_hash = SHA2(?, 256)',
      [id, password_actual]
    );

    if (trabajador.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Contraseña actual incorrecta'
      });
    }

    // Actualizar contraseña
    await pool.query(
      'UPDATE trabajadores SET password_hash = SHA2(?, 256) WHERE id = ?',
      [password_nueva, id]
    );

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
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
        tt.horas_aprobadas,
        (SELECT COUNT(*) FROM tarea_trabajadores WHERE tarea_id = t.id) as num_trabajadores
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
      // Calcular horas: horas_aprobadas → horas_asignadas → división equitativa
      let horas = null;
      if (tarea.horas_aprobadas) {
        horas = parseFloat(tarea.horas_aprobadas);
      } else if (tarea.horas_asignadas) {
        horas = parseFloat(tarea.horas_asignadas);
      } else if (tarea.numero_horas && tarea.num_trabajadores) {
        horas = parseFloat(tarea.numero_horas) / tarea.num_trabajadores;
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
  deleteTrabajador,
  getHorasTrabajadas,
  getHorasAsignadas,
  getTareasAprobadas
};


