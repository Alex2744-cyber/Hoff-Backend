/**
 * Exporta el esquema de la base de datos desde Railway a db/schema.sql
 * (carpeta db al nivel de Hoff App Diana, fuera de Hoff-Backend).
 * Ejecutar desde la raíz de Hoff-Backend: node scripts/export-schema.js
 * Variables de entorno: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 */
const path = require('path');
const mysql = require('mysql2/promise');
const fs = require('fs');

const config = {
  host: process.env.MYSQL_HOST || 'shortline.proxy.rlwy.net',
  port: parseInt(process.env.MYSQL_PORT || '31631', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'railway',
  ssl: process.env.MYSQL_SSL !== 'false' ? { rejectUnauthorized: false } : undefined,
  connectTimeout: 30000
};

// db/ está al nivel de Hoff App Diana (hermana de Hoff-Backend)
const SCHEMA_PATH = path.join(__dirname, '..', '..', 'db', 'schema.sql');

async function exportSchema() {
  let connection;
  const lines = [
    '-- Schema exportado desde Railway',
    '-- Base de datos: ' + config.database,
    '-- Fecha: ' + new Date().toISOString(),
    ''
  ];

  try {
    connection = await mysql.createConnection(config);
    console.log('Conectado a Railway MySQL...');

    const [tables] = await connection.query('SHOW TABLES');
    const tableKey = 'Tables_in_' + config.database;

    for (const row of tables) {
      const tableName = row[tableKey];
      const [createRows] = await connection.query(`SHOW CREATE TABLE \`${tableName}\``);
      const createSql = createRows[0]['Create Table'];
      lines.push('-- Tabla: ' + tableName);
      lines.push(createSql + ';');
      lines.push('');
    }

    const [procs] = await connection.query(
      "SHOW PROCEDURE STATUS WHERE Db = ?",
      [config.database]
    );
    if (procs.length > 0) {
      lines.push('-- Procedimientos almacenados');
      lines.push('DELIMITER //');
      lines.push('');
      for (const proc of procs) {
        const [createProcRows] = await connection.query(
          `SHOW CREATE PROCEDURE \`${proc.Name}\``
        );
        const createProc = createProcRows[0]['Create Procedure'];
        lines.push(createProc);
        lines.push('//');
        lines.push('');
      }
      lines.push('DELIMITER ;');
      lines.push('');
    }

    const output = lines.join('\n');
    fs.writeFileSync(SCHEMA_PATH, output, 'utf8');
    console.log('✅ ' + SCHEMA_PATH + ' generado correctamente.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

exportSchema();
