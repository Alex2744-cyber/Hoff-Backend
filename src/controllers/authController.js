const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { getJwtSecret } = require('../config/jwt');
const { verifyAndUpgrade, verifyOnly, hashPassword } = require('../utils/password');

const MIN_PASSWORD_LENGTH = 6;

function signToken(user) {
  return jwt.sign(
    { sub: user.id, tipo: user.tipo, usuario: user.usuario },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

function userPayload(row, tipo) {
  return {
    id: row.id,
    usuario: row.usuario,
    nombre: row.nombre,
    descripcion: row.descripcion,
    foto_perfil: row.foto_perfil,
    tipo,
  };
}

// Login único: administradores primero, luego trabajadores
const login = async (req, res, next) => {
  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({
        success: false,
        error: 'Usuario y contraseña son requeridos',
      });
    }

    const u = String(usuario).trim();

    const [adminRows] = await pool.query(
      'SELECT id, usuario, nombre, descripcion, foto_perfil, password_hash FROM administradores WHERE usuario = ? AND activo = TRUE',
      [u]
    );

    if (adminRows.length > 0) {
      const row = adminRows[0];
      const ok = await verifyAndUpgrade('administradores', row.id, password, row.password_hash);
      if (ok) {
        const user = userPayload(row, 'admin');
        return res.json({
          success: true,
          message: 'Login exitoso',
          user,
          token: signToken(user),
        });
      }
    }

    const [trabRows] = await pool.query(
      'SELECT id, usuario, nombre, descripcion, foto_perfil, password_hash FROM trabajadores WHERE usuario = ? AND activo = TRUE',
      [u]
    );

    if (trabRows.length > 0) {
      const row = trabRows[0];
      const ok = await verifyAndUpgrade('trabajadores', row.id, password, row.password_hash);
      if (ok) {
        const user = userPayload(row, 'trabajador');
        return res.json({
          success: true,
          message: 'Login exitoso',
          user,
          token: signToken(user),
        });
      }
    }

    return res.status(401).json({
      success: false,
      error: 'Credenciales inválidas',
    });
  } catch (error) {
    next(error);
  }
};

// Cambiar contraseña: requiere JWT (req.auth)
const changePassword = async (req, res, next) => {
  try {
    const { password_actual, password_nueva } = req.body;

    if (!password_actual || !password_nueva) {
      return res.status(400).json({
        success: false,
        error: 'Contraseña actual y nueva son requeridas',
      });
    }

    const nueva = String(password_nueva);
    if (nueva.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `La contraseña nueva debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
      });
    }

    const table = req.auth.tipo === 'admin' ? 'administradores' : 'trabajadores';
    const [rows] = await pool.query(
      `SELECT password_hash FROM ${table} WHERE id = ? AND activo = TRUE`,
      [req.auth.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    const ok = await verifyOnly(table, req.auth.userId, password_actual, rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({
        success: false,
        error: 'Contraseña actual incorrecta',
      });
    }

    const hash = await hashPassword(nueva);
    await pool.query(`UPDATE ${table} SET password_hash = ? WHERE id = ?`, [hash, req.auth.userId]);

    return res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (error) {
    next(error);
  }
};

function trimOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// GET /api/auth/me — perfil del usuario autenticado
const getMe = async (req, res, next) => {
  try {
    const table = req.auth.tipo === 'admin' ? 'administradores' : 'trabajadores';
    const tipo = req.auth.tipo === 'admin' ? 'admin' : 'trabajador';
    const [rows] = await pool.query(
      `SELECT id, usuario, nombre, descripcion, foto_perfil FROM ${table} WHERE id = ? AND activo = TRUE`,
      [req.auth.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    const user = userPayload(rows[0], tipo);
    return res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// PUT /api/auth/me — actualizar nombre, descripción, foto_perfil (no usuario)
const updateMe = async (req, res, next) => {
  try {
    const { nombre, descripcion, foto_perfil } = req.body;
    const table = req.auth.tipo === 'admin' ? 'administradores' : 'trabajadores';
    const tipo = req.auth.tipo === 'admin' ? 'admin' : 'trabajador';

    const updates = [];
    const values = [];

    if (nombre !== undefined) {
      const n = trimOrNull(nombre);
      if (!n) {
        return res.status(400).json({
          success: false,
          error: 'El nombre no puede estar vacío',
        });
      }
      updates.push('nombre = ?');
      values.push(n);
    }
    if (descripcion !== undefined) {
      updates.push('descripcion = ?');
      values.push(descripcion === null || descripcion === '' ? null : String(descripcion).trim());
    }
    if (foto_perfil !== undefined) {
      updates.push('foto_perfil = ?');
      values.push(trimOrNull(foto_perfil));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar',
      });
    }

    values.push(req.auth.userId);
    await pool.query(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = ? AND activo = TRUE`, values);

    const [rows] = await pool.query(
      `SELECT id, usuario, nombre, descripcion, foto_perfil FROM ${table} WHERE id = ?`,
      [req.auth.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    const user = userPayload(rows[0], tipo);
    return res.json({ success: true, data: user, message: 'Perfil actualizado' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  changePassword,
  getMe,
  updateMe,
};
