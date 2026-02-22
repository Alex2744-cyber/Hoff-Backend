const { pool } = require('../config/database');

// Login único: prueba administradores primero, luego trabajadores
const login = async (req, res, next) => {
  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({
        success: false,
        error: 'Usuario y contraseña son requeridos'
      });
    }

    // 1. Probar administradores
    const [adminResults] = await pool.query(
      'SELECT id, usuario, nombre, descripcion, foto_perfil, activo FROM administradores WHERE usuario = ? AND password_hash = SHA2(?, 256) AND activo = TRUE',
      [usuario, password]
    );

    if (adminResults.length > 0) {
      const admin = adminResults[0];
      return res.json({
        success: true,
        message: 'Login exitoso',
        user: {
          id: admin.id,
          usuario: admin.usuario,
          nombre: admin.nombre,
          descripcion: admin.descripcion,
          foto_perfil: admin.foto_perfil,
          tipo: 'admin'
        }
      });
    }

    // 2. Probar trabajadores
    const [trabajadorResults] = await pool.query(
      'SELECT id, usuario, nombre, descripcion, foto_perfil, activo FROM trabajadores WHERE usuario = ? AND password_hash = SHA2(?, 256) AND activo = TRUE',
      [usuario, password]
    );

    if (trabajadorResults.length > 0) {
      const trabajador = trabajadorResults[0];
      return res.json({
        success: true,
        message: 'Login exitoso',
        user: {
          id: trabajador.id,
          usuario: trabajador.usuario,
          nombre: trabajador.nombre,
          descripcion: trabajador.descripcion,
          foto_perfil: trabajador.foto_perfil,
          tipo: 'trabajador'
        }
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Credenciales inválidas'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login
};
