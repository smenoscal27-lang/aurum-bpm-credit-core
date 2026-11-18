/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Archivo: credit.routes.js
 * Descripción: Rutas de Créditos protegidas con RBAC Criptográfico,
 *              Rate Limiting estricto por endpoint y validación con express-validator.
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const {
  crearSolicitud,
  listarSolicitudes,
  obtenerSolicitudPorId,
  transicionarSolicitud
} = require('./credit.controller');

const {
  autenticarUsuario,
  autorizarRoles,
  creditCreationLimiter,
  riskTransitionLimiter,
  generalDirectoryLimiter,
  reglasCrearSolicitud,
  reglasTransicionarSolicitud,
  verificarValidaciones
} = require('./security.middleware');

/**
 * @route   POST /api/v1/creditos
 * @desc    Crear nueva solicitud de crédito y ejecutar motor de reglas BPM
 * @access  Privado: Roles [ASESOR, ADMIN] | Rate Limit: 5 req / 15 min / IP
 */
router.post(
  '/',
  creditCreationLimiter,
  autenticarUsuario,
  autorizarRoles('ASESOR', 'ADMIN'),
  reglasCrearSolicitud,
  verificarValidaciones,
  crearSolicitud
);

/**
 * @route   GET /api/v1/creditos
 * @desc    Listar todas las instancias de crédito con soporte de filtros
 * @access  Privado: Roles [ASESOR, COMITE_RIESGOS, AUDITOR_SOX, ADMIN] | Rate Limit: 100 req / 15 min
 */
router.get(
  '/',
  generalDirectoryLimiter,
  autenticarUsuario,
  autorizarRoles('ASESOR', 'COMITE_RIESGOS', 'AUDITOR_SOX', 'ADMIN'),
  listarSolicitudes
);

/**
 * @route   GET /api/v1/creditos/:id
 * @desc    Obtener detalle de la solicitud, tareas paralelas y bitácora de auditoría
 * @access  Privado: Roles [ASESOR, OFICIAL_CAMPO, COMITE_RIESGOS, AUDITOR_SOX, ADMIN]
 */
router.get(
  '/:id',
  generalDirectoryLimiter,
  autenticarUsuario,
  autorizarRoles('ASESOR', 'OFICIAL_CAMPO', 'COMITE_RIESGOS', 'AUDITOR_SOX', 'ADMIN'),
  obtenerSolicitudPorId
);

/**
 * @route   PATCH /api/v1/creditos/:id/transicionar
 * @desc    Transición de estado manual validada por la máquina de estados BPM
 * @access  Privado: Roles [COMITE_RIESGOS, ADMIN] | Rate Limit: 5 req / 15 min / IP
 */
router.patch(
  '/:id/transicionar',
  riskTransitionLimiter,
  autenticarUsuario,
  autorizarRoles('COMITE_RIESGOS', 'ADMIN'),
  reglasTransicionarSolicitud,
  verificarValidaciones,
  transicionarSolicitud
);

module.exports = router;
