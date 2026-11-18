/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Archivo: credit.controller.js
 * Descripción: Controlador BPM para la orquestación de instancias de crédito,
 *              evaluación dinámica de reglas y registro de auditoría inmutable.
 * ============================================================================
 */

const { dbRun, dbGet, dbAll } = require('./database');
const {
  sanitizarTexto,
  validarNombreCliente,
  validarCedula
} = require('./security.middleware');

/**
 * Helper para registrar eventos de auditoría inmutable en SQLite
 * Nota: Cualquier intento futuro de UPDATE o DELETE sobre esta tabla será
 * abortado por los triggers inmutables de la base de datos.
 */
const registrarAuditoria = async (solicitudId, accion, usuarioResponsable, resultado) => {
  const idLimpio = solicitudId != null ? Number(solicitudId) : null;
  const usuarioLimpio = usuarioResponsable || 'SISTEMA_BPM';
  const resultadoTexto = typeof resultado === 'object' ? JSON.stringify(resultado) : String(resultado || '');
  
  await dbRun(
    `INSERT INTO bitacora_auditoria (solicitud_id, accion, usuario_responsable, resultado)
     VALUES (?, ?, ?, ?)`,
    [idLimpio, accion, usuarioLimpio, resultadoTexto]
  );
};

/**
 * @desc    Crear una nueva solicitud de crédito y evaluar reglas de negocio BPM
 * @route   POST /api/v1/creditos
 */
const crearSolicitud = async (req, res) => {
  try {
    // 0. Validación de existencia y tipo de cuerpo de la petición
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        exito: false,
        error: 'El cuerpo de la petición debe ser un objeto JSON válido y no vacío.',
        codigo_seguridad: 'SEC_INVALID_PAYLOAD'
      });
    }

    const {
      cliente_nombre,
      cliente_cedula,
      ingresos_mensuales,
      monto_solicitado,
      plazo_meses,
      asesor_id = 'ASESOR_CANAL_DIGITAL'
    } = req.body;

    const usuarioResponsable = sanitizarTexto(req.user?.id || req.headers['x-user-id'] || 'SISTEMA_BPM');

    // 1. Validación Rigurosa de Nombre (Bloqueo estricto de Scripts, Tags HTML y Vectores XSS)
    if (!cliente_nombre || typeof cliente_nombre !== 'string' || !validarNombreCliente(cliente_nombre)) {
      return res.status(400).json({
        exito: false,
        error: 'El nombre del cliente no es válido o contiene caracteres no permitidos. Debe contener solo caracteres alfabéticos (3-80 caracteres) sin etiquetas HTML ni scripts.',
        codigo_seguridad: 'SEC_INVALID_NAME'
      });
    }

    // 2. Validación Rigurosa de Cédula (Bloqueo de Inyecciones SQL y Caracteres Especiales)
    if (!cliente_cedula || typeof cliente_cedula !== 'string' || !validarCedula(cliente_cedula)) {
      return res.status(400).json({
        exito: false,
        error: 'La cédula o documento de identidad contiene caracteres inválidos. Debe contener entre 6 y 15 caracteres alfanuméricos sin espacios ni símbolos.',
        codigo_seguridad: 'SEC_INVALID_DOCUMENT'
      });
    }

    // 3. Sanitización de Textos (Defensa en Profundidad)
    const nombreLimpio = sanitizarTexto(cliente_nombre);
    const cedulaLimpia = sanitizarTexto(cliente_cedula);
    const asesorLimpio = sanitizarTexto(asesor_id || 'ASESOR_CANAL_DIGITAL');

    // 4. Validaciones y Normalización de Rangos Numéricos Financieros
    const parseNumberSafe = (val) => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') return Number(val.replace(/[$,]/g, '').trim());
      return NaN;
    };

    const ingresosNum = parseNumberSafe(ingresos_mensuales);
    const montoNum = parseNumberSafe(monto_solicitado);
    const plazoNum = parseInt(plazo_meses, 10);

    if (isNaN(ingresosNum) || ingresosNum < 100 || ingresosNum > 1000000) {
      return res.status(400).json({
        exito: false,
        error: 'Los ingresos mensuales deben ser un valor numérico válido entre $100 y $1,000,000 USD.'
      });
    }

    if (isNaN(montoNum) || montoNum < 100 || montoNum > 500000) {
      return res.status(400).json({
        exito: false,
        error: 'El monto solicitado debe ser un valor numérico válido entre $100 y $500,000 USD.'
      });
    }

    if (isNaN(plazoNum) || plazoNum < 1 || plazoNum > 120) {
      return res.status(400).json({
        exito: false,
        error: 'El plazo en meses debe ser un entero entre 1 y 120 meses (máx. 10 años).'
      });
    }

    // 5. Transición Inicial BPM: Creación de la instancia en estado 'Recibido' con parámetros seguros
    const creacionResult = await dbRun(
      `INSERT INTO solicitudes_credito (
        cliente_nombre, cliente_cedula, ingresos_mensuales, monto_solicitado, plazo_meses, estado_actual, nivel_riesgo, asesor_id
      ) VALUES (?, ?, ?, ?, ?, 'Recibido', 'Pendiente', ?)`,
      [nombreLimpio, cedulaLimpia, ingresosNum, montoNum, plazoNum, asesorLimpio]
    );

    const solicitudId = Number(creacionResult.lastID);

    // 6. Auditoría Obligatoria: Evento de Creación
    await registrarAuditoria(
      solicitudId,
      'SOLICITUD_CREADA',
      usuarioResponsable,
      {
        estado: 'Recibido',
        cliente_cedula: cedulaLimpia,
        monto: montoNum,
        ingresos: ingresosNum,
        plazo: plazoNum
      }
    );

    // 7. Evaluación de Reglas de Negocio BPM (Motor Decisional Dinámico)
    // REGLA:
    // Si monto_solicitado <= $5,000 e ingresos_mensuales > $1,000 -> 'Aprobado' (Riesgo Bajo)
    // Si monto_solicitado > $15,000 o ingresos_mensuales < $500    -> 'Revision_Riesgo' (Riesgo Alto / Comité)
    // En otro caso                                              -> 'Tareas_Paralelas' (Riesgo Medio / Verificación)
    let estadoNuevo;
    let nivelRiesgo;
    let justificacionRegla;
    let tareasCreadas = [];

    if (montoNum <= 5000 && ingresosNum > 1000) {
      estadoNuevo = 'Aprobado';
      nivelRiesgo = 'Bajo';
      justificacionRegla = 'Aprobación directa automática: Monto <= $5,000 con ingresos > $1,000.';
    } else if (montoNum > 15000 || ingresosNum < 500) {
      estadoNuevo = 'Revision_Riesgo';
      nivelRiesgo = 'Alto';
      justificacionRegla = 'Escalado a riesgos: Monto elevado (> $15,000) o ingresos ajustados (< $500).';
    } else {
      estadoNuevo = 'Tareas_Paralelas';
      nivelRiesgo = 'Medio';
      justificacionRegla = 'Riesgo estándar: Disparo de sub-flujos de verificación en paralelo (Fork).';
    }

    // 8. Actualización de la Instancia de Crédito con el resultado de la Regla
    try {
      await dbRun(
        `UPDATE solicitudes_credito
         SET estado_actual = ?, nivel_riesgo = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [estadoNuevo, nivelRiesgo, solicitudId]
      );
    } catch (updateErr) {
      if (updateErr.message && updateErr.message.includes('no such column: updated_at')) {
        await dbRun(
          `UPDATE solicitudes_credito
           SET estado_actual = ?, nivel_riesgo = ?
           WHERE id = ?`,
          [estadoNuevo, nivelRiesgo, solicitudId]
        );
      } else {
        throw updateErr;
      }
    }

    // 9. Auditoría Obligatoria: Cambio de Estado por Reglas
    await registrarAuditoria(
      solicitudId,
      'EVALUACION_REGLA_NEGOCIO',
      'MOTOR_REGLAS_BPM',
      {
        estado_previo: 'Recibido',
        nuevo_estado: estadoNuevo,
        nivel_riesgo: nivelRiesgo,
        justificacion: justificacionRegla
      }
    );

    // 10. Si el flujo requiere 'Tareas_Paralelas', instanciamos el patrón BPM Fork
    if (estadoNuevo === 'Tareas_Paralelas') {
      const tiposTareas = ['Verificacion_Domicilio', 'Referencias_Telefonicas'];
      
      for (const tipo of tiposTareas) {
        const tareaRes = await dbRun(
          `INSERT INTO tareas_paralelas (solicitud_id, tipo_tarea, estado, asignado_a)
           VALUES (?, ?, 'Pendiente', ?)`,
          [solicitudId, tipo, `OFICIAL_${tipo.toUpperCase()}`]
        );
        tareasCreadas.push({
          id: tareaRes.lastID,
          tipo_tarea: tipo,
          estado: 'Pendiente'
        });
      }

      // Auditoría Obligatoria: Disparo de tareas concurrentes
      await registrarAuditoria(
        solicitudId,
        'DISPARO_TAREAS_PARALELAS_FORK',
        'MOTOR_BPM',
        { tareas_instanciadas: tareasCreadas }
      );
    }

    // 11. Recuperar el registro completo final de la solicitud
    const solicitudFinal = await dbGet(
      `SELECT * FROM solicitudes_credito WHERE id = ?`,
      [solicitudId]
    );

    return res.status(201).json({
      exito: true,
      mensaje: 'Solicitud de crédito procesada exitosamente por el motor BPM.',
      data: {
        solicitud: solicitudFinal,
        decision_bpm: {
          estado_asignado: estadoNuevo,
          nivel_riesgo: nivelRiesgo,
          justificacion: justificacionRegla,
          tareas_paralelas: tareasCreadas
        }
      }
    });
  } catch (error) {
    console.error('================================================================');
    console.error('[-] ERROR CRÍTICO CAPTURADO EN crearSolicitud:');
    console.error(`Mensaje: ${error.message}`);
    console.error(`Nombre: ${error.name || 'Error'}`);
    console.error(`Código: ${error.code || 'N/A'}`);
    console.error('Traza del error (Stack Trace):');
    console.error(error.stack || error);
    console.error('Cuerpo de la petición recibido (Payload):', req.body);
    console.error('================================================================');

    if (!res.headersSent) {
      return res.status(500).json({
        exito: false,
        error: error.message || 'Error interno del servidor al procesar la solicitud de crédito en SQLite/BPM.',
        detalle: error.message,
        codigo_error: error.code || 'SQLITE_OR_SERVER_ERROR'
      });
    }
  }
};

/**
 * @desc    Listar todas las solicitudes de crédito con filtros opcionales
 * @route   GET /api/v1/creditos
 */
const listarSolicitudes = async (req, res) => {
  try {
    const { estado, cedula, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM solicitudes_credito WHERE 1=1';
    const params = [];

    if (estado) {
      query += ' AND estado_actual = ?';
      params.push(estado);
    }

    if (cedula) {
      query += ' AND cliente_cedula = ?';
      params.push(cedula);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const solicitudes = await dbAll(query, params);

    // Obtener total para metadatos de paginación
    let countQuery = 'SELECT COUNT(*) as total FROM solicitudes_credito WHERE 1=1';
    const countParams = [];
    if (estado) {
      countQuery += ' AND estado_actual = ?';
      countParams.push(estado);
    }
    if (cedula) {
      countQuery += ' AND cliente_cedula = ?';
      countParams.push(cedula);
    }
    const totalRow = await dbGet(countQuery, countParams);

    return res.status(200).json({
      exito: true,
      total: totalRow.total,
      data: solicitudes
    });
  } catch (error) {
    console.error('[-] Error en listarSolicitudes:', error);
    return res.status(500).json({
      exito: false,
      error: 'Error interno del servidor al listar las solicitudes.',
      detalle: error.message
    });
  }
};

/**
 * @desc    Obtener detalle de una solicitud, sus tareas paralelas y su historial de auditoría
 * @route   GET /api/v1/creditos/:id
 */
const obtenerSolicitudPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const solicitud = await dbGet('SELECT * FROM solicitudes_credito WHERE id = ?', [id]);
    if (!solicitud) {
      return res.status(404).json({
        exito: false,
        error: `No se encontró la solicitud de crédito con ID ${id}.`
      });
    }

    // Obtener sub-flujos (tareas paralelas asociadas)
    const tareas = await dbAll(
      'SELECT * FROM tareas_paralelas WHERE solicitud_id = ? ORDER BY id ASC',
      [id]
    );

    // Obtener bitácora inmutable de eventos
    const auditoria = await dbAll(
      `SELECT id, timestamp, accion, usuario_responsable, resultado
       FROM bitacora_auditoria
       WHERE solicitud_id = ?
       ORDER BY id ASC`,
      [id]
    );

    return res.status(200).json({
      exito: true,
      data: {
        solicitud,
        tareas_paralelas: tareas,
        bitacora_auditoria: auditoria.map(ev => ({
          ...ev,
          resultado: (() => {
            try { return JSON.parse(ev.resultado); }
            catch { return ev.resultado; }
          })()
        }))
      }
    });
  } catch (error) {
    console.error('[-] Error en obtenerSolicitudPorId:', error);
    return res.status(500).json({
      exito: false,
      error: 'Error interno del servidor al obtener el detalle de la solicitud.',
      detalle: error.message
    });
  }
};

/**
 * @desc    Transición de estado manual (Comité de Riesgos / Analista Senior)
 * @route   PATCH /api/v1/creditos/:id/transicionar
 */
const transicionarSolicitud = async (req, res) => {
  try {
    const { id } = req.params;
    const { nuevo_estado, motivo } = req.body;
    const usuarioResponsable = sanitizarTexto(req.user?.id || req.headers['x-user-id'] || 'COMITE_RIESGOS');

    const TRANSICIONES_PERMITIDAS = {
      'Recibido': ['Revision_Riesgo', 'En_Evaluacion', 'Tareas_Paralelas', 'Aprobado', 'Rechazado', 'Cancelado'],
      'Revision_Riesgo': ['Tareas_Paralelas', 'Aprobado', 'Rechazado', 'Cancelado'],
      'Tareas_Paralelas': ['Revision_Riesgo', 'Aprobado', 'Rechazado', 'Cancelado'],
      'Aprobado': [],
      'Rechazado': [],
      'Cancelado': []
    };

    const solicitud = await dbGet('SELECT * FROM solicitudes_credito WHERE id = ?', [id]);
    if (!solicitud) {
      return res.status(404).json({
        exito: false,
        error: `No se encontró la solicitud de crédito con ID ${id}.`
      });
    }

    const permitidos = TRANSICIONES_PERMITIDAS[solicitud.estado_actual] || [];
    if (!permitidos.includes(nuevo_estado)) {
      return res.status(400).json({
        exito: false,
        error: `Transición no permitida en la máquina de estados BPM: '${solicitud.estado_actual}' -> '${nuevo_estado}'.`
      });
    }

    if (!motivo || motivo.trim().length === 0) {
      return res.status(400).json({
        exito: false,
        error: 'Debe especificarse un motivo fundamentado para la transición manual de estado.'
      });
    }

    try {
      await dbRun(
        `UPDATE solicitudes_credito
         SET estado_actual = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nuevo_estado, id]
      );
    } catch (updateErr) {
      if (updateErr.message && updateErr.message.includes('no such column: updated_at')) {
        await dbRun(
          `UPDATE solicitudes_credito
           SET estado_actual = ?
           WHERE id = ?`,
          [nuevo_estado, id]
        );
      } else {
        throw updateErr;
      }
    }

    await registrarAuditoria(
      id,
      'TRANSICION_MANUAL_ESTADO',
      usuarioResponsable,
      {
        estado_anterior: solicitud.estado_actual,
        nuevo_estado,
        motivo: motivo.trim()
      }
    );

    const solicitudActualizada = await dbGet('SELECT * FROM solicitudes_credito WHERE id = ?', [id]);

    return res.status(200).json({
      exito: true,
      mensaje: `Transición de estado aplicada exitosamente a '${nuevo_estado}'.`,
      data: solicitudActualizada
    });
  } catch (error) {
    console.error('[-] Error en transicionarSolicitud:', error);
    return res.status(500).json({
      exito: false,
      error: 'Error interno del servidor al transicionar el crédito.',
      detalle: error.message
    });
  }
};

module.exports = {
  crearSolicitud,
  listarSolicitudes,
  obtenerSolicitudPorId,
  transicionarSolicitud
};

