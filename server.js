/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Archivo: server.js
 * Descripción: Servidor HTTP Express con Hardening Bancario Avanzado:
 *              - Helmet Estricto (CSP, HSTS, X-Frame-Options: DENY, noSniff)
 *              - Fail2Ban Lógico (Mitigación DoS y bloqueo temporal de IPs)
 *              - Prevención HPP (Contaminación de Parámetros)
 *              - Manejador Global de Errores Forense (Protección contra Information Leak)
 * ============================================================================
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const { initDatabase, dbGet, db } = require('./database');
const creditRoutes = require('./credit.routes');
const taskRoutes = require('./task.routes');
const ruleRoutes = require('./rule.routes');
const auditRoutes = require('./audit.routes');
const authRoutes = require('./auth.routes');
const authController = require('./auth.controller');
const {
  apiGeneralLimiter,
  fail2banMiddleware,
  prevenirContaminacionParametros
} = require('./security.middleware');
const { registrarEventoSeguridad } = require('./security.logger');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ----------------------------------------------------------------------------
// 1. Hardening de Servidor y Ciberseguridad (Trust Proxy & Helmet Bancario)
// ----------------------------------------------------------------------------
// Confía en el primer salto del reverse proxy (Nginx, Cloudflare, AWS ALB)
app.set('trust proxy', 1);

// Deshabilitar huella tecnológica de Express
app.disable('x-powered-by');

// Soporte CORS para clientes Frontend Fintech con soporte de cabeceras RBAC
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id, x-user-role, x-auth-signature'
  );
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Middleware Fail2Ban: Bloqueo inmediato de IPs bajo cuarentena temporal
app.use(fail2banMiddleware);

// Protección de cabeceras HTTP de Grado Bancario mediante Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "http://localhost:3000", "http://localhost:5173", "ws://localhost:5173"],
        frameAncestors: ["'none'"], // Bloquea framing a nivel CSP
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    hsts: {
      maxAge: 31536000, // 1 año de transporte seguro estricto
      includeSubDomains: true,
      preload: true
    },
    frameguard: {
      action: 'deny' // Cabecera X-Frame-Options: DENY (Anti-Clickjacking bancario)
    },
    noSniff: true, // X-Content-Type-Options: nosniff
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },
    permittedCrossDomainPolicies: {
      permittedPolicies: 'none'
    },
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

// Middleware de telemetría de latencia exacta (sub-segundo) antes de enviar cabeceras
app.use((req, res, next) => {
  const startHr = process.hrtime.bigint();
  const originalEnd = res.end;
  res.end = function (...args) {
    if (!res.headersSent) {
      const elapsedNano = process.hrtime.bigint() - startHr;
      const elapsedMs = (Number(elapsedNano) / 1e6).toFixed(3);
      res.setHeader('X-Response-Time', `${elapsedMs}ms`);
    }
    return originalEnd.apply(this, args);
  };
  next();
});

// ----------------------------------------------------------------------------
// 2. Middlewares de Procesamiento de Cuerpo y Protección HPP
// ----------------------------------------------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(prevenirContaminacionParametros);

// Captura segura de errores de sintaxis en JSON entrante
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    registrarEventoSeguridad('MALFORMED_JSON_PAYLOAD', req, { error: err.message }, 'WARN');
    return res.status(400).json({
      exito: false,
      codigo_seguridad: 'SEC_MALFORMED_JSON',
      error: 'El cuerpo de la petición contiene formato JSON inválido o malformado.'
    });
  }
  next(err);
});

// ----------------------------------------------------------------------------
// 3. Endpoint de Salud y Telemetría (/health)
// ----------------------------------------------------------------------------
app.get('/health', async (req, res) => {
  const startDbCheck = process.hrtime.bigint();

  try {
    const dbProbe = await dbGet('PRAGMA journal_mode;');
    const dbLatencyNano = process.hrtime.bigint() - startDbCheck;
    const dbLatencyMs = (Number(dbLatencyNano) / 1e6).toFixed(3);

    const memoryUsage = process.memoryUsage();

    return res.status(200).json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      environment: NODE_ENV,
      database: {
        status: 'CONNECTED',
        driver: 'sqlite3',
        journal_mode: dbProbe ? dbProbe.journal_mode.toUpperCase() : 'UNKNOWN',
        latency_ms: parseFloat(dbLatencyMs)
      },
      system: {
        node_version: process.version,
        memory_rss_mb: (memoryUsage.rss / 1024 / 1024).toFixed(2),
        heap_used_mb: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2)
      }
    });
  } catch (error) {
    return res.status(503).json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      error: 'El servicio de base de datos no se encuentra disponible.'
    });
  }
});

// ----------------------------------------------------------------------------
// 4. Control de Tráfico Global y Montaje de Rutas BPM
// ----------------------------------------------------------------------------
// Rate limiting general para la API
app.use('/api', apiGeneralLimiter);

// ----------------------------------------------------------------------------
// Rutas de Autenticación Institucional y Directorio de Seguridad
// ----------------------------------------------------------------------------
app.use('/api/v1/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.post('/api/v1/login', authController.login);

// ----------------------------------------------------------------------------
// Rutas Operativas del Motor BPM
// ----------------------------------------------------------------------------
app.use('/api/v1/creditos', creditRoutes);
app.use('/api/v1/tareas', taskRoutes);
app.use('/api/v1/reglas', ruleRoutes);
app.use('/api/v1/auditoria', auditRoutes);

// Endpoint raíz informativo
app.get('/', (req, res) => {
  res.json({
    sistema: 'Motor BPM de Créditos de Consumo - Capa Bancaria Blindada',
    version: '2.0.0-SECURE',
    seguridad: {
      rbac: 'ACTIVO [ASESOR, OFICIAL_CAMPO, COMITE_RIESGOS, AUDITOR_SOX, ADMIN]',
      worm_audit: 'ACTIVO [Inmutabilidad Estricta SQLite]',
      rate_limiting: 'ACTIVO [Creacion: 5/15m, Directorios: 100/15m, API: 150/15m]',
      fail2ban: 'ACTIVO [Auto-Jail 30m tras 5 violaciones]',
      helmet: 'ACTIVO [CSP, HSTS, X-Frame-Options: DENY, nosniff]'
    },
    endpoints_disponibles: [
      { path: '/health', method: 'GET', description: 'Chequeo de salud del servicio y SQLite' },
      { path: '/api/v1/auth/login', method: 'POST', description: 'Autenticación institucional de operadores' },
      { path: '/api/v1/auth/usuarios-prueba', method: 'GET', description: 'Directorio de identidades institucionales' },
      { path: '/api/v1/auth/me', method: 'GET', description: 'Sesión activa verificada por RBAC' },
      { path: '/api/v1/creditos', method: 'POST', description: 'Crear solicitud (ASESOR, ADMIN)' },
      { path: '/api/v1/creditos', method: 'GET', description: 'Listar instancias de crédito' },
      { path: '/api/v1/creditos/:id', method: 'GET', description: 'Detalle de crédito y tareas' },
      { path: '/api/v1/creditos/:id/transicionar', method: 'PATCH', description: 'Transición manual (COMITE_RIESGOS, ADMIN)' },
      { path: '/api/v1/tareas', method: 'GET', description: 'Listar tareas paralelas (OFICIAL_CAMPO, ADMIN)' },
      { path: '/api/v1/tareas/:id/completar', method: 'PATCH', description: 'Completar tarea (OFICIAL_CAMPO, ADMIN)' },
      { path: '/api/v1/reglas', method: 'GET', description: 'Listar reglas declarativas' },
      { path: '/api/v1/auditoria', method: 'GET', description: 'Consultar bitácora inmutable (AUDITOR_SOX, ADMIN)' },
      { path: '/api/v1/auditoria/verificar-integridad', method: 'GET', description: 'Certificación SHA-256 (AUDITOR_SOX, ADMIN)' }
    ]
  });
});

// ----------------------------------------------------------------------------
// Soporte de Producción: Servir Frontend React Compilado (Vite / Hostinger)
// ----------------------------------------------------------------------------
const posiblesRutasDist = [
  path.join(__dirname, 'frontend-creditos', 'dist'),
  path.join(__dirname, 'dist'),
  path.join(__dirname, 'public')
];
const frontendDistPath = posiblesRutasDist.find((r) => fs.existsSync(r));

if (frontendDistPath) {
  app.use(express.static(frontendDistPath));

  // SPA Fallback para enrutamiento del lado del cliente
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    const indexPath = path.join(frontendDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    next();
  });
}

// Manejador de rutas no encontradas (404) - Respuesta JSON estructurada
app.use((req, res) => {
  return res.status(404).json({
    exito: false,
    error: `Ruta no encontrada: [${req.method}] ${req.originalUrl}`,
    codigo_error: 'ROUTE_NOT_FOUND'
  });
});

// ----------------------------------------------------------------------------
// 5. Manejador Global de Errores Forense (Protección contra Information Leak)
// ----------------------------------------------------------------------------
app.use((err, req, res, next) => {
  const incidentId = crypto.randomUUID();
  const statusCode = err.status || err.statusCode || 500;

  console.error('================================================================');
  console.error(`[-] ERROR CRÍTICO CAPTURADO [Incident-ID: ${incidentId}]:`);
  console.error(`Ruta: [${req.method}] ${req.originalUrl}`);
  console.error(`Status: ${statusCode} | Mensaje: ${err.message}`);
  console.error('Stack Trace:');
  console.error(err.stack || err);
  console.error('================================================================');

  // Registro en log de seguridad forense
  registrarEventoSeguridad('UNHANDLED_INTERNAL_ERROR', req, {
    incident_id: incidentId,
    status_code: statusCode,
    error_message: err.message,
    stack: err.stack
  }, 'CRITICAL');

  if (res.headersSent) {
    return next(err);
  }

  // Prevenir Information Leakage: Jamás exponer trazas de pila ni queries SQL al exterior
  const mensajeSeguro = statusCode === 500
    ? 'Ha ocurrido un error inesperado al procesar la solicitud en el motor bancario. Por motivos de seguridad, los detalles técnicos han sido resguardados.'
    : (err.message || 'Error en la solicitud.');

  return res.status(statusCode).json({
    exito: false,
    codigo_error: err.code || 'INTERNAL_SERVER_ERROR',
    error: mensajeSeguro,
    incident_id: incidentId
  });
});

// ----------------------------------------------------------------------------
// 6. Arranque del Servidor e Inicialización de Base de Datos
// ----------------------------------------------------------------------------
let server;

async function startServer() {
  try {
    await initDatabase();

    server = app.listen(PORT, () => {
      console.log('================================================================');
      console.log(`🛡️  Motor BPM de Créditos escuchando en http://localhost:${PORT}`);
      console.log(`📡 Endpoint de Salud: http://localhost:${PORT}/health`);
      console.log(`⚡ Modo: ${NODE_ENV.toUpperCase()} | SQLite WAL: ACTIVO | Hardening: GRADO BANCARIO`);
      console.log('================================================================');
    });
  } catch (err) {
    console.error('[-] Error fatal al inicializar el servidor:', err);
    process.exit(1);
  }
}

// Manejo de Cierre Limpio (Graceful Shutdown)
const gracefulShutdown = (signal) => {
  console.log(`\n[*] Recibida señal ${signal}. Cerrando servidor y conexiones SQLite...`);
  if (server) {
    server.close(() => {
      console.log('[+] Servidor HTTP cerrado.');
      db.close((err) => {
        if (err) {
          console.error('[-] Error al cerrar la base de datos:', err.message);
        } else {
          console.log('[+] Conexión con SQLite cerrada limpiamente.');
        }
        process.exit(0);
      });
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
