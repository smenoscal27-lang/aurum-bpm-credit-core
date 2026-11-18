/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Archivo: task.controller.js
 * Descripción: Controlador BPM para la orquestación de tareas paralelas,
 *              ejecución del patrón Join (Sincronización) y auditoría inmutable.
 * ============================================================================
 */

const { dbRun, dbGet, dbAll } = require('./database');

/**
 * Helper para registrar eventos de auditoría inmutable
 */
const registrarAuditoria = async (solicitudId, accion, usuarioResponsable, resultado) => {
  const resultadoTexto = typeof resultado === 'object' ? JSON.stringify(resultado) : String(resultado);
  await dbRun(
    `INSERT INTO bitacora_auditoria (solicitud_id, accion, usuario_responsable, resultado)
     VALUES (?, ?, ?, ?)`,
    [solicitudId, accion, usuarioResponsable, resultadoTexto]
  );
};

/**
 * @desc    Listar tareas paralelas con filtros (solicitud_id, estado, tipo_tarea, asignado_a)
 * @route   GET /api/v1/tareas
 */
const listarTareas = async (req, res) => {
  try {
    const { solicitud_id, estado, tipo_tarea, asignado_a } = req.query;

    let query = 'SELECT * FROM tareas_paralelas WHERE 1=1';
    const params = [];

    if (solicitud_id) {
      query += ' AND solicitud_id = ?';
      params.push(solicitud_id);
    }
    if (estado) {
      query += ' AND estado = ?';
      params.push(estado);
    }
    if (tipo_tarea) {
      query += ' AND tipo_tarea = ?';
      params.push(tipo_tarea);
    }
    if (asignado_a) {
      query += ' AND asignado_a = ?';
      params.push(asignado_a);
    }

    query += ' ORDER BY id ASC';

    const tareas = await dbAll(query, params);

    return res.status(200).json({
      exito: true,
      total: tareas.length,
      data: tareas
    });
  } catch (error) {
    console.error('[-] Error en listarTareas:', error);
    return res.status(500).json({
      exito: false,
      error: 'Error interno del servidor al listar tareas.',
      detalle: error.message
    });
  }
};

/**
 * @desc    Completar o dictaminar una tarea paralela y evaluar la compuerta Join BPM
 * @route   PATCH /api/v1/tareas/:id/completar
 */
const completarTarea = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, observaciones } = req.body;
    const usuarioResponsable = req.user?.id || req.headers['x-user-id'] || 'OFICIAL_VERIFICACION';

    // 1. Validaciones de Entrada
    if (!estado || !['Completada', 'Rechazada'].includes(estado)) {
      return res.status(400).json({
        exito: false,
        error: "El estado de resolución debe ser 'Completada' o 'Rechazada'."
      });
    }

    const tarea = await dbGet('SELECT * FROM tareas_paralelas WHERE id = ?', [id]);
    if (!tarea) {
      return res.status(404).json({
        exito: false,
        error: `No existe la tarea paralela con ID ${id}.`
      });
    }

    if (tarea.estado === 'Completada' || tarea.estado === 'Rechazada') {
      return res.status(400).json({
        exito: false,
        error: `La tarea ya fue resuelta previamente con estado: ${tarea.estado}.`
      });
    }

    // 2. Actualizar estado de la tarea
    await dbRun(
      `UPDATE tareas_paralelas
       SET estado = ?, observaciones = ?, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [estado, observaciones || null, id]
    );

    // 3. Auditoría Obligatoria: Resolución de Tarea Paralela
    await registrarAuditoria(
      tarea.solicitud_id,
      'TAREA_PARALELA_RESUELTA',
      usuarioResponsable,
      {
        tarea_id: id,
        tipo_tarea: tarea.tipo_tarea,
        estado_reportado: estado,
        observaciones: observaciones || 'Sin observaciones adicionales'
      }
    );

    // 4. COMPUERTA JOIN BPM (Evaluación de Convergencia)
    // Se consultan todas las tareas del proceso para verificar si el Join sincroniza
    const todasLasTareas = await dbAll(
      'SELECT * FROM tareas_paralelas WHERE solicitud_id = ?',
      [tarea.solicitud_id]
    );

    const algunaRechazada = todasLasTareas.some(t => t.estado === 'Rechazada');
    const todasCompletadas = todasLasTareas.every(t => t.estado === 'Completada');
    const pendientes = todasLasTareas.filter(t => t.estado === 'Pendiente' || t.estado === 'En_Proceso').length;

    let resultadoJoin = {
      sincronizado: false,
      estado_solicitud_resultante: 'Tareas_Paralelas',
      progreso: `${todasLasTareas.length - pendientes}/${todasLasTareas.length} tareas resueltas`
    };

    if (algunaRechazada) {
      // Si al menos una verificación de campo es negativa, la solicitud se RECHAZA de inmediato
      resultadoJoin.sincronizado = true;
      resultadoJoin.estado_solicitud_resultante = 'Rechazado';

      await dbRun(
        `UPDATE solicitudes_credito
         SET estado_actual = 'Rechazado', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [tarea.solicitud_id]
      );

      await registrarAuditoria(
        tarea.solicitud_id,
        'JOIN_CONVERGENCIA_RECHAZO',
        'MOTOR_BPM_JOIN_GATEWAY',
        {
          motivo: `Compuerta Join: Tarea [${tarea.tipo_tarea}] rechazada. Proceso finalizado negativamente.`,
          observaciones
        }
      );
    } else if (todasCompletadas) {
      // Si todas las verificaciones concluyeron con éxito, la solicitud se APRUEBA
      resultadoJoin.sincronizado = true;
      resultadoJoin.estado_solicitud_resultante = 'Aprobado';

      await dbRun(
        `UPDATE solicitudes_credito
         SET estado_actual = 'Aprobado', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [tarea.solicitud_id]
      );

      await registrarAuditoria(
        tarea.solicitud_id,
        'JOIN_CONVERGENCIA_APROBACION',
        'MOTOR_BPM_JOIN_GATEWAY',
        {
          motivo: 'Compuerta Join: Todas las tareas paralelas fueron completadas satisfactoriamente. Crédito Aprobado.',
          total_tareas_auditadas: todasLasTareas.length
        }
      );
    }

    // 5. Devolver estado consolidado
    const tareaActualizada = await dbGet('SELECT * FROM tareas_paralelas WHERE id = ?', [id]);
    const solicitudActualizada = await dbGet('SELECT * FROM solicitudes_credito WHERE id = ?', [tarea.solicitud_id]);

    return res.status(200).json({
      exito: true,
      mensaje: 'Tarea paralela resuelta correctamente.',
      data: {
        tarea: tareaActualizada,
        compuerta_join: resultadoJoin,
        solicitud: solicitudActualizada
      }
    });
  } catch (error) {
    console.error('[-] Error en completarTarea:', error);
    return res.status(500).json({
      exito: false,
      error: 'Error interno del servidor al completar la tarea.',
      detalle: error.message
    });
  }
};

module.exports = {
  listarTareas,
  completarTarea
};

