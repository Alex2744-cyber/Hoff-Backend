-- ============================================
-- Migración: Eliminar inserción duplicada en horas_trabajadas
-- ============================================
-- 
-- PROBLEMA:
-- Cuando se aprueba una tarea, se inserta en horas_trabajadas automáticamente,
-- pero esto causa duplicación e inconsistencias. Las horas aprobadas ya están
-- guardadas en detalle_horas_aprobadas (fuente de verdad para nóminas).
--
-- SOLUCIÓN:
-- Eliminar la inserción automática en horas_trabajadas del procedimiento aprobar_tarea.
-- Las horas_trabajadas solo deben usarse para registros manuales temporales (si se necesitan).
-- Para estadísticas y nóminas, usar detalle_horas_aprobadas.
-- ============================================

USE cleaning_app;

-- Eliminar y recrear el procedimiento sin la inserción en horas_trabajadas
DROP PROCEDURE IF EXISTS aprobar_tarea;

DELIMITER //

CREATE PROCEDURE aprobar_tarea(
    IN p_tarea_id INT,
    IN p_admin_id INT,
    IN p_notas_aprobacion TEXT
)
BEGIN
    DECLARE v_cliente_id INT;
    DECLARE v_cliente_nombre VARCHAR(100);
    DECLARE v_cliente_tipo VARCHAR(20);
    DECLARE v_direccion VARCHAR(255);
    DECLARE v_ciudad VARCHAR(100);
    DECLARE v_fecha_realizacion DATE;
    DECLARE v_fecha_creacion TIMESTAMP;
    DECLARE v_descripcion TEXT;
    DECLARE v_detalles TEXT;
    DECLARE v_horas_estimadas DECIMAL(5,2);
    DECLARE v_valor DECIMAL(10,2);
    DECLARE v_num_trabajadores INT;
    DECLARE v_admin_nombre VARCHAR(100);
    DECLARE v_comentarios_trabajador TEXT;
    DECLARE v_mes INT;
    DECLARE v_anio INT;
    DECLARE v_tarea_aprobada_id INT;
    DECLARE v_estado_actual VARCHAR(20);
    DECLARE v_max_horas DECIMAL(5,2);
    
    -- Verificar que la tarea está completada
    SELECT estado INTO v_estado_actual FROM tareas WHERE id = p_tarea_id;
    
    IF v_estado_actual IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La tarea no existe';
    END IF;
    
    IF v_estado_actual != 'completada' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Solo se pueden aprobar tareas completadas';
    END IF;
    
    -- Obtener datos de la tarea
    SELECT 
        t.cliente_id,
        c.nombre,
        c.tipo,
        d.direccion_completa,
        d.ciudad,
        t.fecha_realizacion,
        t.fecha_creacion,
        t.descripcion_general,
        t.detalles_especificos,
        t.numero_horas,
        t.valor_servicio,
        t.comentarios_trabajador,
        COUNT(DISTINCT tt.trabajador_id),
        MONTH(t.fecha_realizacion),
        YEAR(t.fecha_realizacion)
    INTO 
        v_cliente_id, v_cliente_nombre, v_cliente_tipo,
        v_direccion, v_ciudad, v_fecha_realizacion, v_fecha_creacion,
        v_descripcion, v_detalles, v_horas_estimadas, v_valor,
        v_comentarios_trabajador, v_num_trabajadores, v_mes, v_anio
    FROM tareas t
    JOIN clientes c ON t.cliente_id = c.id
    JOIN direcciones d ON t.direccion_id = d.id
    LEFT JOIN tarea_trabajadores tt ON t.id = tt.tarea_id
    WHERE t.id = p_tarea_id
    GROUP BY t.id, t.cliente_id, c.nombre, c.tipo, d.direccion_completa, 
             d.ciudad, t.fecha_realizacion, t.fecha_creacion,
             t.descripcion_general, t.detalles_especificos, 
             t.numero_horas, t.valor_servicio, t.comentarios_trabajador;
    
    -- Obtener nombre del admin
    SELECT nombre INTO v_admin_nombre FROM administradores WHERE id = p_admin_id;
    
    IF v_admin_nombre IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El administrador no existe';
    END IF;
    
    -- Calcular tiempo del servicio como MAX de horas individuales
    SELECT MAX(COALESCE(horas_aprobadas, horas_asignadas, v_horas_estimadas / v_num_trabajadores))
    INTO v_max_horas
    FROM tarea_trabajadores
    WHERE tarea_id = p_tarea_id;
    
    SET v_max_horas = COALESCE(v_max_horas, v_horas_estimadas);
    
    -- Insertar en tareas_aprobadas (registro permanente)
    INSERT INTO tareas_aprobadas (
        tarea_id, cliente_id, cliente_nombre, cliente_tipo,
        direccion_completa, ciudad, fecha_realizacion, fecha_creacion_tarea,
        descripcion_general, detalles_especificos, numero_horas_estimadas,
        valor_servicio, total_horas_trabajadas, numero_trabajadores,
        aprobada_por, admin_nombre, notas_aprobacion, comentarios_trabajador,
        mes_nomina, anio_nomina
    ) VALUES (
        p_tarea_id, v_cliente_id, v_cliente_nombre, v_cliente_tipo,
        v_direccion, v_ciudad, v_fecha_realizacion, v_fecha_creacion,
        v_descripcion, v_detalles, v_horas_estimadas,
        v_valor, v_max_horas, v_num_trabajadores,
        p_admin_id, v_admin_nombre, p_notas_aprobacion, v_comentarios_trabajador,
        v_mes, v_anio
    );
    
    SET v_tarea_aprobada_id = LAST_INSERT_ID();
    
    -- Copiar detalle de horas a registro permanente (con horas individuales)
    INSERT INTO detalle_horas_aprobadas (
        tarea_aprobada_id, tarea_id, trabajador_id, 
        trabajador_nombre, trabajador_usuario,
        horas_trabajadas, fecha_registro_horas
    )
    SELECT 
        v_tarea_aprobada_id, 
        p_tarea_id, 
        tt.trabajador_id,
        tr.nombre, 
        tr.usuario,
        COALESCE(tt.horas_aprobadas, tt.horas_asignadas, v_horas_estimadas / v_num_trabajadores) as horas,
        CURRENT_TIMESTAMP
    FROM tarea_trabajadores tt
    JOIN trabajadores tr ON tt.trabajador_id = tr.id
    WHERE tt.tarea_id = p_tarea_id;
    
    -- NOTA: Se eliminó la inserción automática en horas_trabajadas
    -- Las horas aprobadas ya están en detalle_horas_aprobadas (fuente de verdad para nóminas)
    -- Si se necesita registrar horas manualmente, usar el endpoint /api/horas
    
    -- Actualizar estado de la tarea a 'aprobada'
    UPDATE tareas 
    SET estado = 'aprobada',
        aprobada_por = p_admin_id,
        fecha_aprobacion = CURRENT_TIMESTAMP
    WHERE id = p_tarea_id;
    
    SELECT 
        'Tarea aprobada exitosamente' as message, 
        v_tarea_aprobada_id as tarea_aprobada_id,
        v_max_horas as tiempo_servicio,
        v_valor as valor_servicio;
END //

DELIMITER ;

-- Verificar que el procedimiento se actualizó correctamente
SHOW PROCEDURE STATUS WHERE Db = 'cleaning_app' AND Name = 'aprobar_tarea';

