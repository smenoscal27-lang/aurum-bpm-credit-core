/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Archivo: rule.controller.js
 * Descripción: Controlador para la Gestión Dinámica de Reglas de Negocio (BRE)
 *              y Simulador Decisional en Seco (Dry-Run).
 * ============================================================================
 */

const { dbAll, dbGet, dbRun } = require('./database');
const { evaluarSolicitudCredito, seedRulesIfEmpty } = require('./src/services/ruleEngine');
const { sanitizarTexto } = require('./security.middleware');

/**
 * Helper para registrar auditoría inmutable de cambios en las reglas
 */
const registrarAuditoriaRegla = async (accion, usuario, detalle) => {
  const detalleStr = typeof detalle === 'object' ? JSON.stringify(detalle) : String(detalle);
  await dbRun(
    `INSERT INTO bitacora_auditoria (solicitud_id, accion, usuario_responsable, resultado)
     VALUES (NULL, ?, ?, ?)`,
    [accion, usuario, detalleStr]
  );
};

/**
 * @desc    Listar todas las reglas de negocio configuradas en el motor BPM
 * @route   GET /api/v1/reglas
 */
const listarReglas = async (req, res) => {
  try {
    await seedRulesIfEmpty();
    const reglas = await dbAll('SELECT * FROM reglas_negocio ORDER BY id ASC');

    const formateadas = reglas.map(r => {
      let condicionParsed = r.condicion_json;
      try {
        condicionParsed = JSON.parse(r.condicion_json);
      } catch {}
      return {
        ...r,
        condicion_json: condicionParsed,
        activo: Boolean(r.activo)
      };
    });

    return res.status(200).json({
      exito: true,
      total: formateadas.length,
      data: formateadas
    });
  } catch (error) {
    console.error('[-] Error en listarReglas:', error);
    return res.status(500).json({
      exito: false,
      error: 'Error interno del servidor al listar las reglas de negocio.',
      detalle: error.message
    });
  }
};

/**
 * @desc    Crear una nueva regla declarativa en caliente
 * @route   POST /api/v1/reglas
 */
const crearRegla = async (req, res) => {
  try {
    const { nombre_regla, condicion_json, accion_resultado, activo = 1 } = req.body;
    const usuarioResponsable = sanitizarTexto(req.headers['x-user-id'] || 'ADMIN_RIESGOS');

    if (!nombre_regla || !condicion_json || !accion_resultado) {
      return res.status(400).json({
        exito: false,
        error: 'nombre_regla, condicion_json y accion_resultado son campos obligatorios.'
      });
    }

    const nombreLimpio = sanitizarTexto(nombre_regla).toUpperCase().replace(/\s+/g, '_');

    // Validar formato JSON de la condición
    let condicionStr = condicion_json;
    if (typeof condicion_json === 'object') {
      condicionStr = JSON.stringify(condicion_json);
    } else {
      try {
        JSON.parse(condicion_json);
      } catch {
        return res.status(400).json({
          exito: false,
          error: 'El campo condicion_json debe ser un objeto JSON sintácticamente válido.'
        });
      }
    }

    const accionLimpia = sanitizarTexto(accion_resultado).toUpperCase();

    const insertRes = await dbRun(
      `INSERT INTO reglas_negocio (nombre_regla, condicion_json, accion_resultado, activo)
       VALUES (?, ?, ?, ?)`,
      [nombreLimpio, condicionStr, accionLimpia, activo ? 1 : 0]
    );

    // Registro obligatorio en la bitácora inmutable de auditoría
    await registrarAuditoriaRegla(
      'REGLA_NEGOCIO_CREADA',
      usuarioResponsable,
      {
        regla_id: insertRes.lastID,
        nombre_regla: nombreLimpio,
        accion: accionLimpia,
        activo: Boolean(activo)
      }
    );

    const reglaCreada = await dbGet('SELECT * FROM reglas_negocio WHERE id = ?', [insertRes.lastID]);

    return res.status(201).json({
      exito: true,
      mensaje: 'Regla de negocio declarativa creada exitosamente.',
      data: {
        ...reglaCreada,
        condicion_json: JSON.parse(reglaCreada.condicion_json)
      }
    });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        exito: false,
        error: 'Ya existe una regla de negocio con el nombre especificado.'
      });
    }
    console.error('[-] Error en crearRegla:', error);
    return res.status(500).json({
      exito: false,
      error: 'Error interno del servidor al crear la regla.',
      detalle: error.message
    });
  }
};

/**
 * @desc    Actualizar condición o alternar estado (activo/inactivo) de una regla en caliente
 * @route   PATCH /api/v1/reglas/:id
 */
const actualizarRegla = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo, condicion_json, accion_resultado } = req.body;
    const usuarioResponsable = sanitizarTexto(req.headers['x-user-id'] || 'ADMIN_RIESGOS');

    const reglaExistente = await dbGet('SELECT * FROM reglas_negocio WHERE id = ?', [id]);
    if (!reglaExistente) {
      return res.status(404).json({
        exito: false,
        error: `No se encontró la regla con ID ${id}.`
      });
    }

    const campos = [];
    const params = [];
    const cambios = {};

    if (activo !== undefined) {
      const nuevoActivo = activo ? 1 : 0;
      campos.push('activo = ?');
      params.push(nuevoActivo);
      cambios.activo_anterior = reglaExistente.activo;
      cambios.activo_nuevo = nuevoActivo;
    }

    if (condicion_json !== undefined) {
      let condStr = typeof condicion_json === 'object' ? JSON.stringify(condicion_json) : condicion_json;
      try { JSON.parse(condStr); } catch {
        return res.status(400).json({ exito: false, error: 'condicion_json no es un JSON válido.' });
      }
      campos.push('condicion_json = ?');
      params.push(condStr);
      cambios.condicion_actualizada = true;
    }

    if (accion_resultado !== undefined) {
      const nuevaAccion = sanitizarTexto(accion_resultado).toUpperCase();
      campos.push('accion_resultado = ?');
      params.push(nuevaAccion);
      cambios.accion_anterior = reglaExistente.accion_resultado;
      cambios.accion_nueva = nuevaAccion;
    }

    if (campos.length === 0) {
      return res.status(400).json({
        exito: false,
        error: 'No se enviaron campos válidos para actualizar.'
      });
    }

    params.push(id);
    await dbRun(`UPDATE reglas_negocio SET ${campos.join(', ')} WHERE id = ?`, params);

    // Auditoría inmutable de la modificación
    await registrarAuditoriaRegla(
      'REGLA_NEGOCIO_MODIFICADA',
      usuarioResponsable,
      {
        regla_id: id,
        nombre_regla: reglaExistente.nombre_regla,
        cambios
      }
    );

    const reglaActualizada = await dbGet('SELECT * FROM reglas_negocio WHERE id = ?', [id]);

    return res.status(200).json({
      exito: true,
      mensaje: 'Regla de negocio actualizada en caliente exitosamente.',
      data: {
        ...reglaActualizada,
        condicion_json: JSON.parse(reglaActualizada.condicion_json)
      }
    });
  } catch (error) {
    console.error('[-] Error en actualizarRegla:', error);
    return res.status(500).json({
      exito: false,
      error: 'Error interno del servidor al actualizar la regla.',
      detalle: error.message
    });
  }
};

/**
 * @desc    Simulador de Reglas BPM en Seco (Dry-Run Sandbox)
 *          Evalúa una solicitud simulada contra el motor sin persistir registros ni disparar tareas
 * @route   POST /api/v1/reglas/simular
 */
const simularReglas = async (req, res) => {
  try {
    const { ingresos_mensuales, monto_solicitado, plazo_meses } = req.body;

    const ingresosNum = Number(ingresos_mensuales);
    const montoNum = Number(monto_solicitado);
    const plazoNum = parseInt(plazo_meses, 10);

    if (isNaN(ingresosNum) || isNaN(montoNum) || isNaN(plazoNum) || ingresosNum <= 0 || montoNum <= 0 || plazoNum <= 0) {
      return res.status(400).json({
        exito: false,
        error: 'Debe ingresar valores numéricos válidos para ingresos_mensuales, monto_solicitado y plazo_meses.'
      });
    }

    const evaluacion = await evaluarSolicitudCredito({
      id: 0,
      cliente_nombre: 'SIMULACION_SANDBOX',
      cliente_cedula: '0000000000',
      ingresos_mensuales: ingresosNum,
      monto_solicitado: montoNum,
      plazo_meses: plazoNum
    });

    return res.status(200).json({
      exito: true,
      mensaje: 'Simulación de reglas de negocio ejecutada exitosamente (Modo Dry-Run / No persistente).',
      data: {
        parametros_entrada: {
          ingresos_mensuales: ingresosNum,
          monto_solicitado: montoNum,
          plazo_meses: plazoNum
        },
        metricas_derivadas: {
          cuota_estimada_mensual: evaluacion.contexto.cuota_estimada,
          ratio_cuota_ingreso_dti: `${(evaluacion.contexto.ratio_cuota_ingreso * 100).toFixed(2)}%`
        },
        decision_dictamen: evaluacion.decisionFinal,
        nivel_riesgo: evaluacion.nivelRiesgoCalculado,
        trazabilidad_reglas: evaluacion.evaluaciones
      }
    });
  } catch (error) {
    console.error('[-] Error en simularReglas:', error);
    return res.status(500).json({
      exito: false,
      error: 'Error interno del servidor al ejecutar la simulación.',
      detalle: error.message
    });
  }
};

module.exports = {
  listarReglas,
  crearRegla,
  actualizarRegla,
  simularReglas
};

