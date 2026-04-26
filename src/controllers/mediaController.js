const fs = require('fs').promises;

const ALLOWED_TIPOS = ['cliente_perfil', 'trabajador_perfil', 'admin_perfil', 'tarea_evidencia'];

function getPublicBase(req) {
  const env = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  if (env) return env;
  const host = req.get('host') || 'localhost:3000';
  const forwarded = req.get('x-forwarded-proto');
  const proto = (forwarded || req.protocol || 'http').split(',')[0].trim();
  return `${proto}://${host}`;
}

function canUploadTipo(auth, tipo) {
  if (!auth) return false;
  if (tipo === 'cliente_perfil' || tipo === 'admin_perfil') {
    return auth.tipo === 'admin';
  }
  if (tipo === 'trabajador_perfil') {
    return auth.tipo === 'admin' || auth.tipo === 'trabajador';
  }
  if (tipo === 'tarea_evidencia') {
    return auth.tipo === 'admin' || auth.tipo === 'trabajador';
  }
  return false;
}

const uploadMedia = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Falta el archivo (campo file)',
      });
    }

    const tipo = String(req.body.tipo || '').trim();
    if (!ALLOWED_TIPOS.includes(tipo)) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        success: false,
        error: `tipo inválido. Permitidos: ${ALLOWED_TIPOS.join(', ')}`,
      });
    }

    if (!canUploadTipo(req.auth, tipo)) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(403).json({
        success: false,
        error: 'No autorizado para este tipo de subida',
      });
    }

    const rel = `/uploads/media/${req.file.filename}`;
    const url = `${getPublicBase(req)}${rel}`;

    return res.status(201).json({
      success: true,
      data: {
        url,
        path: rel,
        tipo,
      },
    });
  } catch (err) {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    return next(err);
  }
};

module.exports = {
  uploadMedia,
  getPublicBase,
};
