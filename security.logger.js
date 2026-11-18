/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Archivo: security.logger.js
 * Descripción: Logger Forense de Seguridad Bancaria y Motor Lógico Fail2Ban
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.resolve(__dirname, 'logs');
const SECURITY_LOG_FILE = path.join(LOGS_DIR, 'security-audit.log');

// Asegurar existencia del directorio de logs
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Tabla en memoria para Fail2Ban lógico (Detección y bloqueo de IPs maliciosas)
 * Estructura: Map<IP, { contadorFallos: number, primerFallo: number, bloqueadoHasta: number, incidentes: Array }>
 */
const ipTracker = new Map();

// Parámetros de configuración de Fail2Ban
const FAIL2BAN_CONFIG = {
  MAX_INTENTOS_FALLIDOS: 5,           // Máximo de faltas permitidas antes del ban
  VENTANA_OBSERVACION_MS: 15 * 60 * 1000, // 15 minutos de ventana
  DURACION_BLOQUEO_MS: 30 * 60 * 1000    // 30 minutos de encarcelamiento (Jail)
};

/**
 * Registra un evento forense en el archivo de log dedicado
 * @param {string} tipoEvento - Código identificador (ej: XSS_ATTACK_ATTEMPT, RBAC_FORBIDDEN, etc.)
 * @param {object} req - Objeto de petición Express (opcional)
 * @param {object|string} detalle - Metadatos forenses del evento
 * @param {'INFO'|'WARN'|'CRITICAL'} severidad - Nivel de alerta
 */
const registrarEventoSeguridad = (tipoEvento, req = null, detalle = {}, severidad = 'WARN') => {
  const timestamp = new Date().toISOString();
  const ip = req ? (req.ip || req.connection?.remoteAddress || '127.0.0.1') : 'SYSTEM';
  const metodo = req?.method || 'N/A';
  const url = req?.originalUrl || req?.url || 'N/A';
  const usuario = req?.user?.id || req?.headers?.['x-user-id'] || 'ANONIMO';
  const rol = req?.user?.role || req?.headers?.['x-user-role'] || 'SIN_ROL';

  const logEntry = {
    timestamp,
    severidad,
    tipo_evento: tipoEvento,
    ip,
    usuario,
    rol,
    endpoint: `${metodo} ${url}`,
    detalle: typeof detalle === 'object' ? detalle : { mensaje: String(detalle) }
  };

  const logLine = JSON.stringify(logEntry) + '\n';

  // Escritura persistente asíncrona no bloqueante
  fs.appendFile(SECURITY_LOG_FILE, logLine, (err) => {
    if (err) {
      console.error('[-] Error crítico al escribir en log de seguridad forense:', err.message);
    }
  });

  // Salida en consola para entornos de monitoreo
  if (severidad === 'CRITICAL') {
    console.error(`🚨 [ALERTA DE CIBERSEGURIDAD] [${tipoEvento}] IP: ${ip} | User: ${usuario} (${rol}) | Detalle:`, detalle);
  }
};

/**
 * Registra una falta de seguridad para una IP y aplica encarcelamiento si supera el umbral
 * @param {string} ip - Dirección IP sospechosa
 * @param {string} motivo - Razón del incidente (ej. XSS detectado, SQLi, 403 reiterado)
 */
const registrarFalloSeguridadIP = (ip, motivo) => {
  const ahora = Date.now();
  let registro = ipTracker.get(ip);

  if (!registro || (ahora - registro.primerFallo > FAIL2BAN_CONFIG.VENTANA_OBSERVACION_MS)) {
    registro = {
      contadorFallos: 1,
      primerFallo: ahora,
      bloqueadoHasta: 0,
      incidentes: [motivo]
    };
  } else {
    registro.contadorFallos += 1;
    registro.incidentes.push(motivo);
  }

  // Verificar si supera el umbral para encarcelar la IP
  if (registro.contadorFallos >= FAIL2BAN_CONFIG.MAX_INTENTOS_FALLIDOS && registro.bloqueadoHasta <= ahora) {
    registro.bloqueadoHasta = ahora + FAIL2BAN_CONFIG.DURACION_BLOQUEO_MS;
    registrarEventoSeguridad('FAIL2BAN_IP_JAILED', null, {
      ip,
      motivo: `IP bloqueada por 30 minutos tras registrar ${registro.contadorFallos} incidentes maliciosos`,
      incidentes_previos: registro.incidentes
    }, 'CRITICAL');
  }

  ipTracker.set(ip, registro);
};

/**
 * Middleware que bloquea inmediatamente el tráfico proveniente de IPs encarceladas
 */
const fail2banMiddleware = (req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const ahora = Date.now();
  const registro = ipTracker.get(ip);

  if (registro && registro.bloqueadoHasta > ahora) {
    const minutosRestantes = Math.ceil((registro.bloqueadoHasta - ahora) / 1000 / 60);

    registrarEventoSeguridad('FAIL2BAN_BLOCKED_REQUEST', req, {
      ip,
      bloqueadoHasta: new Date(registro.bloqueadoHasta).toISOString(),
      reintentar_en: `${minutosRestantes} minutos`
    }, 'WARN');

    return res.status(403).json({
      exito: false,
      codigo_seguridad: 'SEC_IP_TEMPORARILY_BLOCKED',
      error: 'Acceso bloqueado temporalmente por detección de actividades maliciosas recurrentes (WAF / Fail2Ban Bancario).',
      reintentar_en: `${minutosRestantes} minutos`
    });
  }

  next();
};

/**
 * Limpia el estado de bloqueo de una IP (útil para auditorías y tests)
 */
const resetearTrackerIP = (ip) => {
  ipTracker.delete(ip);
};

module.exports = {
  registrarEventoSeguridad,
  registrarFalloSeguridadIP,
  fail2banMiddleware,
  resetearTrackerIP,
  SECURITY_LOG_FILE,
  FAIL2BAN_CONFIG
};
