const { pool } = require('../config/database');

// Obtener todas las direcciones (solo de clientes activos)
const getAllDirecciones = async (req, res, next) => {
  try {
    const query = `
      SELECT d.* 
      FROM direcciones d
      JOIN clientes c ON d.cliente_id = c.id
      WHERE c.activo = TRUE
      ORDER BY d.ciudad, d.calle
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

// Obtener dirección por ID
const getDireccionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const query = 'SELECT * FROM direcciones WHERE id = ?';
    const [results] = await pool.query(query, [id]);
    
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Dirección no encontrada'
      });
    }
    
    res.json({
      success: true,
      data: results[0]
    });
  } catch (error) {
    next(error);
  }
};

// Crear nueva dirección
const createDireccion = async (req, res, next) => {
  try {
    const {
      cliente_id,
      direccion_completa,
      calle,
      numero,
      piso,
      ciudad,
      codigo_postal,
      provincia,
      pais,
      notas
    } = req.body;

    if (!cliente_id || !direccion_completa || !calle || !ciudad) {
      return res.status(400).json({
        success: false,
        error: 'cliente_id, direccion_completa, calle y ciudad son requeridos'
      });
    }

    // Verificar que el cliente existe y está activo
    const [cliente] = await pool.query(
      'SELECT id FROM clientes WHERE id = ? AND activo = TRUE',
      [cliente_id]
    );

    if (cliente.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado o inactivo'
      });
    }

    // Verificar si ya existe una dirección igual para otro cliente activo (validación exacta)
    const [existing] = await pool.query(`
      SELECT d.id 
      FROM direcciones d
      JOIN clientes c ON d.cliente_id = c.id
      WHERE d.direccion_completa = ? 
        AND d.cliente_id != ? 
        AND c.activo = TRUE
    `, [direccion_completa, cliente_id]);

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Esta dirección ya está registrada para otro cliente activo'
      });
    }

    // Validación flexible: verificar calle + número + código postal
    if (calle && numero && codigo_postal) {
      const [existingFlexible] = await pool.query(`
        SELECT d.id, d.direccion_completa
        FROM direcciones d
        JOIN clientes c ON d.cliente_id = c.id
        WHERE d.calle = ? 
          AND d.numero = ?
          AND d.codigo_postal = ?
          AND d.cliente_id != ?
          AND c.activo = TRUE
      `, [calle.trim(), numero.trim(), codigo_postal.trim(), cliente_id]);

      if (existingFlexible.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Esta dirección (${calle} ${numero}, ${codigo_postal}) ya está registrada para otro cliente activo: ${existingFlexible[0].direccion_completa}`
        });
      }
    }

    const query = `
      INSERT INTO direcciones 
      (cliente_id, direccion_completa, calle, numero, piso, ciudad, codigo_postal, provincia, pais, notas)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(query, [
      cliente_id,
      direccion_completa,
      calle,
      numero || null,
      piso || null,
      ciudad,
      codigo_postal || null,
      provincia || null,
      pais || 'España',
      notas || null
    ]);

    res.status(201).json({
      success: true,
      message: 'Dirección creada exitosamente',
      data: {
        id: result.insertId
      }
    });
  } catch (error) {
    next(error);
  }
};

// Actualizar dirección
const updateDireccion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      direccion_completa,
      calle,
      numero,
      piso,
      ciudad,
      codigo_postal,
      provincia,
      pais,
      notas
    } = req.body;

    // Obtener el cliente_id actual de la dirección
    const [direccionActual] = await pool.query(
      'SELECT cliente_id FROM direcciones WHERE id = ?',
      [id]
    );

    if (direccionActual.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Dirección no encontrada'
      });
    }

    const clienteIdActual = direccionActual[0].cliente_id;

    // Si se está actualizando direccion_completa, verificar duplicados (validación exacta)
    if (direccion_completa) {
      const [existing] = await pool.query(`
        SELECT d.id 
        FROM direcciones d
        JOIN clientes c ON d.cliente_id = c.id
        WHERE d.direccion_completa = ? 
          AND d.cliente_id != ? 
          AND d.id != ?
          AND c.activo = TRUE
      `, [direccion_completa, clienteIdActual, id]);

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Esta dirección ya está registrada para otro cliente activo'
        });
      }
    }

    // Validación flexible: verificar calle + número + código postal
    // Obtener valores actuales de la dirección para comparar
    const [direccionData] = await pool.query(
      'SELECT calle, numero, codigo_postal FROM direcciones WHERE id = ?',
      [id]
    );

    const calleFinal = calle || direccionData[0]?.calle;
    const numeroFinal = numero !== undefined ? numero : direccionData[0]?.numero;
    const codigoPostalFinal = codigo_postal !== undefined ? codigo_postal : direccionData[0]?.codigo_postal;

    if (calleFinal && numeroFinal && codigoPostalFinal) {
      const [existingFlexible] = await pool.query(`
        SELECT d.id, d.direccion_completa
        FROM direcciones d
        JOIN clientes c ON d.cliente_id = c.id
        WHERE d.calle = ? 
          AND d.numero = ?
          AND d.codigo_postal = ?
          AND d.cliente_id != ?
          AND d.id != ?
          AND c.activo = TRUE
      `, [calleFinal.trim(), numeroFinal.trim(), codigoPostalFinal.trim(), clienteIdActual, id]);

      if (existingFlexible.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Esta dirección (${calleFinal} ${numeroFinal}, ${codigoPostalFinal}) ya está registrada para otro cliente activo: ${existingFlexible[0].direccion_completa}`
        });
      }
    }

    const updates = [];
    const values = [];

    if (direccion_completa) {
      updates.push('direccion_completa = ?');
      values.push(direccion_completa);
    }
    if (calle) {
      updates.push('calle = ?');
      values.push(calle);
    }
    if (numero !== undefined) {
      updates.push('numero = ?');
      values.push(numero);
    }
    if (piso !== undefined) {
      updates.push('piso = ?');
      values.push(piso);
    }
    if (ciudad) {
      updates.push('ciudad = ?');
      values.push(ciudad);
    }
    if (codigo_postal !== undefined) {
      updates.push('codigo_postal = ?');
      values.push(codigo_postal);
    }
    if (provincia !== undefined) {
      updates.push('provincia = ?');
      values.push(provincia);
    }
    if (pais) {
      updates.push('pais = ?');
      values.push(pais);
    }
    if (notas !== undefined) {
      updates.push('notas = ?');
      values.push(notas);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar'
      });
    }

    values.push(id);
    const query = `UPDATE direcciones SET ${updates.join(', ')} WHERE id = ?`;

    await pool.query(query, values);

    res.json({
      success: true,
      message: 'Dirección actualizada exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// Eliminar dirección
const deleteDireccion = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verificar si está en uso
    const [tareas] = await pool.query(
      'SELECT COUNT(*) as count FROM tareas WHERE direccion_id = ?',
      [id]
    );

    if (tareas[0].count > 0) {
      return res.status(400).json({
        success: false,
        error: 'No se puede eliminar una dirección que está en uso'
      });
    }

    const query = 'DELETE FROM direcciones WHERE id = ?';
    await pool.query(query, [id]);

    res.json({
      success: true,
      message: 'Dirección eliminada exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

// Buscar direcciones (solo de clientes activos)
const buscarDirecciones = async (req, res, next) => {
  try {
    const { busqueda } = req.query;

    if (!busqueda) {
      return res.status(400).json({
        success: false,
        error: 'Parámetro de búsqueda requerido'
      });
    }

    const query = `
      SELECT d.* 
      FROM direcciones d
      JOIN clientes c ON d.cliente_id = c.id
      WHERE c.activo = TRUE
        AND (d.direccion_completa LIKE ? 
         OR d.calle LIKE ?
         OR d.ciudad LIKE ?)
      ORDER BY d.ciudad, d.calle
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

// Obtener direcciones por cliente
const getDireccionesByCliente = async (req, res, next) => {
  try {
    const { clienteId } = req.params;
    
    const query = `
      SELECT d.* 
      FROM direcciones d
      JOIN clientes c ON d.cliente_id = c.id
      WHERE d.cliente_id = ? AND c.activo = TRUE
      ORDER BY d.ciudad, d.direccion_completa
    `;
    
    const [results] = await pool.query(query, [clienteId]);
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllDirecciones,
  getDireccionById,
  createDireccion,
  updateDireccion,
  deleteDireccion,
  buscarDirecciones,
  getDireccionesByCliente
};


