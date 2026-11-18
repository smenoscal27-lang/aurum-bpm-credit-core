/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Archivo: rule.routes.js
 * Descripción: Rutas Express para gestión de reglas de negocio y simulación,
 *              protegidas con RBAC estricto (ADMIN para modificaciones).
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const {
  listarReglas,
  crearRegla,
  actualizarRegla,
  simularReglas
} = require('./rule.controller');

const {
  autenticarUsuario,
  autorizarRoles,
  generalDirectoryLimiter
} = require('./security.middleware');

/**
 * @route   GET /api/v1/reglas
 * @desc    Listar todas las reglas de negocio declarativas
 * @access  Privado: Roles [ADMIN, COMITE_RIESGOS, AUDITOR_SOX]
 */
router.get(
  '/',
  generalDirectoryLimiter,
  autenticarUsuario,
  autorizarRoles('ADMIN', 'COMITE_RIESGOS', 'AUDITOR_SOX'),
  listarReglas
);

/**
 * @route   POST /api/v1/reglas
 * @desc    Crear una nueva regla declarativa en caliente
 * @access  Privado: Rol [ADMIN]
 */
router.post(
  '/',
  autenticarUsuario,
  autorizarRoles('ADMIN'),
  crearRegla
);

/**
 * @route   PATCH /api/v1/reglas/:id
 * @desc    Modificar condición o estado de una regla en caliente
 * @access  Privado: Rol [ADMIN]
 */
router.patch(
  '/:id',
  autenticarUsuario,
  autorizarRoles('ADMIN'),
  actualizarRegla
);

/**
 * @route   POST /api/v1/reglas/simular
 * @desc    Simulador de evaluación en seco (Dry-run Sandbox)
 * @access  Privado: Roles [ADMIN, COMITE_RIESGOS, ASESOR]
 */
router.post(
  '/simular',
  autenticarUsuario,
  autorizarRoles('ADMIN', 'COMITE_RIESGOS', 'ASESOR'),
  simularReglas
);

module.exports = router;
