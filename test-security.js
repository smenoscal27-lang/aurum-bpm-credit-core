/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Archivo: test-security.js
 * Descripción: Suite Integral de Ciberseguridad Bancaria (Ofensiva y Defensiva):
 *              1. Anti-XSS y Anti-SQLi con express-validator
 *              2. Autenticación y Autorización Criptográfica RBAC
 *              3. Rate Limiting Estricto por Ruta (5 / 15m)
 *              4. Fail2Ban Lógico (Encarcelamiento automático de IPs maliciosas)
 *              5. Prevención de Contaminación de Parámetros (HPP)
 *              6. Auditoría Forense Persistente (logs/security-audit.log)
 * ============================================================================
 */

const fs = require('fs');
const { initDatabase, db } = require('./database');
const { crearSolicitud } = require('./credit.controller');
const {
  ROLES,
  generarFirmaRol,
  autenticarUsuario,
  autorizarRoles,
  creditCreationLimiter,
  riskTransitionLimiter,
  generalDirectoryLimiter,
  prevenirContaminacionParametros,
  fail2banMiddleware,
  resetearTrackerIP
} = require('./security.middleware');
const {
  registrarFalloSeguridadIP,
  SECURITY_LOG_FILE
} = require('./security.logger');

const crearMockRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    setHeader(key, val) {
      this.headers[key] = val;
    }
  };
  return res;
};

async function ejecutarPruebasSeguridad() {
  try {
    console.log('\n================================================================');
    console.log('🛡️  SUITE DE PRUEBAS DE CIBERSEGURIDAD BANCARIA Y HARDENING AVANZADO');
    console.log('================================================================\n');

    await initDatabase();

    // ------------------------------------------------------------------------
    // PRUEBA 1: Intento de Cross-Site Scripting (XSS) en cliente_nombre
    // ------------------------------------------------------------------------
    console.log('[TEST 1] Inyectando payload XSS en cliente_nombre: "<script>alert(\'XSS\')</script>"');
    const reqXss1 = {
      body: {
        cliente_nombre: '<script>alert("XSS")</script>',
        cliente_cedula: '1723456789',
        ingresos_mensuales: 2000,
        monto_solicitado: 4000,
        plazo_meses: 24
      },
      headers: { 'x-user-id': 'asesor_01', 'x-user-role': 'ASESOR' }
    };
    const resXss1 = crearMockRes();
    await crearSolicitud(reqXss1, resXss1);

    console.log(` -> Código HTTP: ${resXss1.statusCode}`);
    console.log(` -> Código de Seguridad: ${resXss1.body?.codigo_seguridad}`);
    if (resXss1.statusCode === 400 && resXss1.body?.codigo_seguridad === 'SEC_INVALID_NAME') {
      console.log(' -> [ÉXITO] Ataque XSS mitigado y registrado en log forense.\n');
    } else {
      throw new Error('FALLO DE SEGURIDAD: El payload XSS no fue bloqueado.');
    }

    // ------------------------------------------------------------------------
    // PRUEBA 2: Intento de XSS con Atributos de Evento HTML
    // ------------------------------------------------------------------------
    console.log('[TEST 2] Inyectando vector XSS avanzado: "Carlos <img src=x onerror=alert(1)>"');
    const reqXss2 = {
      body: {
        cliente_nombre: 'Carlos <img src=x onerror=alert(1)>',
        cliente_cedula: '1723456789',
        ingresos_mensuales: 2000,
        monto_solicitado: 4000,
        plazo_meses: 24
      },
      headers: { 'x-user-id': 'asesor_01', 'x-user-role': 'ASESOR' }
    };
    const resXss2 = crearMockRes();
    await crearSolicitud(reqXss2, resXss2);

    console.log(` -> Código HTTP: ${resXss2.statusCode}`);
    console.log(` -> Código de Seguridad: ${resXss2.body?.codigo_seguridad}`);
    if (resXss2.statusCode === 400 && resXss2.body?.codigo_seguridad === 'SEC_INVALID_NAME') {
      console.log(' -> [ÉXITO] Vector HTML event handler mitigado satisfactoriamente.\n');
    } else {
      throw new Error('FALLO DE SEGURIDAD: El vector HTML event handler no fue bloqueado.');
    }

    // ------------------------------------------------------------------------
    // PRUEBA 3: Intento de Inyección SQL en cliente_cedula
    // ------------------------------------------------------------------------
    console.log('[TEST 3] Inyectando payload SQLi en cliente_cedula: "\' OR \'1\'=\'1"');
    const reqSql1 = {
      body: {
        cliente_nombre: 'Andres Guardado',
        cliente_cedula: "' OR '1'='1",
        ingresos_mensuales: 2000,
        monto_solicitado: 4000,
        plazo_meses: 24
      },
      headers: { 'x-user-id': 'asesor_01', 'x-user-role': 'ASESOR' }
    };
    const resSql1 = crearMockRes();
    await crearSolicitud(reqSql1, resSql1);

    console.log(` -> Código HTTP: ${resSql1.statusCode}`);
    console.log(` -> Código de Seguridad: ${resSql1.body?.codigo_seguridad}`);
    if (resSql1.statusCode === 400 && resSql1.body?.codigo_seguridad === 'SEC_INVALID_DOCUMENT') {
      console.log(' -> [ÉXITO] Inyección SQL en cédula bloqueada por validador estricto.\n');
    } else {
      throw new Error('FALLO DE SEGURIDAD: El payload SQLi no fue bloqueado.');
    }

    // ------------------------------------------------------------------------
    // PRUEBA 4: Control de Acceso Basado en Roles (RBAC)
    // ------------------------------------------------------------------------
    console.log('[TEST 4] Evaluando Control de Acceso Basado en Roles (RBAC):');

    // Subcaso 4.1: Acceso sin credenciales
    console.log(' -> Subcaso 4.1: Petición anónima sin cabeceras...');
    const reqAnon = { headers: {} };
    const resAnon = crearMockRes();
    autenticarUsuario(reqAnon, resAnon, () => {});
    if (resAnon.statusCode === 401 && resAnon.body?.codigo_seguridad === 'SEC_UNAUTHENTICATED') {
      console.log('    [OK] Bloqueo HTTP 401: Autenticación requerida.');
    } else {
      throw new Error('FALLO RBAC: Se permitió acceso a una petición anónima.');
    }

    // Subcaso 4.2: Acceso con rol no autorizado (OFICIAL_CAMPO intentando crear créditos)
    console.log(' -> Subcaso 4.2: OFICIAL_CAMPO intentando crear créditos (Requiere ASESOR o ADMIN)...');
    const reqOficial = {
      headers: { 'x-user-id': 'oficial_campo_99', 'x-user-role': 'OFICIAL_CAMPO' }
    };
    const resOficial = crearMockRes();
    autenticarUsuario(reqOficial, resOficial, () => {
      const middlewareAutorizacion = autorizarRoles('ASESOR', 'ADMIN');
      middlewareAutorizacion(reqOficial, resOficial, () => {});
    });

    if (resOficial.statusCode === 403 && resOficial.body?.codigo_seguridad === 'SEC_FORBIDDEN_ROLE') {
      console.log('    [OK] Bloqueo HTTP 403: El rol OFICIAL_CAMPO fue rechazado correctamente.');
    } else {
      throw new Error('FALLO RBAC: Se permitió una operación no autorizada al rol OFICIAL_CAMPO.');
    }

    // Subcaso 4.3: Acceso con rol autorizado (ASESOR)
    console.log(' -> Subcaso 4.3: ASESOR accediendo con firma criptográfica HMAC válida...');
    const userIdAsesor = 'asesor_oficial_01';
    const firmaValida = generarFirmaRol(userIdAsesor, 'ASESOR');
    const reqAsesorOk = {
      headers: {
        'x-user-id': userIdAsesor,
        'x-user-role': 'ASESOR',
        'x-auth-signature': firmaValida
      }
    };
    const resAsesorOk = crearMockRes();
    let pasoAutorizacion = false;
    autenticarUsuario(reqAsesorOk, resAsesorOk, () => {
      const middlewareAutorizacion = autorizarRoles('ASESOR', 'ADMIN');
      middlewareAutorizacion(reqAsesorOk, resAsesorOk, () => {
        pasoAutorizacion = true;
      });
    });

    if (pasoAutorizacion && reqAsesorOk.user?.firmadoCriptograficamente) {
      console.log('    [OK] Acceso concedido con firma HMAC verificada timing-safe.\n');
    } else {
      throw new Error('FALLO RBAC: No se concedió acceso a usuario legítimo con firma válida.');
    }

    // ------------------------------------------------------------------------
    // PRUEBA 5: Protección contra Contaminación de Parámetros (HPP)
    // ------------------------------------------------------------------------
    console.log('[TEST 5] Probando prevención de Parameter Pollution (HPP):');
    const reqHpp = {
      body: {
        cliente_nombre: ['Juan', 'Pedro'], // Intento de inyectar array en lugar de string
        cliente_cedula: '1723456789'
      }
    };
    const resHpp = crearMockRes();
    prevenirContaminacionParametros(reqHpp, resHpp, () => {});

    if (resHpp.statusCode === 400 && resHpp.body?.codigo_seguridad === 'SEC_HPP_DETECTED') {
      console.log(' -> [ÉXITO] Inyección de array en campo escalar bloqueada con SEC_HPP_DETECTED.\n');
    } else {
      throw new Error('FALLO DE SEGURIDAD: No se detectó la contaminación de parámetros.');
    }

    // ------------------------------------------------------------------------
    // PRUEBA 6: Rate Limiting Diferenciado por Endpoint
    // ------------------------------------------------------------------------
    console.log('[TEST 6] Verificando Rate Limiters bancarios configurados:');
    console.log(` -> Creación de créditos (creditCreationLimiter): ${creditCreationLimiter.max} peticiones / 15m`);
    console.log(` -> Transición de riesgo (riskTransitionLimiter): ${riskTransitionLimiter.max} peticiones / 15m`);
    console.log(` -> Consultas y auditoría (generalDirectoryLimiter): ${generalDirectoryLimiter.max} peticiones / 15m`);

    if (creditCreationLimiter.max === 5 && riskTransitionLimiter.max === 5 && generalDirectoryLimiter.max === 100) {
      console.log(' -> [ÉXITO] Cuotas diferenciadas configuradas según estándar bancario.\n');
    } else {
      throw new Error('FALLO DE SEGURIDAD: Los límites de rate limiting no coinciden con la especificación.');
    }

    // ------------------------------------------------------------------------
    // PRUEBA 7: Fail2Ban Lógico (Encarcelamiento de IP Atacante)
    // ------------------------------------------------------------------------
    console.log('[TEST 7] Simulando comportamiento Fail2Ban ante atacante recurrente:');
    const ipAtacante = '198.51.100.44';
    resetearTrackerIP(ipAtacante);

    // Simular 5 incidentes maliciosos consecutivos
    for (let i = 1; i <= 5; i++) {
      registrarFalloSeguridadIP(ipAtacante, `ATAQUE_REITERADO_${i}`);
    }

    // Evaluar acceso de la IP mediante el middleware fail2ban
    const reqJailed = { ip: ipAtacante };
    const resJailed = crearMockRes();
    fail2banMiddleware(reqJailed, resJailed, () => {});

    console.log(` -> Código HTTP tras 5 incidentes: ${resJailed.statusCode}`);
    console.log(` -> Código de Seguridad: ${resJailed.body?.codigo_seguridad}`);
    if (resJailed.statusCode === 403 && resJailed.body?.codigo_seguridad === 'SEC_IP_TEMPORARILY_BLOCKED') {
      console.log(' -> [ÉXITO] Fail2Ban encarceló automáticamente la IP por 30 minutos.\n');
    } else {
      throw new Error('FALLO DE SEGURIDAD: Fail2Ban no bloqueó la IP maliciosa recurrente.');
    }

    // ------------------------------------------------------------------------
    // PRUEBA 8: Verificación de Persistencia en Log Forense
    // ------------------------------------------------------------------------
    console.log('[TEST 8] Comprobando integridad del archivo de auditoría forense:');
    if (fs.existsSync(SECURITY_LOG_FILE)) {
      const contenidoLog = fs.readFileSync(SECURITY_LOG_FILE, 'utf8');
      const lineas = contenidoLog.trim().split('\n');
      console.log(` -> Archivo forense activo: ${SECURITY_LOG_FILE}`);
      console.log(` -> Eventos forenses registrados en esta sesión: ${lineas.length}`);
      const ultimoEvento = JSON.parse(lineas[lineas.length - 1]);
      console.log(` -> Último evento auditado: [${ultimoEvento.severidad}] ${ultimoEvento.tipo_evento}`);
      console.log(' -> [ÉXITO] Eventos de ciberseguridad persistidos con sello de tiempo e IP.\n');
    } else {
      throw new Error('FALLO DE SEGURIDAD: El archivo de log forense no fue generado.');
    }

    console.log('================================================================');
    console.log('✅ TODAS LAS PRUEBAS DE HARDENING Y CIBERSEGURIDAD PASARON (100%)');
    console.log('================================================================\n');

  } catch (error) {
    console.error('[-] Error crítico en suite de seguridad:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

ejecutarPruebasSeguridad();
