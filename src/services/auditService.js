/**
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO - FLUJOS DINÁMICOS (BPM)
 * Archivo: src/services/auditService.js
 * Descripción: Servicio de registro inmutable para eventos y cambios de estado BPM.
 */

const { dbRun, dbAll } = require('../../database');

/**
 * Registra un evento en la bitácora inmutable.
 * @param {Object} params
 * @param {number|null} params.solicitudId
 * @param {string} params.accion
 * @param {string} params.usuarioResponsable
 * @param {string|Object} params.resultado
 */
const registrarAuditoria = async ({ solicitudId = null, accion, usuarioResponsable, resultado }) => {
  const resultadoStr = typeof resultado === 'object' ? JSON.stringify(resultado) : String(resultado || '');
  
  return await dbRun(
    `INSERT INTO bitacora_auditoria (solicitud_id, accion, usuario_responsable, resultado)
     VALUES (?, ?, ?, ?)`,
    [solicitudId, accion, usuarioResponsable, resultadoStr]
  );
};

/**
 * Obtiene el historial de auditoría de una solicitud específica.
 * @param {number} solicitudId
 */
const obtenerAuditoriaPorSolicitud = async (solicitudId) => {
  return await dbAll(
    `SELECT id, timestamp, solicitud_id, accion, usuario_responsable, resultado
     FROM bitacora_auditoria
     WHERE solicitud_id = ?
     ORDER BY id ASC`,
    [solicitudId]
  );
};

module.exports = {
  registrarAuditoria,
  obtenerAuditoriaPorSolicitud
};

