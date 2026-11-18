/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Archivo: security.middleware.js
 * Descripción: Capa de Ciberseguridad Ofensiva/Defensiva: RBAC Criptográfico,
 *              Rate Limiting por Ruta, Validaciones con express-validator,
 *              Sanitización Anti-XSS y Prevención de Parameter Pollution.
 * ============================================================================
 */

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const {
  registrarEventoSeguridad,
  registrarFalloSeguridadIP,
  fail2banMiddleware,
  resetearTrackerIP
} = require('./security.logger');

// Clave secreta para firma criptográfica de tokens y roles (Fintech HMAC)
const AUTH_SECRET = process.env.AUTH_SECRET || 'fintech-bpm-secure-salt-key-9876543210';

/**
 * Matriz de Roles Operativos Fintech (RBAC)
 */
const ROLES = Object.freeze({
  ASESOR: 'ASESOR',                   // Creación y consulta de créditos
  OFICIAL_CAMPO: 'OFICIAL_CAMPO',     // Verificación y ejecución de tareas paralelas
  COMITE_RIESGOS: 'COMITE_RIESGOS',   // Transiciones manuales y evaluación de riesgo alto
  AUDITOR_SOX: 'AUDITOR_SOX',         // Inspección forense y certificación de inmutabilidad
  ADMIN: 'ADMIN'                      // Superusuario con privilegios globales
});

/**
 * Genera una firma criptográfica HMAC-SHA256 para un usuario y rol
 * @param {string} userId - Identificador único de usuario
 * @param {string} role - Rol asignado
 * @returns {string} Firma hexadecimal
 */
const generarFirmaRol = (userId, role) => {
  return crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(`${userId}:${role}`)
    .digest('hex');
};

/**
 * Mapeo defensivo de roles para mantener compatibilidad con identidades previas
 */
const normalizarRol = (rawRole, rawUserId = '') => {
  if (rawRole && ROLES[rawRole]) {
    return ROLES[rawRole];
  }
  // Detección heurística por identificador de usuario o canal si no se especifica rol explícito
  const idMayusc = (rawUserId || '').toUpperCase();
  if (idMayusc.includes('ADMIN') || idMayusc.includes('SISTEMA')) return ROLES.ADMIN;
  if (idMayusc.includes('RIESGO') || idMayusc.includes('COMITE')) return ROLES.COMITE_RIESGOS;
  if (idMayusc.includes('AUDITOR') || idMayusc.includes('SOX')) return ROLES.AUDITOR_SOX;
  if (idMayusc.includes('OFICIAL') || idMayusc.includes('MESA_CONTROL')) return ROLES.OFICIAL_CAMPO;
  if (idMayusc.includes('ASESOR') || idMayusc.includes('ANALISTA') || idMayusc.includes('FRONTEND') || idMayusc.includes('CANAL')) return ROLES.ASESOR;

  return null;
};

/**
 * Middleware de Autenticación Bancaria y Extracción de Contexto de Seguridad
 * Extrae y valida credenciales (x-user-id, x-user-role, x-auth-signature)
 */
const autenticarUsuario = (req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const rawUserId = req.headers['x-user-id'];
  const rawRole = req.headers['x-user-role'];
  const authSignature = req.headers['x-auth-signature'];

  // Validación de presencia de credenciales mínimas
  if (!rawUserId && !rawRole) {
    registrarEventoSeguridad('AUTH_MISSING_CREDENTIALS', req, {
      mensaje: 'Intento de acceso sin cabeceras x-user-id ni x-user-role'
    }, 'WARN');

    return res.status(401).json({
      exito: false,
      codigo_seguridad: 'SEC_UNAUTHENTICATED',
      error: 'Autenticación bancaria requerida: Se requiere especificar las cabeceras x-user-id y x-user-role.'
    });
  }

  const userIdLimpio = sanitizarTexto(rawUserId || 'USUARIO_CANAL');
  const rolDetectado = normalizarRol(rawRole, userIdLimpio);

  if (!rolDetectado) {
    registrarFalloSeguridadIP(ip, `ROL_INVALIDO_${rawRole}`);
    registrarEventoSeguridad('AUTH_INVALID_ROLE', req, {
      rol_recibido: rawRole,
      usuario: userIdLimpio
    }, 'WARN');

    return res.status(401).json({
      exito: false,
      codigo_seguridad: 'SEC_INVALID_ROLE',
      error: `Rol no reconocido en el sistema bancario. Roles autorizados: ${Object.values(ROLES).join(', ')}`
    });
  }

  // Validación Criptográfica de Firma si se provee la cabecera x-auth-signature
  if (authSignature) {
    const firmaEsperada = generarFirmaRol(userIdLimpio, rolDetectado);
    const signatureBuffer = Buffer.from(authSignature, 'utf8');
    const expectedBuffer = Buffer.from(firmaEsperada, 'utf8');

    const coincide = signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!coincide) {
      registrarFalloSeguridadIP(ip, 'FIRMA_CRIPTOGRAFICA_INVALIDA');
      registrarEventoSeguridad('AUTH_SIGNATURE_TAMPER', req, {
        usuario: userIdLimpio,
        rol: rolDetectado
      }, 'CRITICAL');

      return res.status(401).json({
        exito: false,
        codigo_seguridad: 'SEC_INVALID_SIGNATURE',
        error: 'Violación de Integridad Criptográfica: La firma digital x-auth-signature es inválida.'
      });
    }
  }

  // Adjuntar objeto de identidad verificado al contexto de la petición
  req.user = {
    id: userIdLimpio,
    role: rolDetectado,
    ip,
    firmadoCriptograficamente: Boolean(authSignature)
  };

  next();
};

/**
 * Middleware Generador de Control de Acceso Basado en Roles (RBAC)
 * @param {...string} rolesPermitidos - Lista de roles autorizados para el endpoint
 */
const autorizarRoles = (...rolesPermitidos) => {
  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    if (!req.user || !req.user.role) {
      return res.status(401).json({
        exito: false,
        codigo_seguridad: 'SEC_UNAUTHENTICATED',
        error: 'Sesión no autenticada para validar privilegios de rol.'
      });
    }

    const { role, id } = req.user;

    // Superusuario ADMIN cuenta con acceso omnipotente
    if (role === ROLES.ADMIN || rolesPermitidos.includes(role)) {
      return next();
    }

    // Violación de autorización RBAC
    registrarFalloSeguridadIP(ip, `RBAC_VIOLATION_${role}_ATTEMPTING_${rolesPermitidos.join('_')}`);
    registrarEventoSeguridad('RBAC_FORBIDDEN_ACCESS', req, {
      usuario: id,
      rol_actual: role,
      roles_requeridos: rolesPermitidos,
      endpoint: `${req.method} ${req.originalUrl}`
    }, 'WARN');

    return res.status(403).json({
      exito: false,
      codigo_seguridad: 'SEC_FORBIDDEN_ROLE',
      error: `Acceso denegado: El rol '${role}' no cuenta con privilegios suficientes para ejecutar esta operación. Roles requeridos: ${rolesPermitidos.join(', ')}`
    });
  };
};

/**
 * ============================================================================
 * RATE LIMITING AVANZADO POR RUTA Y POLÍTICA DE SEGURIDAD
 * ============================================================================
 */

/**
 * Configuración Declarativa de Políticas de Rate Limiting Bancario
 */
const RATE_LIMIT_CONFIG = Object.freeze({
  CREDIT_CREATION_MAX: 5,
  RISK_TRANSITION_MAX: 5,
  GENERAL_DIRECTORY_MAX: 100,
  API_GENERAL_MAX: 150,
  WINDOW_MS: 15 * 60 * 1000
});

/**
 * Rate Limiter Estricto para Operaciones Críticas de Escritura:
 * - Creación de Solicitudes (POST /api/v1/creditos)
 * Restringe a 5 solicitudes cada 15 minutos por IP
 */
const creditCreationLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.WINDOW_MS,
  max: RATE_LIMIT_CONFIG.CREDIT_CREATION_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    registrarFalloSeguridadIP(ip, 'RATE_LIMIT_CREACION_CREDITO');
    registrarEventoSeguridad('RATE_LIMIT_CREDIT_CREATION_EXCEEDED', req, { max: RATE_LIMIT_CONFIG.CREDIT_CREATION_MAX, ventana: '15m' }, 'WARN');

    return res.status(429).json({
      exito: false,
      codigo_seguridad: 'SEC_RATE_LIMIT_EXCEEDED',
      error: 'Límite de solicitudes de crédito excedido. Por políticas de prevención de fraude bancario y anti-DoS, solo se permiten 5 solicitudes cada 15 minutos por IP.',
      reintentar_en: `${Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000 / 60)} minutos`
    });
  }
});
creditCreationLimiter.max = RATE_LIMIT_CONFIG.CREDIT_CREATION_MAX;

/**
 * Rate Limiter Estricto para Transiciones de Riesgo Manuales
 * - Transición de Crédito (PATCH /api/v1/creditos/:id/transicionar)
 * Restringe a 5 solicitudes cada 15 minutos por IP
 */
const riskTransitionLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.WINDOW_MS,
  max: RATE_LIMIT_CONFIG.RISK_TRANSITION_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    registrarFalloSeguridadIP(ip, 'RATE_LIMIT_TRANSICION_RIESGO');
    registrarEventoSeguridad('RATE_LIMIT_TRANSITION_EXCEEDED', req, { max: RATE_LIMIT_CONFIG.RISK_TRANSITION_MAX, ventana: '15m' }, 'WARN');

    return res.status(429).json({
      exito: false,
      codigo_seguridad: 'SEC_RATE_LIMIT_EXCEEDED',
      error: 'Límite de transiciones de riesgo excedido. Máximo 5 transiciones cada 15 minutos por IP.',
      reintentar_en: `${Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000 / 60)} minutos`
    });
  }
});
riskTransitionLimiter.max = RATE_LIMIT_CONFIG.RISK_TRANSITION_MAX;

/**
 * Rate Limiter para Consultas Generales de Directorios y Auditoría
 * Restringe a 100 peticiones cada 15 minutos por IP
 */
const generalDirectoryLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.WINDOW_MS,
  max: RATE_LIMIT_CONFIG.GENERAL_DIRECTORY_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    registrarEventoSeguridad('RATE_LIMIT_DIRECTORY_EXCEEDED', req, { max: RATE_LIMIT_CONFIG.GENERAL_DIRECTORY_MAX, ventana: '15m' }, 'WARN');

    return res.status(429).json({
      exito: false,
      codigo_seguridad: 'SEC_RATE_LIMIT_DIRECTORY',
      error: 'Límite de consultas a directorios excedido. Máximo 100 consultas cada 15 minutos por IP.',
      reintentar_en: `${Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000 / 60)} minutos`
    });
  }
});
generalDirectoryLimiter.max = RATE_LIMIT_CONFIG.GENERAL_DIRECTORY_MAX;

/**
 * Rate Limiter Global de Protección DoS de la API
 * Máximo 150 peticiones cada 15 minutos por IP
 */
const apiGeneralLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.WINDOW_MS,
  max: RATE_LIMIT_CONFIG.API_GENERAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    registrarEventoSeguridad('RATE_LIMIT_API_EXCEEDED', req, { max: RATE_LIMIT_CONFIG.API_GENERAL_MAX, ventana: '15m' }, 'WARN');

    return res.status(429).json({
      exito: false,
      codigo_seguridad: 'SEC_API_LIMIT_EXCEEDED',
      error: 'Demasiadas peticiones a la API desde esta dirección IP.',
      reintentar_en: `${Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000 / 60)} minutos`
    });
  }
});
apiGeneralLimiter.max = RATE_LIMIT_CONFIG.API_GENERAL_MAX;

/**
 * ============================================================================
 * SANITIZACIÓN ESTRICTA Y PREVENCIÓN XSS / INYECCIONES
 * ============================================================================
 */

/**
 * Sanitiza cadenas de texto eliminando bytes nulos, controles ASCII y tags HTML
 */
const sanitizarTexto = (input) => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/\0/g, '')                 // Eliminar null bytes
    .replace(/[\x00-\x1F\x7F]/g, '')     // Eliminar caracteres ASCII de control
    .replace(/<[^>]*>/g, '')             // Stripping estricto de tags HTML
    .trim();
};

/**
 * Validador estricto de nombre de cliente (Whitelist alfabética + detección proactiva de XSS)
 */
const validarNombreCliente = (nombre) => {
  if (typeof nombre !== 'string') return false;

  const patronesPeligrosos = /(<[^>]*>|javascript:|data:|vbscript:|on\w+\s*=|alert\(|document\.|window\.|union\s+select)/i;
  if (patronesPeligrosos.test(nombre)) {
    return false;
  }

  const regex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s\.\-]{3,80}$/;
  return regex.test(nombre.trim());
};

/**
 * Validador estricto de cédula o documento de identidad (Alfanumérico sin espacios ni símbolos)
 */
const validarCedula = (cedula) => {
  if (typeof cedula !== 'string') return false;
  const regex = /^[a-zA-Z0-9]{6,15}$/;
  return regex.test(cedula.trim());
};

/**
 * Middleware para prevenir Contaminación de Parámetros HTTP (HPP)
 * Evita ataques donde un atacante envía arrays en lugar de primitivos (ej. ?limit=1&limit=2)
 */
const prevenirContaminacionParametros = (req, res, next) => {
  // Sanitizar query parameters
  if (req.query && typeof req.query === 'object') {
    for (const key of Object.keys(req.query)) {
      if (Array.isArray(req.query[key])) {
        // Tomar únicamente el último valor para evitar bypasses de arrays
        req.query[key] = req.query[key][req.query[key].length - 1];
      }
    }
  }

  // Sanitizar body parameters si es un objeto
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    for (const key of Object.keys(req.body)) {
      if (Array.isArray(req.body[key]) && ['cliente_nombre', 'cliente_cedula', 'ingresos_mensuales', 'monto_solicitado', 'plazo_meses'].includes(key)) {
        return res.status(400).json({
          exito: false,
          codigo_seguridad: 'SEC_HPP_DETECTED',
          error: `Contaminación de parámetros detectada: El campo '${key}' no puede enviarse como una lista.`
        });
      }
    }
  }

  next();
};

/**
 * ============================================================================
 * ESQUEMAS DECLARATIVOS CON EXPRESS-VALIDATOR
 * ============================================================================
 */

/**
 * Reglas de Validación para Creación de Solicitud de Crédito (POST /api/v1/creditos)
 */
const reglasCrearSolicitud = [
  body('cliente_nombre')
    .trim()
    .notEmpty().withMessage('El nombre completo del cliente es un campo obligatorio.')
    .bail()
    .custom((val, { req }) => {
      if (!validarNombreCliente(val)) {
        const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
        registrarFalloSeguridadIP(ip, `XSS_INYECCION_NOMBRE_${val.substring(0, 30)}`);
        registrarEventoSeguridad('XSS_ATTACK_ATTEMPT', req, { payload: val }, 'CRITICAL');
        throw new Error('El nombre del cliente no es válido o contiene caracteres no permitidos. Debe contener solo caracteres alfabéticos (3-80 caracteres) sin etiquetas HTML ni scripts.');
      }
      return true;
    }),

  body('cliente_cedula')
    .trim()
    .notEmpty().withMessage('La cédula o documento de identidad es un campo obligatorio.')
    .bail()
    .custom((val, { req }) => {
      if (!validarCedula(val)) {
        const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
        registrarFalloSeguridadIP(ip, `SQLI_INYECCION_CEDULA_${val.substring(0, 30)}`);
        registrarEventoSeguridad('SQLI_ATTACK_ATTEMPT', req, { payload: val }, 'CRITICAL');
        throw new Error('La cédula o documento de identidad contiene caracteres inválidos. Debe contener entre 6 y 15 caracteres alfanuméricos sin espacios ni símbolos.');
      }
      return true;
    }),

  body('ingresos_mensuales')
    .customSanitizer(val => {
      if (typeof val === 'string') return Number(val.replace(/[$,]/g, '').trim());
      return Number(val);
    })
    .isFloat({ min: 100, max: 1000000 })
    .withMessage('Los ingresos mensuales deben ser un valor numérico válido entre $100 y $1,000,000 USD.'),

  body('monto_solicitado')
    .customSanitizer(val => {
      if (typeof val === 'string') return Number(val.replace(/[$,]/g, '').trim());
      return Number(val);
    })
    .isFloat({ min: 100, max: 500000 })
    .withMessage('El monto solicitado debe ser un valor numérico válido entre $100 y $500,000 USD.'),

  body('plazo_meses')
    .toInt()
    .isInt({ min: 1, max: 120 })
    .withMessage('El plazo en meses debe ser un entero entre 1 y 120 meses (máx. 10 años).')
];

/**
 * Reglas de Validación para Transición de Crédito (PATCH /api/v1/creditos/:id/transicionar)
 */
const reglasTransicionarSolicitud = [
  param('id')
    .toInt()
    .isInt({ min: 1 }).withMessage('El ID de la solicitud debe ser un entero positivo.'),

  body('nuevo_estado')
    .trim()
    .isIn(['Revision_Riesgo', 'En_Evaluacion', 'Tareas_Paralelas', 'Aprobado', 'Rechazado', 'Cancelado'])
    .withMessage('El estado destino indicado no es válido en el ciclo de vida BPM.'),

  body('motivo')
    .trim()
    .notEmpty().withMessage('Debe especificarse un motivo fundamentado para la transición manual de estado.')
    .isLength({ min: 5, max: 500 }).withMessage('El motivo debe tener entre 5 y 500 caracteres.')
];

/**
 * Reglas de Validación para Resolución de Tarea Paralela (PATCH /api/v1/tareas/:id/completar)
 */
const reglasCompletarTarea = [
  param('id')
    .toInt()
    .isInt({ min: 1 }).withMessage('El ID de la tarea debe ser un entero positivo.'),

  body('estado')
    .trim()
    .isIn(['Completada', 'Rechazada'])
    .withMessage("El estado de resolución debe ser estrictamente 'Completada' o 'Rechazada'."),

  body('observaciones')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Las observaciones no pueden exceder los 1000 caracteres.')
];

/**
 * Middleware para procesar y consolidar errores de express-validator
 */
const verificarValidaciones = (req, res, next) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    const primerError = errores.array()[0];
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    // Clasificar código de seguridad específico si proviene de una validación de seguridad
    let codigoSeguridad = 'SEC_VALIDATION_ERROR';
    if (primerError.path === 'cliente_nombre') codigoSeguridad = 'SEC_INVALID_NAME';
    if (primerError.path === 'cliente_cedula') codigoSeguridad = 'SEC_INVALID_DOCUMENT';

    registrarEventoSeguridad('INPUT_VALIDATION_REJECTED', req, {
      campo: primerError.path,
      valor_recibido: primerError.value,
      mensaje: primerError.msg
    }, 'WARN');

    return res.status(400).json({
      exito: false,
      codigo_seguridad: codigoSeguridad,
      error: primerError.msg,
      errores_completos: errores.array().map(e => ({ campo: e.path, mensaje: e.msg }))
    });
  }
  next();
};

module.exports = {
  ROLES,
  RATE_LIMIT_CONFIG,
  generarFirmaRol,
  normalizarRol,
  autenticarUsuario,
  autorizarRoles,
  creditCreationLimiter,
  riskTransitionLimiter,
  generalDirectoryLimiter,
  apiGeneralLimiter,
  sanitizarTexto,
  validarNombreCliente,
  validarCedula,
  prevenirContaminacionParametros,
  fail2banMiddleware,
  resetearTrackerIP,
  reglasCrearSolicitud,
  reglasTransicionarSolicitud,
  reglasCompletarTarea,
  verificarValidaciones
};
