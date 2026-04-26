/**
 * Secreto para firmar JWT. Obligatorio en producción.
 */
function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (s && String(s).trim()) {
    return String(s).trim();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio en producción. Define la variable de entorno.');
  }
  // eslint-disable-next-line no-console
  console.warn(
    '[auth] JWT_SECRET no definido: usando secreto de solo desarrollo. No uses esto en producción.'
  );
  return 'dev-insecure-jwt-secret-cambiar-en-produccion';
}

function assertJwtConfiguredForProduction() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET?.trim()) {
    throw new Error('JWT_SECRET es obligatorio en producción');
  }
}

module.exports = {
  getJwtSecret,
  assertJwtConfiguredForProduction,
};
