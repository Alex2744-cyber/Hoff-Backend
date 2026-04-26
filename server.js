const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { testConnection } = require('./src/config/database');
const { assertJwtConfiguredForProduction } = require('./src/config/jwt');
const { requireAuth } = require('./src/middleware/requireAuth');
const errorHandler = require('./src/middleware/errorHandler');

// Importar rutas
const authRoutes = require('./src/routes/auth');
const tareasRoutes = require('./src/routes/tareas');
const trabajadoresRoutes = require('./src/routes/trabajadores');
const clientesRoutes = require('./src/routes/clientes');
const horasRoutes = require('./src/routes/horas');
const direccionesRoutes = require('./src/routes/direcciones');
const finanzasRoutes = require('./src/routes/finanzas');
const mediaRoutes = require('./src/routes/media');
const { ensureUploadRoot, getUploadRoot } = require('./src/config/upload');

const app = express();
const PORT = process.env.PORT || 3000;

function parseAllowedOrigins(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const allowedOriginsSet = new Set(allowedOrigins);

function corsOriginValidator(origin, callback) {
  if (!origin) {
    // Apps nativas, curl y Postman suelen no enviar Origin
    callback(null, true);
    return;
  }

  const normalized = String(origin).trim().replace(/\/$/, '');
  if (allowedOriginsSet.has(normalized)) {
    callback(null, true);
    return;
  }

  callback(new Error('CORS bloqueado para este origen'));
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 600),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/' || req.path === '/health',
  message: { success: false, error: 'Demasiadas solicitudes. Intenta más tarde.' },
});

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  if (allowedOrigins.length === 0) {
    throw new Error(
      'ALLOWED_ORIGINS es obligatorio en producción. Define una lista separada por comas.'
    );
  }
}

// Middlewares
app.use(
  helmet({
    // Permite servir imágenes desde /uploads cuando app y API están en subdominios distintos.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors({ origin: corsOriginValidator }));
app.use(apiLimiter);
ensureUploadRoot();
app.use('/uploads', express.static(path.join(getUploadRoot())));
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

// Rutas de la API (auth/login público; el resto exige Bearer JWT)
app.use('/api/auth', authRoutes);
app.use('/api/tareas', requireAuth, tareasRoutes);
app.use('/api/trabajadores', requireAuth, trabajadoresRoutes);
app.use('/api/clientes', requireAuth, clientesRoutes);
app.use('/api/horas', requireAuth, horasRoutes);
app.use('/api/direcciones', requireAuth, direccionesRoutes);
app.use('/api/finanzas', requireAuth, finanzasRoutes);
app.use('/api/media', requireAuth, mediaRoutes);

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
    assertJwtConfiguredForProduction();

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
      console.log(`   POST http://localhost:${PORT}/api/media/upload`);
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


