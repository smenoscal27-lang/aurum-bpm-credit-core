import React, { useState } from 'react';
import {
  Building2,
  ShieldCheck,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Layers,
  Briefcase,
  FileCheck
} from 'lucide-react';

// Directorio Institucional de Usuarios de Prueba Predefinidos
const CUENTAS_PREDEFINIDAS = [
  {
    id: 'usr_asesor_01',
    email: 'asesor@aurum.com',
    username: 'asesor',
    password: 'Password123!',
    nombre: 'Valeria Alarcón',
    role: 'ASESOR',
    cargo: 'Asesora Senior de Créditos',
    departamento: 'Banca Personas & Consumo',
    color: 'emerald',
    badgeClass: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80',
    descripcion: 'Originación de solicitudes, cotización DTI y directorio general.'
  },
  {
    id: 'usr_oficial_01',
    email: 'oficial@aurum.com',
    username: 'oficial',
    password: 'Password123!',
    nombre: 'Marcos Villalba',
    role: 'OFICIAL_CAMPO',
    cargo: 'Oficial de Mesa de Control & Verificación',
    departamento: 'Operaciones & Terreno',
    color: 'amber',
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
    descripcion: 'Resolución de tareas paralelas (Fork/Join) y verificaciones de campo.'
  },
  {
    id: 'usr_comite_01',
    email: 'comite@aurum.com',
    username: 'comite',
    password: 'Password123!',
    nombre: 'Dr. Santiago Morales',
    role: 'COMITE_RIESGOS',
    cargo: 'Vocal Principal de Riesgo Crediticio',
    departamento: 'Comité de Riesgos & Dictámenes',
    color: 'purple',
    badgeClass: 'bg-purple-950/80 text-purple-300 border-purple-800/80',
    descripcion: 'Evaluación colegiada, dictamen de riesgo y transiciones de estado.'
  },
  {
    id: 'usr_auditor_01',
    email: 'auditor@aurum.com',
    username: 'auditor',
    password: 'Password123!',
    nombre: 'Elena Rivas',
    role: 'AUDITOR_SOX',
    cargo: 'Auditora Forense de Cumplimiento SOX',
    departamento: 'Compliance & Control Interno',
    color: 'cyan',
    badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80',
    descripcion: 'Inspección forense de bitácora y certificación criptográfica SHA-256.'
  },
  {
    id: 'usr_admin_01',
    email: 'admin@aurum.com',
    username: 'admin',
    password: 'Password123!',
    nombre: "Carlos D'Alessandro",
    role: 'ADMIN',
    cargo: 'Arquitecto y Administrador del Sistema',
    departamento: 'Tecnología & Seguridad Bancaria',
    color: 'rose',
    badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-800/80',
    descripcion: 'Superusuario con acceso global a reglas de negocio y observabilidad.'
  }
];

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState(null);

  // Autocompletar con una cuenta de prueba
  const handleSelectPreset = (cuenta) => {
    setEmail(cuenta.email);
    setPassword(cuenta.password);
    setSelectedPresetId(cuenta.id);
    setError('');
  };

  // Guardar sesión en localStorage y notificar
  const persistSessionAndNotify = (userData) => {
    localStorage.setItem('aurum_user_id', userData.id);
    localStorage.setItem('aurum_user_role', userData.role);
    localStorage.setItem('aurum_user_name', userData.nombre);
    localStorage.setItem('aurum_user_email', userData.email);
    localStorage.setItem('aurum_user_cargo', userData.cargo || '');
    if (userData.signature) {
      localStorage.setItem('aurum_auth_token', userData.signature);
    }

    if (onLoginSuccess) {
      onLoginSuccess(userData);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Por favor complete su usuario o correo institucional y contraseña.');
      return;
    }

    setLoading(true);

    try {
      // 1. Intento de autenticación contra la API REST del backend
      let backendSuccess = false;
      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email: email.trim(), password })
        });

        const rawText = await res.text();
        const data = rawText ? JSON.parse(rawText) : {};

        if (res.ok && data.exito && data.data) {
          backendSuccess = true;
          persistSessionAndNotify(data.data);
          return;
        } else if (!res.ok) {
          setError(data.error || 'Credenciales institucionales incorrectas.');
          setLoading(false);
          return;
        }
      } catch (networkErr) {
        // En caso de que el backend esté en arranque o modo offline, usar validación local de contingencia
        console.warn('[!] Backend auth API no disponible, activando contingencia segura:', networkErr);
      }

      // 2. Validación de Contingencia Local Bancaria
      const cleanInput = email.trim().toLowerCase();
      const localUser = CUENTAS_PREDEFINIDAS.find(
        (u) => u.email.toLowerCase() === cleanInput || u.username.toLowerCase() === cleanInput
      );

      if (localUser && localUser.password === password) {
        persistSessionAndNotify({
          id: localUser.id,
          nombre: localUser.nombre,
          email: localUser.email,
          username: localUser.username,
          role: localUser.role,
          cargo: localUser.cargo,
          departamento: localUser.departamento,
          signature: 'sig_local_' + Math.random().toString(36).substring(2, 12)
        });
      } else {
        setError('Credenciales inválidas. Compruebe el usuario o elija una de las cuentas de prueba.');
      }
    } catch (err) {
      setError('Ocurrió un error inesperado al procesar la autenticación: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080B11] text-slate-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden selection:bg-emerald-500 selection:text-slate-950">
      {/* Luces y texturas de fondo (Fintech Private Banking) */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[350px] bg-gradient-to-tr from-emerald-600/10 via-teal-500/10 to-transparent blur-3xl pointer-events-none rounded-full" />
      <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-slate-800/20 blur-3xl pointer-events-none rounded-full" />

      {/* Tarjeta Central de Autenticación */}
      <div className="w-full max-w-5xl z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Columna Izquierda: Formulario Principal de Acceso (5 columnas) */}
        <div className="lg:col-span-5 bg-[#0D121F]/90 backdrop-blur-xl border border-slate-800/90 rounded-2xl p-7 sm:p-8 shadow-2xl shadow-black/80 relative">
          
          {/* Header de la Institución */}
          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 border border-emerald-400/30">
              <Building2 className="w-6 h-6 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-white font-sans">AURUM</span>
                <span className="text-xs uppercase tracking-wider text-slate-400 font-mono font-medium">BPM Core</span>
              </div>
              <p className="text-xs text-slate-400">Sistema de Aprobación de Créditos de Consumo</p>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-lg font-bold text-white tracking-tight">Acceso Institucional</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Ingrese con sus credenciales bancarias o seleccione una identidad de prueba.
            </p>
          </div>

          {/* Mensaje de Error */}
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-950/70 border border-rose-800/80 flex items-start gap-3 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Usuario o Correo Institucional
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ej: asesor@aurum.com"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Contraseña Bancaria
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-emerald-500/20 border border-emerald-400/40 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Autenticando en AURUM Core...</span>
                  </>
                ) : (
                  <>
                    <span>Iniciar Sesión Institucional</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Garantías de Ciberseguridad Bancaria */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              HMAC-SHA256 RBAC
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              WORM Inmutable
            </span>
            <span className="text-slate-400 font-mono">SOX-404</span>
          </div>
        </div>

        {/* Columna Derecha: Tarjetas de Cuentas de Prueba Predefinidas (7 columnas) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#0D121F]/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Directorio de Credenciales Predefinidas
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">
                Haga clic en una tarjeta para autocompletar
              </span>
            </div>
            
            <p className="text-xs text-slate-400 mb-4">
              Cada perfil cuenta con roles RBAC independientes para validar la separación de funciones según normativa bancaria.
            </p>

            {/* Listado de Cuentas */}
            <div className="space-y-2.5">
              {CUENTAS_PREDEFINIDAS.map((cuenta) => {
                const isSelected = selectedPresetId === cuenta.id;
                return (
                  <button
                    key={cuenta.id}
                    type="button"
                    onClick={() => handleSelectPreset(cuenta)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800/90 border-emerald-500 shadow-md shadow-emerald-500/10'
                        : 'bg-slate-900/60 hover:bg-slate-800/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-mono text-xs font-bold text-emerald-400 shrink-0">
                        {cuenta.role.substring(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                            {cuenta.nombre}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cuenta.badgeClass}`}>
                            {cuenta.role}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {cuenta.cargo} &middot; <span className="font-mono text-slate-500">{cuenta.email}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-950/60 px-2 py-1 rounded border border-slate-800">
                        {cuenta.password}
                      </span>
                      <span className="text-xs font-medium text-emerald-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                        Cargar
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tarjeta Informativa de Flujos BPM */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Flujos Dinámicos &middot; Patrón Fork-Join &middot; Reglas Declarativas</span>
            </div>
            <span className="font-mono text-[11px] text-slate-500">v2.0.0 Fintech</span>
          </div>
        </div>

      </div>
    </div>
  );
}
