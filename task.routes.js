/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Archivo: task.routes.js
 * Descripción: Rutas Express para gestión de tareas paralelas y sincronización Join,
 *              protegidas con RBAC (OFICIAL_CAMPO, ADMIN) y express-validator.
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const {
  listarTareas,
  completarTarea
} = require('./task.controller');

const {
  autenticarUsuario,
  autorizarRoles,
  generalDirectoryLimiter,
  reglasCompletarTarea,
  verificarValidaciones
} = require('./security.middleware');

/**
 * @route   GET /api/v1/tareas
 * @desc    Listar tareas paralelas con filtros (solicitud_id, estado, tipo_tarea)
 * @access  Privado: Roles [OFICIAL_CAMPO, ADMIN]
 */
router.get(
  '/',
  generalDirectoryLimiter,
  autenticarUsuario,
  autorizarRoles('OFICIAL_CAMPO', 'ADMIN'),
  listarTareas
);

/**
 * @route   PATCH /api/v1/tareas/:id/completar
 * @desc    Completar/Rechazar tarea paralela y evaluar convergencia Join
 * @access  Privado: Roles [OFICIAL_CAMPO, ADMIN]
 */
router.patch(
  '/:id/completar',
  autenticarUsuario,
  autorizarRoles('OFICIAL_CAMPO', 'ADMIN'),
  reglasCompletarTarea,
  verificarValidaciones,
  completarTarea
);

module.exports = router;
