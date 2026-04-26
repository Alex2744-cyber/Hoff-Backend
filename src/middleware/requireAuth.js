const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/jwt');

/**
 * Exige Authorization: Bearer <JWT>. Adjuntar req.auth = { userId, tipo, usuario }.
 */
function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization;
    if (!h || typeof h !== 'string' || !h.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No autorizado' });
    }
    const token = h.slice(7).trim();
    if (!token) {
      return res.status(401).json({ success: false, error: 'No autorizado' });
    }
    const payload = jwt.verify(token, getJwtSecret());
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({ success: false, error: 'Token inválido' });
    }
    if (payload.tipo !== 'admin' && payload.tipo !== 'trabajador') {
      return res.status(401).json({ success: false, error: 'Token inválido' });
    }
    req.auth = {
      userId,
      tipo: payload.tipo,
      usuario: String(payload.usuario || ''),
    };
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.auth || req.auth.tipo !== 'admin') {
    return res.status(403).json({ success: false, error: 'Acceso solo para administradores' });
  }
  return next();
}

module.exports = { requireAuth, requireAdmin };
