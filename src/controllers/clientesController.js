const { pool } = require('../config/database');

// Obtener todos los clientes
const getAllClientes = async (req, res, next) => {
  try {
    const query = `
      SELECT *
      FROM clientes
      WHERE activo = TRUE
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

// Obtener cliente por ID
const getClienteById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const query = 'SELECT * FROM clientes WHERE id = ?';
    const [results] = await pool.query(query, [id]);
    
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado'
      });
    }
    
    // Obtener estadísticas del cliente
    const queryStats = `
      SELECT 
        COUNT(*) as total_tareas,
        SUM(CASE WHEN estado = 'completada' THEN 1 ELSE 0 END) as tareas_completadas,
        SUM(CASE WHEN estado = 'pendiente' OR estado = 'asignada' THEN 1 ELSE 0 END) as tareas_pendientes,
        COALESCE(SUM(valor_servicio), 0) as valor_total
      FROM tareas
      WHERE cliente_id = ?
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

// Crear nuevo cliente
const createCliente = async (req, res, next) => {
  try {
    // foto_perfil: URL absoluta (POST /api/media/upload tipo cliente_perfil) o URL legado en texto
    const {
      nombre,
      tipo,
      nombre_empresa,
      descripcion,
      foto_perfil,
      telefono,
      email,
      administrador_nombre,
      administrador_telefono,
      administrador_email
    } = req.body;

    if (!tipo) {
      return res.status(400).json({
        success: false,
        error: 'El tipo es requerido'
      });
    }

    if (!['empresa', 'particular'].includes(tipo)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo debe ser "empresa" o "particular"'
      });
    }

    let nombreFinal;
    let nombreEmpresaValue = null;

    if (tipo === 'empresa') {
      const ne = nombre_empresa != null ? String(nombre_empresa).trim() : '';
      if (!ne) {
        return res.status(400).json({
          success: false,
          error: 'El nombre de la empresa es requerido para clientes tipo empresa'
        });
      }
      nombreFinal = ne;
      nombreEmpresaValue = ne;
    } else {
      const n = nombre != null ? String(nombre).trim() : '';
      if (!n) {
        return res.status(400).json({
          success: false,
          error: 'El nombre es requerido'
        });
      }
      nombreFinal = n;
    }

    const query = `
      INSERT INTO clientes 
      (nombre, tipo, nombre_empresa, descripcion, foto_perfil, telefono, email, administrador_nombre, administrador_telefono, administrador_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(query, [
      nombreFinal,
      tipo,
      nombreEmpresaValue,
      descripcion || null,
      foto_perfil && String(foto_perfil).trim() ? String(foto_perfil).trim() : null,
      telefono || null,
      email || null,
      tipo === 'empresa' ? (administrador_nombre || null) : null,
      tipo === 'empresa' ? (administrador_telefono || null) : null,
      tipo === 'empresa' ? (administrador_email || null) : null
    ]);

    res.status(201).json({
      success: true,
      message: 'Cliente creado exitosamente',
      data: {
        id: result.insertId,
        nombre: nombreFinal,
        tipo
      }
    });
  } catch (error) {
    next(error);
  }
};

// Actualizar cliente
const updateCliente = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      tipo,
      nombre_empresa,
      descripcion,
      foto_perfil,
      telefono,
      email,
      administrador_nombre,
      administrador_telefono,
      administrador_email,
      activo
    } = req.body;

    // Obtener el tipo actual del cliente
    const [clienteActual] = await pool.query('SELECT tipo FROM clientes WHERE id = ?', [id]);
    if (clienteActual.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado'
      });
    }

    const tipoActual = clienteActual[0].tipo;
    const nuevoTipo = tipo || tipoActual;

    const updates = [];
    const values = [];

    const nombreEmpresaInBody = Object.prototype.hasOwnProperty.call(req.body, 'nombre_empresa');

    if (tipo) {
      if (!['empresa', 'particular'].includes(tipo)) {
        return res.status(400).json({
          success: false,
          error: 'Tipo debe ser "empresa" o "particular"'
        });
      }
      updates.push('tipo = ?');
      values.push(tipo);
    }

    if (nombreEmpresaInBody && nuevoTipo === 'empresa') {
      const v = nombre_empresa != null ? String(nombre_empresa).trim() : '';
      if (!v) {
        return res.status(400).json({
          success: false,
          error: 'El nombre de la empresa es requerido para clientes tipo empresa'
        });
      }
      updates.push('nombre = ?', 'nombre_empresa = ?');
      values.push(v, v);
    } else if (nombreEmpresaInBody) {
      updates.push('nombre_empresa = ?');
      values.push(nombre_empresa || null);
    }

    if (!(nombreEmpresaInBody && nuevoTipo === 'empresa')) {
      if (nombre && String(nombre).trim()) {
        const n = String(nombre).trim();
        if (nuevoTipo === 'empresa' && !nombreEmpresaInBody) {
          updates.push('nombre = ?', 'nombre_empresa = ?');
          values.push(n, n);
        } else if (nuevoTipo === 'particular') {
          updates.push('nombre = ?');
          values.push(n);
        }
      }
    }
    if (descripcion !== undefined) {
      updates.push('descripcion = ?');
      values.push(descripcion);
    }
    if (foto_perfil !== undefined) {
      updates.push('foto_perfil = ?');
      values.push(
        foto_perfil && String(foto_perfil).trim() ? String(foto_perfil).trim() : null
      );
    }
    if (telefono !== undefined) {
      updates.push('telefono = ?');
      values.push(telefono);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }

    // Permitir cambiar el estado activo
    if (activo !== undefined) {
      updates.push('activo = ?');
      values.push(activo);
      
      // Si se está desactivando, borrar todas las direcciones del cliente
      if (activo === false) {
        // Verificar si tiene direcciones en uso en tareas
        const [direccionesEnUso] = await pool.query(
          'SELECT COUNT(*) as count FROM tareas t JOIN direcciones d ON t.direccion_id = d.id WHERE d.cliente_id = ?',
          [id]
        );
        
        if (direccionesEnUso[0].count > 0) {
          return res.status(400).json({
            success: false,
            error: 'No se puede desactivar un cliente con direcciones en uso en tareas'
          });
        }
        
        // Borrar todas las direcciones del cliente
        await pool.query('DELETE FROM direcciones WHERE cliente_id = ?', [id]);
      }
    }

    // Campos de administrador (solo para empresas)
    if (nuevoTipo === 'empresa') {
      if (administrador_nombre !== undefined) {
        updates.push('administrador_nombre = ?');
        values.push(administrador_nombre || null);
      }
      if (administrador_telefono !== undefined) {
        updates.push('administrador_telefono = ?');
        values.push(administrador_telefono || null);
      }
      if (administrador_email !== undefined) {
        updates.push('administrador_email = ?');
        values.push(administrador_email || null);
      }
    } else {
      // Si cambia a particular, limpiar campos de administrador
      if (tipo && tipo === 'particular') {
        updates.push('administrador_nombre = NULL');
        updates.push('administrador_telefono = NULL');
        updates.push('administrador_email = NULL');
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar'
      });
    }

    values.push(id);
    const query = `UPDATE clientes SET ${updates.join(', ')} WHERE id = ?`;

    await pool.query(query, values);

    res.json({
      success: true,
      message: 'Cliente actualizado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// Eliminar cliente (desactivar)
const deleteCliente = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verificar si tiene tareas pendientes
    const [tareas] = await pool.query(
      "SELECT COUNT(*) as count FROM tareas WHERE cliente_id = ? AND estado IN ('pendiente', 'asignada')",
      [id]
    );

    if (tareas[0].count > 0) {
      return res.status(400).json({
        success: false,
        error: 'No se puede desactivar un cliente con tareas pendientes'
      });
    }

    const query = 'UPDATE clientes SET activo = FALSE WHERE id = ?';
    await pool.query(query, [id]);

    res.json({
      success: true,
      message: 'Cliente desactivado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// Obtener tareas de un cliente
const getTareasCliente = async (req, res, next) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT t.*, d.direccion_completa
      FROM tareas t
      JOIN direcciones d ON t.direccion_id = d.id
      WHERE t.cliente_id = ?
      ORDER BY t.fecha_realizacion DESC
    `;

    const [results] = await pool.query(query, [id]);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllClientes,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente,
  getTareasCliente
};


