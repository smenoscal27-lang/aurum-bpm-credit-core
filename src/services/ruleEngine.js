/**
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO - FLUJOS DINÁMICOS (BPM)
 * Archivo: src/services/ruleEngine.js
 * Descripción: Motor de Reglas de Negocio (BRE - Business Rules Engine) declarativo.
 */

const { dbAll, dbRun } = require('../../database');

/**
 * Semilla de reglas predeterminadas para evaluación de riesgo crediticio
 */
const REGLAS_INICIALES = [
  {
    nombre_regla: 'R01_INGRESOS_MINIMOS',
    condicion_json: JSON.stringify({
      campo: 'ingresos_mensuales',
      operador: '<',
      valor: 500,
      mensaje: 'Ingresos mensuales inferiores al salario base mínimo ($500)'
    }),
    accion_resultado: 'RECHAZAR_AUTOMATICO'
  },
  {
    nombre_regla: 'R02_CAPACIDAD_PAGO_DTI',
    condicion_json: JSON.stringify({
      campo: 'ratio_cuota_ingreso',
      operador: '>',
      valor: 0.40,
      mensaje: 'La cuota estimada excede el 40% del ingreso mensual neto'
    }),
    accion_resultado: 'RECHAZAR_AUTOMATICO'
  },
  {
    nombre_regla: 'R03_MONTO_ALTO_COMITE',
    condicion_json: JSON.stringify({
      campo: 'monto_solicitado',
      operador: '>=',
      valor: 20000,
      mensaje: 'Monto solicitado mayor o igual a $20,000 requiere revisión del Comité de Riesgos'
    }),
    accion_resultado: 'REVISION_COMITE_RIESGOS'
  },
  {
    nombre_regla: 'R04_REQUIERE_VERIFICACION_PARALELA',
    condicion_json: JSON.stringify({
      and: [
        { campo: 'monto_solicitado', operador: '>=', valor: 3000 },
        { campo: 'monto_solicitado', operador: '<', valor: 20000 },
        { campo: 'ratio_cuota_ingreso', operador: '<=', valor: 0.40 }
      ],
      mensaje: 'Monto en rango medio requiere verificación paralela domiciliaria y laboral'
    }),
    accion_resultado: 'DISPARAR_TAREAS_PARALELAS'
  },
  {
    nombre_regla: 'R05_APROBACION_DIRECTA_BAJO_RIESGO',
    condicion_json: JSON.stringify({
      and: [
        { campo: 'monto_solicitado', operador: '<', valor: 3000 },
        { campo: 'ratio_cuota_ingreso', operador: '<=', valor: 0.25 }
      ],
      mensaje: 'Monto menor a $3,000 con baja relación cuota/ingreso (<=25%)'
    }),
    accion_resultado: 'APROBACION_DIRECTA'
  }
];

/**
 * Asegura la carga de las reglas maestras en la tabla reglas_negocio
 */
const seedRulesIfEmpty = async () => {
  const existingRules = await dbAll('SELECT COUNT(*) as total FROM reglas_negocio');
  if (existingRules[0].total === 0) {
    console.log('[*] Sembrando reglas de negocio BPM predeterminadas...');
    for (const regla of REGLAS_INICIALES) {
      await dbRun(
        `INSERT OR IGNORE INTO reglas_negocio (nombre_regla, condicion_json, accion_resultado, activo)
         VALUES (?, ?, ?, 1)`,
        [regla.nombre_regla, regla.condicion_json, regla.accion_resultado]
      );
    }
    console.log('[+] Reglas de negocio inicializadas exitosamente.');
  }
};

/**
 * Calcula métricas financieras derivadas para alimentar el motor de reglas
 */
const calcularMetricasSolicitud = (solicitud) => {
  const { monto_solicitado, ingresos_mensuales, plazo_meses } = solicitud;
  // Amortización simple con tasa mensual estimada (1.5% mensual)
  const tasaMensual = 0.015;
  const cuotaEstimada = plazo_meses > 0 
    ? (monto_solicitado * (1 + tasaMensual * plazo_meses)) / plazo_meses
    : monto_solicitado;

  const ratioCuotaIngreso = ingresos_mensuales > 0 
    ? Number((cuotaEstimada / ingresos_mensuales).toFixed(4)) 
    : 1.0;

  return {
    ...solicitud,
    cuota_estimada: Number(cuotaEstimada.toFixed(2)),
    ratio_cuota_ingreso: ratioCuotaIngreso
  };
};

/**
 * Evaluador de cláusulas individuales
 */
const evaluarClausula = (clausula, contexto) => {
  const { campo, operador, valor } = clausula;
  const valorContexto = contexto[campo];

  if (valorContexto === undefined) return false;

  switch (operador) {
    case '<': return valorContexto < valor;
    case '<=': return valorContexto <= valor;
    case '>': return valorContexto > valor;
    case '>=': return valorContexto >= valor;
    case '==':
    case '=': return valorContexto === valor;
    case '!=': return valorContexto !== valor;
    case 'in': return Array.isArray(valor) && valor.includes(valorContexto);
    default: return false;
  }
};

/**
 * Evaluador booleano de condición (admite 'and', 'or', o cláusula directa)
 */
const evaluarCondicion = (condicion, contexto) => {
  if (condicion.and && Array.isArray(condicion.and)) {
    return condicion.and.every(c => evaluarCondicion(c, contexto));
  }
  if (condicion.or && Array.isArray(condicion.or)) {
    return condicion.or.some(c => evaluarCondicion(c, contexto));
  }
  return evaluarClausula(condicion, contexto);
};

/**
 * Ejecuta el conjunto activo de reglas de negocio sobre una solicitud de crédito
 * @param {Object} solicitudRaw 
 * @returns {Promise<Object>} Resultado con reglas ejecutadas, decisión y nivel de riesgo
 */
const evaluarSolicitudCredito = async (solicitudRaw) => {
  await seedRulesIfEmpty();
  const contexto = calcularMetricasSolicitud(solicitudRaw);

  const reglasActivas = await dbAll(
    'SELECT id, nombre_regla, condicion_json, accion_resultado FROM reglas_negocio WHERE activo = 1 ORDER BY id ASC'
  );

  const evaluaciones = [];
  let decisionFinal = null;
  let nivelRiesgoCalculado = 'Bajo';

  for (const regla of reglasActivas) {
    let condicion;
    try {
      condicion = JSON.parse(regla.condicion_json);
    } catch {
      continue;
    }

    const cumple = evaluarCondicion(condicion, contexto);
    evaluaciones.push({
      regla_id: regla.id,
      nombre_regla: regla.nombre_regla,
      cumple,
      accion: regla.accion_resultado,
      mensaje: condicion.mensaje || ''
    });

    // Cortocircuito prioritario:
    // 1. Rechazo automático (Riesgo Crítico / Violación estricta de políticas)
    if (cumple && regla.accion_resultado === 'RECHAZAR_AUTOMATICO' && !decisionFinal) {
      decisionFinal = 'RECHAZAR_AUTOMATICO';
      nivelRiesgoCalculado = 'Critico';
      break;
    }

    // 2. Revisión de comité por monto alto (Riesgo Alto)
    if (cumple && regla.accion_resultado === 'REVISION_COMITE_RIESGOS' && !decisionFinal) {
      decisionFinal = 'REVISION_COMITE_RIESGOS';
      nivelRiesgoCalculado = 'Alto';
    }

    // 3. Verificación paralela requerida (Riesgo Medio)
    if (cumple && regla.accion_resultado === 'DISPARAR_TAREAS_PARALELAS' && !decisionFinal) {
      decisionFinal = 'DISPARAR_TAREAS_PARALELAS';
      nivelRiesgoCalculado = 'Medio';
    }

    // 4. Aprobación directa (Riesgo Bajo)
    if (cumple && regla.accion_resultado === 'APROBACION_DIRECTA' && !decisionFinal) {
      decisionFinal = 'APROBACION_DIRECTA';
      nivelRiesgoCalculado = 'Bajo';
    }
  }

  if (!decisionFinal) {
    decisionFinal = 'REVISION_RIESGO_MANUAL';
    nivelRiesgoCalculado = 'Medio';
  }

  return {
    contexto,
    decisionFinal,
    nivelRiesgoCalculado,
    evaluaciones
  };
};

module.exports = {
  seedRulesIfEmpty,
  evaluarSolicitudCredito,
  calcularMetricasSolicitud
};

