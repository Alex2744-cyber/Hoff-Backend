const { pool } = require('../config/database');
const { buildDireccionCompleta } = require('../utils/buildDireccionCompleta');

const PAIS_DEFECTO = 'United Kingdom';

function trimOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

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
      calle,
      numero,
      piso,
      ciudad,
      codigo_postal,
      provincia,
      pais,
      notas
    } = req.body;

    if (!cliente_id || !calle || !ciudad) {
      return res.status(400).json({
        success: false,
        error: 'cliente_id, calle y ciudad son requeridos'
      });
    }

    const calleT = String(calle).trim();
    const ciudadT = String(ciudad).trim();
    if (!calleT || !ciudadT) {
      return res.status(400).json({
        success: false,
        error: 'Calle y ciudad no pueden estar vacíos'
      });
    }

    const paisFinal = trimOrNull(pais) || PAIS_DEFECTO;

    const partes = {
      calle: calleT,
      numero: trimOrNull(numero),
      piso: trimOrNull(piso),
      ciudad: ciudadT,
      codigo_postal: trimOrNull(codigo_postal),
      provincia: trimOrNull(provincia),
      pais: paisFinal
    };

    const direccion_completa = buildDireccionCompleta(partes);

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
    const numT = trimOrNull(numero);
    const cpT = trimOrNull(codigo_postal);
    if (numT && cpT) {
      const [existingFlexible] = await pool.query(`
        SELECT d.id, d.direccion_completa
        FROM direcciones d
        JOIN clientes c ON d.cliente_id = c.id
        WHERE d.calle = ? 
          AND d.numero = ?
          AND d.codigo_postal = ?
          AND d.cliente_id != ?
          AND c.activo = TRUE
      `, [calleT, numT, cpT, cliente_id]);

      if (existingFlexible.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Esta dirección (${calleT} ${numT}, ${cpT}) ya está registrada para otro cliente activo: ${existingFlexible[0].direccion_completa}`
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
      calleT,
      numT,
      trimOrNull(piso),
      ciudadT,
      cpT,
      trimOrNull(provincia),
      paisFinal,
      trimOrNull(notas)
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
      calle,
      numero,
      piso,
      ciudad,
      codigo_postal,
      provincia,
      pais,
      notas
    } = req.body;

    const [rows] = await pool.query('SELECT * FROM direcciones WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Dirección no encontrada'
      });
    }

    const cur = rows[0];
    const clienteIdActual = cur.cliente_id;

    const pick = (incoming, current) => (incoming !== undefined ? incoming : current);

    let calleM = pick(calle, cur.calle);
    let ciudadM = pick(ciudad, cur.ciudad);
    calleM = calleM != null ? String(calleM).trim() : '';
    ciudadM = ciudadM != null ? String(ciudadM).trim() : '';

    if (!calleM || !ciudadM) {
      return res.status(400).json({
        success: false,
        error: 'Calle y ciudad no pueden estar vacíos'
      });
    }

    const numeroM = trimOrNull(pick(numero, cur.numero));
    const pisoM = trimOrNull(pick(piso, cur.piso));
    const cpM = trimOrNull(pick(codigo_postal, cur.codigo_postal));
    const provM = trimOrNull(pick(provincia, cur.provincia));
    let paisM = trimOrNull(pick(pais, cur.pais));
    if (!paisM) paisM = PAIS_DEFECTO;
    const notasM = notas !== undefined ? trimOrNull(notas) : trimOrNull(cur.notas);

    const partes = {
      calle: calleM,
      numero: numeroM,
      piso: pisoM,
      ciudad: ciudadM,
      codigo_postal: cpM,
      provincia: provM,
      pais: paisM
    };

    const direccion_completa = buildDireccionCompleta(partes);

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

    if (calleM && numeroM && cpM) {
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
      `, [calleM, numeroM, cpM, clienteIdActual, id]);

      if (existingFlexible.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Esta dirección (${calleM} ${numeroM}, ${cpM}) ya está registrada para otro cliente activo: ${existingFlexible[0].direccion_completa}`
        });
      }
    }

    await pool.query(
      `UPDATE direcciones SET 
        direccion_completa = ?, calle = ?, numero = ?, piso = ?, ciudad = ?, 
        codigo_postal = ?, provincia = ?, pais = ?, notas = ?
      WHERE id = ?`,
      [
        direccion_completa,
        calleM,
        numeroM,
        pisoM,
        ciudadM,
        cpM,
        provM,
        paisM,
        notasM,
        id
      ]
    );

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


