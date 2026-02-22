const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testConnection } = require('./src/config/database');
const errorHandler = require('./src/middleware/errorHandler');

// Importar rutas
const authRoutes = require('./src/routes/auth');
const tareasRoutes = require('./src/routes/tareas');
const trabajadoresRoutes = require('./src/routes/trabajadores');
const clientesRoutes = require('./src/routes/clientes');
const horasRoutes = require('./src/routes/horas');
const direccionesRoutes = require('./src/routes/direcciones');
const finanzasRoutes = require('./src/routes/finanzas');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API de Cleaning App funcionando correctamente',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      tareas: '/api/tareas',
      trabajadores: '/api/trabajadores',
      clientes: '/api/clientes',
      horas: '/api/horas',
      direcciones: '/api/direcciones',
      finanzas: '/api/finanzas'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/tareas', tareasRoutes);
app.use('/api/trabajadores', trabajadoresRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/horas', horasRoutes);
app.use('/api/direcciones', direccionesRoutes);
app.use('/api/finanzas', finanzasRoutes);

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Ruta no encontrada'
  });
});

// Middleware de manejo de errores (debe ir al final)
app.use(errorHandler);

// Iniciar servidor
const startServer = async () => {
  try {
    // Verificar conexión a la base de datos
    const connected = await testConnection();
    
    if (!connected) {
      console.error('⚠️  No se pudo conectar a la base de datos. Verifica tu configuración.');
      console.error('💡 Asegúrate de configurar el archivo .env correctamente');
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log('='.repeat(50));
      console.log('🚀 Servidor iniciado correctamente');
      console.log('='.repeat(50));
      console.log(`📍 URL: http://localhost:${PORT}`);
      console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💾 Base de datos: ${process.env.DB_NAME}`);
      console.log('='.repeat(50));
      console.log('\n📋 Endpoints disponibles:');
      console.log(`   GET  http://localhost:${PORT}/`);
      console.log(`   GET  http://localhost:${PORT}/health`);
      console.log(`   POST http://localhost:${PORT}/api/auth/login/admin`);
      console.log(`   POST http://localhost:${PORT}/api/auth/login/trabajador`);
      console.log(`   GET  http://localhost:${PORT}/api/tareas`);
      console.log(`   GET  http://localhost:${PORT}/api/trabajadores`);
      console.log(`   GET  http://localhost:${PORT}/api/clientes`);
      console.log('='.repeat(50));
    });

  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

// Manejo de errores no capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Iniciar el servidor
startServer();

module.exports = app;


