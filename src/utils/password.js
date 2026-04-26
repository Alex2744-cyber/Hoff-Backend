const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

const BCRYPT_ROUNDS = 12;

function isBcryptHash(stored) {
  return typeof stored === 'string' && stored.startsWith('$2');
}

/**
 * @param {'administradores'|'trabajadores'} table
 */
async function verifyAndUpgrade(table, id, plain, storedHash) {
  if (!plain || storedHash == null) return false;
  if (table !== 'administradores' && table !== 'trabajadores') {
    throw new Error('Invalid table');
  }

  if (isBcryptHash(storedHash)) {
    return bcrypt.compare(plain, storedHash);
  }

  const [legacy] = await pool.query(
    `SELECT id FROM ${table} WHERE id = ? AND password_hash = SHA2(?, 256)`,
    [id, plain]
  );
  if (legacy.length === 0) return false;

  const newHash = await bcrypt.hash(plain, BCRYPT_ROUNDS);
  await pool.query(`UPDATE ${table} SET password_hash = ? WHERE id = ?`, [newHash, id]);
  return true;
}

/**
 * @param {'administradores'|'trabajadores'} table
 */
async function verifyOnly(table, id, plain, storedHash) {
  if (!plain || storedHash == null) return false;
  if (table !== 'administradores' && table !== 'trabajadores') {
    throw new Error('Invalid table');
  }
  if (isBcryptHash(storedHash)) {
    return bcrypt.compare(plain, storedHash);
  }
  const [legacy] = await pool.query(
    `SELECT id FROM ${table} WHERE id = ? AND password_hash = SHA2(?, 256)`,
    [id, plain]
  );
  return legacy.length > 0;
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

module.exports = {
  verifyAndUpgrade,
  verifyOnly,
  hashPassword,
  isBcryptHash,
};
