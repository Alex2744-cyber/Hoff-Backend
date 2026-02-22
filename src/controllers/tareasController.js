const { pool } = require('../config/database');

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
        error: 'Tarea no encontrada'
      });
    }
    
    // Obtener trabajadores asignados con sus horas individuales
    const queryTrabajadores = `
      SELECT tr.id, tr.nombre, tr.foto_perfil,
             tt.horas_asignadas, tt.horas_aprobadas, tt.notas
      FROM trabajadores tr
      JOIN tarea_trabajadores tt ON tr.id = tt.trabajador_id
      WHERE tt.tarea_id = ?
    `;
    const [trabajadores] = await pool.query(queryTrabajadores, [id]);
    
    const tareaData = {
        ...results[0],
        trabajadores
    };
    
    // Si la tarea está aprobada, obtener información del registro permanente
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
        
        // Obtener horas aprobadas por trabajador desde detalle_horas_aprobadas
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
      data: tareaData
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
      fecha_realizacion,
      descripcion_general,
      detalles_especificos,
      numero_horas,
      valor_servicio,
      trabajadores // Array de IDs de trabajadores (opcional)
    } = req.body;

    // Validar campos requeridos
    if (!cliente_id || !direccion_id || !fecha_realizacion || !descripcion_general || !valor_servicio) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos'
      });
    }

    const query = `
      INSERT INTO tareas 
      (cliente_id, direccion_id, fecha_realizacion, descripcion_general, detalles_especificos, numero_horas, valor_servicio)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(query, [
      cliente_id,
      direccion_id,
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

    const query = `
      SELECT t.*, 
             c.nombre as cliente_nombre,
             d.direccion_completa,
             d.ciudad
      FROM tareas t
      JOIN tarea_trabajadores tt ON t.id = tt.tarea_id
      JOIN clientes c ON t.cliente_id = c.id
      JOIN direcciones d ON t.direccion_id = d.id
      WHERE tt.trabajador_id = ?
      ORDER BY t.fecha_realizacion DESC
    `;

    const [results] = await pool.query(query, [trabajadorId]);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

// Asignar trabajador a tarea
const asignarTrabajador = async (req, res, next) => {
  try {
    const { tareaId } = req.params;
    const { trabajador_id, horas_asignadas, notas } = req.body;

    if (!trabajador_id) {
      return res.status(400).json({
        success: false,
        error: 'trabajador_id es requerido'
      });
    }

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

    // Insertar con horas_asignadas si se proporciona
    const query = 'INSERT INTO tarea_trabajadores (tarea_id, trabajador_id, horas_asignadas, notas) VALUES (?, ?, ?, ?)';
    await pool.query(query, [tareaId, trabajador_id, horas_asignadas || null, notas || null]);

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
    const { horas_asignadas } = req.body;

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

    // Actualizar horas asignadas
    const query = 'UPDATE tarea_trabajadores SET horas_asignadas = ? WHERE tarea_id = ? AND trabajador_id = ?';
    await pool.query(query, [horas_asignadas || null, tareaId, trabajadorId]);

    res.json({
      success: true,
      message: 'Horas asignadas actualizadas exitosamente'
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
    const { trabajador_id, comentarios } = req.body;

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

    // Cambiar estado a 'completada', guardar comentarios y limpiar mensaje_rechazo
    await pool.query(
      'UPDATE tareas SET estado = ?, comentarios_trabajador = ?, mensaje_rechazo = NULL WHERE id = ?',
      ['completada', comentarios || null, id]
    );

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

    // Cambiar estado a 'asignada' (o estado_anterior si se especifica) y guardar mensaje
    const nuevoEstado = estado_anterior || 'asignada';
    await pool.query(
      'UPDATE tareas SET estado = ?, mensaje_rechazo = ? WHERE id = ?',
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

// Marcar tarea como pagada
const marcarTareaComoPagada = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { referencia_pago } = req.body;

    // Verificar que la tarea existe y está aprobada
    const [tarea] = await pool.query('SELECT estado FROM tareas WHERE id = ?', [id]);
    
    if (tarea.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tarea no encontrada'
      });
    }

    if (tarea[0].estado !== 'aprobada') {
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden marcar como pagadas las tareas aprobadas'
      });
    }

    // Obtener el registro de aprobación
    const [aprobada] = await pool.query(
      'SELECT id FROM tareas_aprobadas WHERE tarea_id = ?',
      [id]
    );

    if (aprobada.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Registro de aprobación no encontrado'
      });
    }

    if (aprobada[0].estado_pago === 'pagado') {
      return res.status(400).json({
        success: false,
        error: 'Esta tarea ya está marcada como pagada'
      });
    }

    // Actualizar estado de pago
    await pool.query(
      'UPDATE tareas_aprobadas SET estado_pago = ?, fecha_pago = CURRENT_TIMESTAMP, referencia_pago = ? WHERE tarea_id = ?',
      ['pagado', referencia_pago || null, id]
    );

    res.json({
      success: true,
      message: 'Tarea marcada como pagada exitosamente'
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
  marcarTareaComoPagada,
};


