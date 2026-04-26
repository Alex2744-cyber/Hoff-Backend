// Middleware para manejo de errores
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err.stack);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'El archivo supera el tamaño máximo permitido',
    });
  }

  if (
    typeof err.message === 'string' &&
    err.message.includes('Tipo de archivo no permitido')
  ) {
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Error interno del servidor';

  res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;


