const { pool } = require('../config/database');

// Obtener ingresos totales de tareas pagadas
const getIngresosTotales = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        COALESCE(SUM(valor_servicio), 0) as ingresos_totales,
        COUNT(*) as total_tareas_pagadas
      FROM tareas_aprobadas
      WHERE estado_pago = 'pagado'
    `;
    
    const [results] = await pool.query(query);

    res.json({
      success: true,
      data: {
        ingresos_totales: parseFloat(results[0].ingresos_totales),
        total_tareas_pagadas: results[0].total_tareas_pagadas
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getIngresosTotales
};

