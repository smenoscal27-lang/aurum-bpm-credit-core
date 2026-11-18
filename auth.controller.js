/**
 * ============================================================================
 * SISTEMA DE APROBACIÓN DE CRÉDITOS DE CONSUMO MEDIANTE FLUJOS DINÁMICOS (BPM)
 * Archivo: auth.controller.js
 * Descripción: Controlador de Autenticación, Emisión de Firmas Criptográficas
 *              y Directorio de Identidades Institucionales AURUM.
 * ============================================================================
 */

const { ROLES, generarFirmaRol, sanitizarTexto } = require('./security.middleware');
const { registrarEventoSeguridad, registrarFalloSeguridadIP } = require('./security.logger');

/**
 * Directorio Institucional de Usuarios de Prueba Bancarios (AURUM BPM Core)
 */
const USUARIOS_SISTEMA = [
  {
    id: 'usr_asesor_01',
    email: 'asesor@aurum.com',
    username: 'asesor',
    password: 'Password123!',
    nombre: 'Valeria Alarcón',
    role: ROLES.ASESOR,
    cargo: 'Asesora Senior de Créditos',
    departamento: 'Banca Personas & Consumo',
    color: 'emerald',
    descripcion: 'Originación de solicitudes de crédito y directorio general.'
  },
  {
    id: 'usr_oficial_01',
    email: 'oficial@aurum.com',
    username: 'oficial',
    password: 'Password123!',
    nombre: 'Marcos Villalba',
    role: ROLES.OFICIAL_CAMPO,
    cargo: 'Oficial de Mesa de Control & Verificación',
    departamento: 'Operaciones & Terreno',
    color: 'amber',
    descripcion: 'Resolución de tareas paralelas (Fork/Join) y verificaciones de campo.'
  },
  {
    id: 'usr_comite_01',
    email: 'comite@aurum.com',
    username: 'comite',
    password: 'Password123!',
    nombre: 'Dr. Santiago Morales',
    role: ROLES.COMITE_RIESGOS,
    cargo: 'Vocal Principal de Riesgo Crediticio',
    departamento: 'Comité de Riesgos & Dictámenes',
    color: 'purple',
    descripcion: 'Evaluación colegiada, dictamen de riesgo y transiciones de estado.'
  },
  {
    id: 'usr_auditor_01',
    email: 'auditor@aurum.com',
    username: 'auditor',
    password: 'Password123!',
    nombre: 'Elena Rivas',
    role: ROLES.AUDITOR_SOX,
    cargo: 'Auditora Forense de Cumplimiento SOX',
    departamento: 'Compliance & Control Interno',
    color: 'cyan',
    descripcion: 'Inspección forense de bitácora y certificación criptográfica SHA-256.'
  },
  {
    id: 'usr_admin_01',
    email: 'admin@aurum.com',
    username: 'admin',
    password: 'Password123!',
    nombre: "Carlos D'Alessandro",
    role: ROLES.ADMIN,
    cargo: 'Arquitecto y Administrador del Sistema',
    departamento: 'Tecnología & Seguridad Bancaria',
    color: 'rose',
    descripcion: 'Superusuario con acceso global a reglas de negocio y observabilidad.'
  }
];

/**
 * @desc    Inicio de sesión seguro en el Core Bancario
 * @route   POST /api/v1/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    if (!email || !password) {
      return res.status(400).json({
        exito: false,
        codigo_seguridad: 'SEC_AUTH_MISSING_FIELDS',
        error: 'Debe ingresar el usuario o correo institucional y la contraseña.'
      });
    }

    const emailLimpio = sanitizarTexto(email).toLowerCase();

    // Búsqueda del usuario por correo o nombre de usuario
    const usuarioEncontrado = USUARIOS_SISTEMA.find(
      u => u.email.toLowerCase() === emailLimpio || u.username.toLowerCase() === emailLimpio
    );

    // Validación de credenciales
    if (!usuarioEncontrado || usuarioEncontrado.password !== password) {
      registrarFalloSeguridadIP(ip, `LOGIN_FAILED_${emailLimpio}`);
      registrarEventoSeguridad('AUTH_LOGIN_FAILED', req, {
        intento_usuario: emailLimpio,
        ip
      }, 'WARN');

      return res.status(401).json({
        exito: false,
        codigo_seguridad: 'SEC_INVALID_CREDENTIALS',
        error: 'Credenciales inválidas. Verifique su correo o usuario institucional y contraseña.'
      });
    }

    // Generar firma criptográfica HMAC para el usuario autenticado
    const signature = generarFirmaRol(usuarioEncontrado.id, usuarioEncontrado.role);

    registrarEventoSeguridad('AUTH_LOGIN_SUCCESS', req, {
      usuario: usuarioEncontrado.id,
      rol: usuarioEncontrado.role,
      ip
    }, 'INFO');

    return res.status(200).json({
      exito: true,
      mensaje: 'Autenticación exitosa en el Core Bancario AURUM.',
      data: {
        id: usuarioEncontrado.id,
        nombre: usuarioEncontrado.nombre,
        email: usuarioEncontrado.email,
        username: usuarioEncontrado.username,
        role: usuarioEncontrado.role,
        cargo: usuarioEncontrado.cargo,
        departamento: usuarioEncontrado.departamento,
        signature,
        ultimo_acceso: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[-] Error en login:', error);
    return res.status(500).json({
      exito: false,
      codigo_error: 'AUTH_SERVER_ERROR',
      error: 'Error interno del servidor durante el proceso de autenticación.'
    });
  }
};

/**
 * @desc    Obtener lista de usuarios y roles de prueba para la interfaz
 * @route   GET /api/v1/auth/usuarios-prueba
 */
const listarUsuariosPrueba = (req, res) => {
  return res.status(200).json({
    exito: true,
    data: USUARIOS_SISTEMA.map(u => ({
      id: u.id,
      email: u.email,
      username: u.username,
      password: u.password,
      nombre: u.nombre,
      role: u.role,
      cargo: u.cargo,
      departamento: u.departamento,
      color: u.color,
      descripcion: u.descripcion
    }))
  });
};

/**
 * @desc    Obtener sesión actual verificada
 * @route   GET /api/v1/auth/me
 */
const obtenerSesionActual = (req, res) => {
  const user = req.user;
  const usuarioInfo = USUARIOS_SISTEMA.find(u => u.id === user.id) || {
    id: user.id,
    role: user.role,
    nombre: user.id
  };

  return res.status(200).json({
    exito: true,
    data: {
      ...usuarioInfo,
      firmadoCriptograficamente: user.firmadoCriptograficamente
    }
  });
};

module.exports = {
  login,
  listarUsuariosPrueba,
  obtenerSesionActual,
  USUARIOS_SISTEMA
};
