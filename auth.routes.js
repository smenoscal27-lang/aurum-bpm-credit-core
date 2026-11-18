/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Archivo: auth.routes.js
 * Descripción: Rutas de Autenticación, Verificación de Sesión y Directorio RBAC
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('./auth.controller');
const { autenticarUsuario } = require('./security.middleware');

// Rate limiter específico para intentos de autenticación (30 intentos por 15m)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    exito: false,
    codigo_seguridad: 'SEC_AUTH_RATE_LIMIT_EXCEEDED',
    error: 'Demasiados intentos de autenticación. Por favor intente más tarde.'
  }
});

/**
 * @route   POST /api/v1/auth/login
 * @desc    Inicio de sesión institucional para operadores bancarios AURUM
 * @access  Público (protegido por Rate Limiting & Fail2Ban)
 */
router.post('/login', loginLimiter, authController.login);

/**
 * @route   POST /api/v1/auth
 * @desc    Alias de autenticación para compatibilidad con clientes REST
 * @access  Público
 */
router.post('/', loginLimiter, authController.login);

/**
 * @route   GET /api/v1/auth/usuarios-prueba
 * @desc    Obtener lista de usuarios predefinidos de prueba con roles institucionales
 * @access  Público
 */
router.get('/usuarios-prueba', authController.listarUsuariosPrueba);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Obtener la sesión actual autenticada e inspeccionada por RBAC
 * @access  Privado (requiere cabeceras x-user-id / x-user-role)
 */
router.get('/me', autenticarUsuario, authController.obtenerSesionActual);

module.exports = router;
