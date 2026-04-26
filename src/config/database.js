const mysql = require('mysql2');
require('dotenv').config();

const dbName = process.env.DB_NAME || 'cleaning_app';

let useSsl = false;
if (process.env.DB_SSL === 'false' || process.env.DB_SSL === '0') {
  useSsl = false;
} else if (process.env.DB_SSL === 'true' || process.env.DB_SSL === '1') {
  useSsl = true;
} else {
  useSsl = /railway|rlwy\.net/i.test(process.env.DB_HOST || '');
}

// Crear pool de conexiones para mejor rendimiento
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: dbName,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {})
});

// Promisificar para usar async/await
const promisePool = pool.promise();

// Función para verificar la conexión
const testConnection = async () => {
  try {
    const connection = await promisePool.getConnection();
    console.log(`✅ Conectado exitosamente a MySQL - Base de datos: ${dbName}`);
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Error al conectar a MySQL:', error.message);
    return false;
  }
};

module.exports = {
  pool: promisePool,
  testConnection
};


