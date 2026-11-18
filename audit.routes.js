/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Archivo: audit.routes.js
 * Descripción: Rutas Express para consulta forense, certificación de integridad
 *              y exportación regulatoria protegidas con RBAC (AUDITOR_SOX, ADMIN).
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const {
  listarBitacora,
  verificarIntegridad,
  exportarAuditoria
} = require('./audit.controller');

const {
  autenticarUsuario,
  autorizarRoles,
  generalDirectoryLimiter
} = require('./security.middleware');

/**
 * @route   GET /api/v1/auditoria
 * @desc    Consultar eventos de auditoría con filtros avanzados
 * @access  Privado: Roles [AUDITOR_SOX, ADMIN] | Rate Limit: 100 req / 15 min
 */
router.get(
  '/',
  generalDirectoryLimiter,
  autenticarUsuario,
  autorizarRoles('AUDITOR_SOX', 'ADMIN'),
  listarBitacora
);

/**
 * @route   GET /api/v1/auditoria/verificar-integridad
 * @desc    Verificación criptográfica SHA-256 de inmutabilidad (Merkle-Chain)
 * @access  Privado: Roles [AUDITOR_SOX, ADMIN]
 */
router.get(
  '/verificar-integridad',
  generalDirectoryLimiter,
  autenticarUsuario,
  autorizarRoles('AUDITOR_SOX', 'ADMIN'),
  verificarIntegridad
);

/**
 * @route   GET /api/v1/auditoria/exportar
 * @desc    Exportar bitácora en JSON o CSV con certificado forense
 * @access  Privado: Roles [AUDITOR_SOX, ADMIN]
 */
router.get(
  '/exportar',
  generalDirectoryLimiter,
  autenticarUsuario,
  autorizarRoles('AUDITOR_SOX', 'ADMIN'),
  exportarAuditoria
);

module.exports = router;
