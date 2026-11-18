/**
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO - FLUJOS DINÁMICOS (BPM)
 * Archivo: src/services/workflowEngine.js
 * Descripción: Motor de Orquestación de Flujos, Transiciones de Estado y Patrón Fork/Join.
 */

const { dbRun, dbGet, dbAll } = require('../../database');
const { evaluarSolicitudCredito } = require('./ruleEngine');
const { registrarAuditoria } = require('./auditService');

// Matriz de transiciones BPM válidas
const TRANSICIONES_VALIDAS = {
  'Recibido': ['En_Evaluacion', 'Revision_Riesgo', 'Tareas_Paralelas', 'Aprobado', 'Rechazado', 'Cancelado'],
  'En_Evaluacion': ['Revision_Riesgo', 'Tareas_Paralelas', 'Aprobado', 'Rechazado', 'Cancelado'],
  'Tareas_Paralelas': ['Revision_Riesgo', 'Aprobado', 'Rechazado', 'Cancelado'],
  'Revision_Riesgo': ['Tareas_Paralelas', 'Aprobado', 'Rechazado', 'Cancelado'],
  'Aprobado': [], // Estado Terminal
  'Rechazado': [], // Estado Terminal
  'Cancelado': []  // Estado Terminal
};

/**
 * Valida si una transición de estado es legal según la máquina de estados BPM
 */
const validarTransicion = (estadoActual, nuevoEstado) => {
  const permitidos = TRANSICIONES_VALIDAS[estadoActual] || [];
  return permitidos.includes(nuevoEstado);
};

/**
 * Crea una nueva solicitud de crédito y dispara el flujo dinámico inicial
 */
const iniciarSolicitudCredito = async (datos, usuario = 'SISTEMA_WEB') => {
  const {
    cliente_nombre,
    cliente_cedula,
    ingresos_mensuales,
    monto_solicitado,
    plazo_meses,
    asesor_id = 'ASESOR_AUTO'
  } = datos;

  // 1. Insertar solicitud en estado base 'Recibido'
  const insertResult = await dbRun(
    `INSERT INTO solicitudes_credito (
      cliente_nombre, cliente_cedula, ingresos_mensuales, monto_solicitado, plazo_meses, estado_actual, asesor_id
    ) VALUES (?, ?, ?, ?, ?, 'Recibido', ?)`,
    [cliente_nombre, cliente_cedula, ingresos_mensuales, monto_solicitado, plazo_meses, asesor_id]
  );

  const solicitudId = insertResult.lastID;

  await registrarAuditoria({
    solicitudId,
    accion: 'SOLICITUD_INGRESADA',
    usuarioResponsable: usuario,
    resultado: {
      estado_inicial: 'Recibido',
      monto: monto_solicitado,
      ingresos: ingresos_mensuales,
      plazo: plazo_meses
    }
  });

  // 2. Ejecución dinámica del Motor de Reglas (BRE)
  const evaluacion = await evaluarSolicitudCredito({
    id: solicitudId,
    cliente_nombre,
    cliente_cedula,
    ingresos_mensuales,
    monto_solicitado,
    plazo_meses
  });

  const { decisionFinal, nivelRiesgoCalculado, evaluaciones } = evaluacion;

  // Registrar auditoría de la evaluación de reglas
  await registrarAuditoria({
    solicitudId,
    accion: 'EVALUACION_REGLAS_BRE',
    usuarioResponsable: 'MOTOR_REGLAS_BPM',
    resultado: {
      decision: decisionFinal,
      nivel_riesgo: nivelRiesgoCalculado,
      reglas_evaluadas: evaluaciones
    }
  });

  // 3. Orquestación del Flujo según Decisión del Motor
  let estadoSiguiente = 'En_Evaluacion';
  let tareasCreadas = [];

  switch (decisionFinal) {
    case 'RECHAZAR_AUTOMATICO': {
      estadoSiguiente = 'Rechazado';
      await dbRun(
        `UPDATE solicitudes_credito
         SET estado_actual = ?, nivel_riesgo = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [estadoSiguiente, nivelRiesgoCalculado, solicitudId]
      );

      await registrarAuditoria({
        solicitudId,
        accion: 'RECHAZO_AUTOMATICO_POLITICAS',
        usuarioResponsable: 'MOTOR_BPM',
        resultado: { motivo: 'Violación directa de políticas crediticias obligatorias' }
      });
      break;
    }

    case 'APROBACION_DIRECTA': {
      estadoSiguiente = 'Aprobado';
      await dbRun(
        `UPDATE solicitudes_credito
         SET estado_actual = ?, nivel_riesgo = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [estadoSiguiente, nivelRiesgoCalculado, solicitudId]
      );

      await registrarAuditoria({
        solicitudId,
        accion: 'APROBACION_DIRECTA_OTORGADA',
        usuarioResponsable: 'MOTOR_BPM',
        resultado: { detalle: 'Cumple umbral de bajo riesgo sin necesidad de tareas de campo' }
      });
      break;
    }

    case 'DISPARAR_TAREAS_PARALELAS': {
      estadoSiguiente = 'Tareas_Paralelas';
      await dbRun(
        `UPDATE solicitudes_credito
         SET estado_actual = ?, nivel_riesgo = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [estadoSiguiente, nivelRiesgoCalculado, solicitudId]
      );

      // PATRÓN FORK: Crear hilos de tareas concurrentes de verificación
      const tiposTareas = ['Verificacion_Domicilio', 'Referencias_Telefonicas', 'Validacion_Laboral'];
      for (const tipo of tiposTareas) {
        const tareaRes = await dbRun(
          `INSERT INTO tareas_paralelas (solicitud_id, tipo_tarea, estado, asignado_a)
           VALUES (?, ?, 'Pendiente', ?)`,
          [solicitudId, tipo, `OPERADOR_${tipo.toUpperCase()}`]
        );
        tareasCreadas.push({ id: tareaRes.lastID, tipo, estado: 'Pendiente' });
      }

      await registrarAuditoria({
        solicitudId,
        accion: 'FORK_TAREAS_PARALELAS_DISPARADO',
        usuarioResponsable: 'MOTOR_BPM',
        resultado: { tareas: tareasCreadas }
      });
      break;
    }

    case 'REVISION_COMITE_RIESGOS':
    default: {
      estadoSiguiente = 'Revision_Riesgo';
      await dbRun(
        `UPDATE solicitudes_credito
         SET estado_actual = ?, nivel_riesgo = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [estadoSiguiente, nivelRiesgoCalculado, solicitudId]
      );

      await registrarAuditoria({
        solicitudId,
        accion: 'ESCALAMIENTO_A_RIESGOS',
        usuarioResponsable: 'MOTOR_BPM',
        resultado: { detalle: 'Solicitud escalada para evaluación manual colegiada' }
      });
      break;
    }
  }

  const solicitudActualizada = await dbGet('SELECT * FROM solicitudes_credito WHERE id = ?', [solicitudId]);

  return {
    solicitud: solicitudActualizada,
    decision: decisionFinal,
    tareas_creadas: tareasCreadas,
    evaluaciones
  };
};

/**
 * PATRÓN JOIN: Sincroniza y evalúa la convergencia de tareas paralelas
 */
const sincronizarJoinTareas = async (solicitudId, usuario = 'MOTOR_BPM') => {
  const tareas = await dbAll(
    'SELECT * FROM tareas_paralelas WHERE solicitud_id = ?',
    [solicitudId]
  );

  if (tareas.length === 0) return null;

  const algunaRechazada = tareas.some(t => t.estado === 'Rechazada');
  const todasCompletadas = tareas.every(t => t.estado === 'Completada');

  if (algunaRechazada) {
    // Si alguna verificación falla, se rechaza la solicitud de forma inmediata
    await dbRun(
      `UPDATE solicitudes_credito
       SET estado_actual = 'Rechazado', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [solicitudId]
    );

    await registrarAuditoria({
      solicitudId,
      accion: 'JOIN_TAREAS_FALLIDO',
      usuarioResponsable: usuario,
      resultado: {
        detalle: 'Una o más tareas de verificación arrojaron resultado negativo. Proceso rechazado.',
        tareas_estado: tareas.map(t => ({ tipo: t.tipo_tarea, estado: t.estado, observaciones: t.observaciones }))
      }
    });

    return { estado_resultante: 'Rechazado', sincronizado: true };
  }

  if (todasCompletadas) {
    // Concurrencia completada con éxito: Avanzar a Aprobado
    await dbRun(
      `UPDATE solicitudes_credito
       SET estado_actual = 'Aprobado', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [solicitudId]
    );

    await registrarAuditoria({
      solicitudId,
      accion: 'JOIN_TAREAS_EXITOSO',
      usuarioResponsable: usuario,
      resultado: {
        detalle: 'Todas las tareas paralelas fueron completadas satisfactoriamente. Solicitud Aprobada.',
        total_tareas: tareas.length
      }
    });

    return { estado_resultante: 'Aprobado', sincronizado: true };
  }

  // Aún hay tareas en progreso (esperando Join completo)
  return { estado_resultante: 'Tareas_Paralelas', sincronizado: false, tareas_pendientes: tareas.filter(t => t.estado !== 'Completada').length };
};

/**
 * Actualiza el estado de una tarea paralela y evalúa la compuerta Join
 */
const completarTareaParalela = async (tareaId, { estado, observaciones, usuario = 'OFICIAL_CREDITO' }) => {
  const tarea = await dbGet('SELECT * FROM tareas_paralelas WHERE id = ?', [tareaId]);
  if (!tarea) {
    throw new Error(`La tarea con ID ${tareaId} no existe`);
  }

  if (tarea.estado === 'Completada' || tarea.estado === 'Rechazada') {
    throw new Error(`La tarea ya se encuentra finalizada con estado: ${tarea.estado}`);
  }

  await dbRun(
    `UPDATE tareas_paralelas
     SET estado = ?, observaciones = ?, completed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [estado, observaciones || null, tareaId]
  );

  await registrarAuditoria({
    solicitudId: tarea.solicitud_id,
    accion: 'TAREA_PARALELA_FINALIZADA',
    usuarioResponsable: usuario,
    resultado: {
      tarea_id: tareaId,
      tipo_tarea: tarea.tipo_tarea,
      estado_reportado: estado,
      observaciones
    }
  });

  // Evaluar convergencia Join
  const resultadoJoin = await sincronizarJoinTareas(tarea.solicitud_id, usuario);

  const tareaActualizada = await dbGet('SELECT * FROM tareas_paralelas WHERE id = ?', [tareaId]);
  const solicitudActualizada = await dbGet('SELECT * FROM solicitudes_credito WHERE id = ?', [tarea.solicitud_id]);

  return {
    tarea: tareaActualizada,
    solicitud: solicitudActualizada,
    convergencia_join: resultadoJoin
  };
};

/**
 * Transición de estado manual (por Asesor o Comité) con validación estricta BPM
 */
const transicionarEstadoManual = async (solicitudId, nuevoEstado, motivo, usuario = 'COMITE_RIESGOS') => {
  const solicitud = await dbGet('SELECT * FROM solicitudes_credito WHERE id = ?', [solicitudId]);
  if (!solicitud) {
    throw new Error(`La solicitud ${solicitudId} no existe`);
  }

  if (!validarTransicion(solicitud.estado_actual, nuevoEstado)) {
    throw new Error(`Transición inválida: No está permitido pasar de ${solicitud.estado_actual} a ${nuevoEstado}`);
  }

  await dbRun(
    `UPDATE solicitudes_credito
     SET estado_actual = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [nuevoEstado, solicitudId]
  );

  await registrarAuditoria({
    solicitudId,
    accion: 'TRANSICION_ESTADO_MANUAL',
    usuarioResponsable: usuario,
    resultado: {
      estado_anterior: solicitud.estado_actual,
      nuevo_estado: nuevoEstado,
      motivo
    }
  });

  return await dbGet('SELECT * FROM solicitudes_credito WHERE id = ?', [solicitudId]);
};

module.exports = {
  iniciarSolicitudCredito,
  completarTareaParalela,
  sincronizarJoinTareas,
  transicionarEstadoManual,
  validarTransicion
};

