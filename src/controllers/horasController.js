const { pool } = require('../config/database');

// Registrar horas trabajadas
const registrarHoras = async (req, res, next) => {
  try {
    const {
      tarea_id,
      trabajador_id,
      horas,
      descripcion
    } = req.body;

    if (!tarea_id || !trabajador_id || !horas) {
      return res.status(400).json({
        success: false,
        error: 'tarea_id, trabajador_id y horas son requeridos'
      });
    }

    // Verificar que el trabajador está asignado a la tarea
    const [asignacion] = await pool.query(
      'SELECT * FROM tarea_trabajadores WHERE tarea_id = ? AND trabajador_id = ?',
      [tarea_id, trabajador_id]
    );

    if (asignacion.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El trabajador no está asignado a esta tarea'
      });
    }

    const query = `
      INSERT INTO horas_trabajadas 
      (tarea_id, trabajador_id, horas, descripcion)
      VALUES (?, ?, ?, ?)
    `;

    const [result] = await pool.query(query, [
      tarea_id,
      trabajador_id,
      horas,
      descripcion || null
    ]);

    res.status(201).json({
      success: true,
      message: 'Horas registradas exitosamente',
      data: {
        id: result.insertId
      }
    });
  } catch (error) {
    next(error);
  }
};

// Obtener horas de una tarea
const getHorasByTarea = async (req, res, next) => {
  try {
    const { tareaId } = req.params;

    const query = `
      SELECT 
        ht.*,
        tr.nombre as trabajador_nombre
      FROM horas_trabajadas ht
      JOIN trabajadores tr ON ht.trabajador_id = tr.id
      WHERE ht.tarea_id = ?
      ORDER BY ht.fecha_registro DESC
    `;

    const [results] = await pool.query(query, [tareaId]);

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

// Actualizar registro de horas
const updateHoras = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { horas, descripcion } = req.body;

    const updates = [];
    const values = [];

    if (horas) {
      updates.push('horas = ?');
      values.push(horas);
    }
    if (descripcion !== undefined) {
      updates.push('descripcion = ?');
      values.push(descripcion);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar'
      });
    }

    values.push(id);
    const query = `UPDATE horas_trabajadas SET ${updates.join(', ')} WHERE id = ?`;

    await pool.query(query, values);

    res.json({
      success: true,
      message: 'Horas actualizadas exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// Eliminar registro de horas
const deleteHoras = async (req, res, next) => {
  try {
    const { id } = req.params;

    const query = 'DELETE FROM horas_trabajadas WHERE id = ?';
    await pool.query(query, [id]);

    res.json({
      success: true,
      message: 'Registro de horas eliminado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registrarHoras,
  getHorasByTarea,
  updateHoras,
  deleteHoras
};


