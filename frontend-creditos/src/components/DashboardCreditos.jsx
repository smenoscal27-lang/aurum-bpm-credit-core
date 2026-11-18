import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  GitFork,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  PlusCircle,
  FileText,
  User,
  DollarSign,
  Calendar,
  Layers,
  ChevronRight,
  X,
  RefreshCw,
  ArrowUpRight,
  Building2,
  Lock,
  Activity,
  Send,
  Eye,
  Check,
  AlertCircle,
  LogOut
} from 'lucide-react';

// URL base de la API (Usa proxy de Vite o directo al puerto 3000)
const API_BASE = '/api/v1';

export default function DashboardCreditos({ user, onLogout }) {
  // Estado de Seguridad y Autenticación RBAC
  const [currentRole, setCurrentRole] = useState(() => user?.role || localStorage.getItem('aurum_user_role') || 'ASESOR');
  const [currentUserId, setCurrentUserId] = useState(() => user?.id || localStorage.getItem('aurum_user_id') || 'usr_asesor_01');
  const [currentUserName, setCurrentUserName] = useState(() => user?.nombre || localStorage.getItem('aurum_user_name') || 'Operador Bancario');
  const [currentUserCargo, setCurrentUserCargo] = useState(() => user?.cargo || localStorage.getItem('aurum_user_cargo') || '');
  const [currentUserSignature, setCurrentUserSignature] = useState(() => user?.signature || localStorage.getItem('aurum_auth_token') || '');

  // Sincronizar reactivamente si cambia la prop user
  useEffect(() => {
    if (user) {
      if (user.role) setCurrentRole(user.role);
      if (user.id) setCurrentUserId(user.id);
      if (user.nombre) setCurrentUserName(user.nombre);
      if (user.cargo) setCurrentUserCargo(user.cargo);
      if (user.signature) setCurrentUserSignature(user.signature);
    }
  }, [user]);

  // Estado General
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('directorio'); // 'directorio' | 'nueva'
  const [refreshing, setRefreshing] = useState(false);

  // Filtros de búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('TODOS');

  // Panel Lateral de Detalle / Auditoría
  const [selectedCreditId, setSelectedCreditId] = useState(null);
  const [creditDetail, setCreditDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Formulario Nueva Solicitud
  const [formData, setFormData] = useState({
    cliente_nombre: '',
    cliente_cedula: '',
    ingresos_mensuales: '',
    monto_solicitado: '',
    plazo_meses: '24'
  });
  const [submitting, setSubmitting] = useState(false);
  const [formDecision, setFormDecision] = useState(null);
  const [formError, setFormError] = useState('');

  // Acción de resolver tarea paralela desde el drawer
  const [resolvingTaskId, setResolvingTaskId] = useState(null);
  const [taskNotes, setTaskNotes] = useState('');

  // Carga inicial y reactiva al alternar roles RBAC
  useEffect(() => {
    fetchSolicitudes();
  }, [currentRole]);

  // Helper para generar cabeceras de seguridad RBAC propagando credenciales
  const getSecurityHeaders = (extraHeaders = {}) => {
    const headers = {
      'x-user-id': currentUserId,
      'x-user-role': currentRole,
      ...extraHeaders
    };
    if (currentUserSignature) {
      headers['x-auth-signature'] = currentUserSignature;
    }
    return headers;
  };

  const fetchSolicitudes = async () => {
    try {
      setRefreshing(true);
      const res = await fetch(`${API_BASE}/creditos`, {
        headers: getSecurityHeaders()
      });
      const rawText = await res.text();
      const result = rawText ? JSON.parse(rawText) : {};
      if (result.exito) {
        setSolicitudes(result.data || []);
      }
    } catch (err) {
      console.error('[-] Error cargando solicitudes:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchCreditDetail = async (id) => {
    try {
      setLoadingDetail(true);
      const res = await fetch(`${API_BASE}/creditos/${id}`, {
        headers: getSecurityHeaders()
      });
      const rawText = await res.text();
      const result = rawText ? JSON.parse(rawText) : {};
      if (result.exito) {
        setCreditDetail(result.data);
      }
    } catch (err) {
      console.error('[-] Error cargando detalle:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleOpenDetail = (id) => {
    setSelectedCreditId(id);
    fetchCreditDetail(id);
  };

  const handleCloseDetail = () => {
    setSelectedCreditId(null);
    setCreditDetail(null);
    setResolvingTaskId(null);
    setTaskNotes('');
  };

  // KPIs
  const kpis = useMemo(() => {
    const total = solicitudes.length;
    const aprobados = solicitudes.filter(s => s.estado_actual === 'Aprobado').length;
    const revisionRiesgo = solicitudes.filter(s => s.estado_actual === 'Revision_Riesgo').length;
    const tareasParalelas = solicitudes.filter(s => s.estado_actual === 'Tareas_Paralelas').length;
    const montoColocado = solicitudes
      .filter(s => s.estado_actual === 'Aprobado')
      .reduce((acc, curr) => acc + (curr.monto_solicitado || 0), 0);

    const tasaAprobacion = total > 0 ? ((aprobados / total) * 100).toFixed(1) : 0;

    return { total, aprobados, revisionRiesgo, tareasParalelas, montoColocado, tasaAprobacion };
  }, [solicitudes]);

  // Filtrado de solicitudes
  const filteredSolicitudes = useMemo(() => {
    return solicitudes.filter(item => {
      const matchSearch =
        item.cliente_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.cliente_cedula.includes(searchTerm);
      const matchStatus = statusFilter === 'TODOS' || item.estado_actual === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [solicitudes, searchTerm, statusFilter]);

  // Manejo de Formulario
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Pre-evaluación en vivo para el usuario antes de enviar
  const livePreAssessment = useMemo(() => {
    const monto = parseFloat(formData.monto_solicitado) || 0;
    const ingresos = parseFloat(formData.ingresos_mensuales) || 0;
    const plazo = parseInt(formData.plazo_meses, 10) || 24;

    if (monto <= 0 || ingresos <= 0) return null;

    const cuotaEstimada = (monto * (1 + 0.015 * plazo)) / plazo;
    const ratioDti = (cuotaEstimada / ingresos) * 100;

    let dictamenEstimado = {
      estado: 'Tareas_Paralelas',
      color: 'amber',
      texto: 'Verificación Paralela Requerida'
    };

    if (monto <= 5000 && ingresos > 1000) {
      dictamenEstimado = {
        estado: 'Aprobado',
        color: 'emerald',
        texto: 'Aprobación Directa Precalificada'
      };
    } else if (monto > 15000 || ingresos < 500) {
      dictamenEstimado = {
        estado: 'Revision_Riesgo',
        color: 'rose',
        texto: 'Escalado a Comité de Riesgos'
      };
    }

    return {
      cuotaEstimada: cuotaEstimada.toFixed(2),
      ratioDti: ratioDti.toFixed(1),
      dictamenEstimado
    };
  }, [formData]);

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormDecision(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/creditos`, {
        method: 'POST',
        headers: getSecurityHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(formData)
      });

      let result = {};
      const rawText = await res.text();
      try {
        result = rawText ? JSON.parse(rawText) : {};
      } catch (parseErr) {
        console.error('[-] Error parseando respuesta del servidor:', rawText);
        throw new Error(`Respuesta no válida del servidor (${res.status}): ${rawText || 'Cuerpo vacío'}`);
      }

      if (!res.ok || !result.exito) {
        throw new Error(result.error || result.detalle || `Error HTTP ${res.status}: Fallo al procesar la solicitud`);
      }

      setFormDecision(result.data);
      // Refrescar listado
      fetchSolicitudes();

      // Reset parcial para permitir continuar
      setFormData({
        cliente_nombre: '',
        cliente_cedula: '',
        ingresos_mensuales: '',
        monto_solicitado: '',
        plazo_meses: '24'
      });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Resolver tarea paralela (Completar o Rechazar)
  const handleResolveTask = async (taskId, nuevoEstado) => {
    try {
      const res = await fetch(`${API_BASE}/tareas/${taskId}/completar`, {
        method: 'PATCH',
        headers: getSecurityHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          estado: nuevoEstado,
          observaciones: taskNotes || (nuevoEstado === 'Completada' ? 'Verificación confirmada satisfactoriamente' : 'No cumple con requisitos')
        })
      });

      const rawText = await res.text();
      const result = rawText ? JSON.parse(rawText) : {};
      if (result.exito) {
        // Refrescar detalle y lista
        fetchCreditDetail(selectedCreditId);
        fetchSolicitudes();
        setResolvingTaskId(null);
        setTaskNotes('');
      } else {
        alert(result.error || result.detalle || 'Error al completar la tarea');
      }
    } catch (err) {
      console.error('Error resolviendo tarea:', err);
    }
  };

  // Helper para badge de estado
  const renderStatusBadge = (estado) => {
    switch (estado) {
      case 'Aprobado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Aprobado
          </span>
        );
      case 'Tareas_Paralelas':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/70 text-amber-300 border border-amber-800/70">
            <GitFork className="w-3 h-3 text-amber-400" />
            Tareas Paralelas
          </span>
        );
      case 'Revision_Riesgo':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-950/70 text-rose-300 border border-rose-800/70">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            Revisión de Riesgo
          </span>
        );
      case 'Rechazado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <XCircle className="w-3 h-3 text-slate-400" />
            Rechazado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            <Clock className="w-3 h-3 text-slate-400" />
            {estado}
          </span>
        );
    }
  };

  const renderRiskBadge = (nivel) => {
    switch (nivel) {
      case 'Bajo':
        return <span className="text-xs font-medium text-emerald-400">Bajo</span>;
      case 'Medio':
        return <span className="text-xs font-medium text-amber-400">Medio</span>;
      case 'Alto':
      case 'Critico':
        return <span className="text-xs font-medium text-rose-400">Alto</span>;
      default:
        return <span className="text-xs font-medium text-slate-400">{nivel || 'N/A'}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-[#080B11] text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-[#0D121F]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 border border-emerald-400/30">
              <Building2 className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white font-sans">AURUM</span>
                <span className="text-xs uppercase tracking-wider text-slate-400 font-mono font-medium">BPM Credit Core</span>
              </div>
              <p className="text-[11px] text-slate-400">Motor de Créditos de Consumo &middot; SQLite WAL Inmutable</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>WAL Mode: <strong>Activo</strong> (Sub-ms)</span>
            </div>

            <button
              onClick={fetchSolicitudes}
              disabled={refreshing}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-white transition-all"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            {/* Selector de Rol RBAC Bancario */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <label htmlFor="role-select" className="text-[10px] text-slate-400 font-mono uppercase font-semibold">Rol:</label>
              <select
                id="role-select"
                value={currentRole}
                onChange={(e) => {
                  const nuevoRol = e.target.value;
                  setCurrentRole(nuevoRol);
                  const nuevoId = `usr_${nuevoRol.toLowerCase()}_01`;
                  setCurrentUserId(nuevoId);
                  localStorage.setItem('aurum_user_role', nuevoRol);
                  localStorage.setItem('aurum_user_id', nuevoId);
                }}
                className="bg-transparent text-xs font-bold text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="ASESOR" className="bg-slate-900 text-emerald-400">ASESOR (Originación)</option>
                <option value="OFICIAL_CAMPO" className="bg-slate-900 text-amber-400">OFICIAL_CAMPO (Fork-Join)</option>
                <option value="COMITE_RIESGOS" className="bg-slate-900 text-purple-400">COMITE_RIESGOS (Riesgo)</option>
                <option value="AUDITOR_SOX" className="bg-slate-900 text-cyan-400">AUDITOR_SOX (Compliance)</option>
                <option value="ADMIN" className="bg-slate-900 text-rose-400">ADMIN (Superusuario)</option>
              </select>
            </div>

            {/* Perfil del Operador Autenticado */}
            <div className="flex items-center gap-2.5 pl-3 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-emerald-400 font-mono">
                {currentRole.substring(0, 2)}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-semibold text-slate-200">{currentUserName}</p>
                <p className="text-[10px] text-slate-500 font-mono">{currentRole} &middot; {currentUserId}</p>
              </div>
            </div>

            {/* Botón de Cerrar Sesión (Logout) */}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-800/80 text-slate-400 hover:text-rose-300 text-xs font-semibold transition-all shadow-sm cursor-pointer ml-1"
                title="Cerrar sesión activa y retornar a la pantalla de autenticación"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden lg:inline">Cerrar Sesión</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* KPI Cards Section */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total */}
          <div className="bg-[#111726] border border-slate-800/80 rounded-xl p-5 shadow-sm relative overflow-hidden group hover:border-slate-700 transition-all">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Solicitudes</p>
              <div className="p-2 rounded-lg bg-slate-800/70 text-slate-300">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white mt-3 font-mono">{kpis.total}</p>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <span className="text-emerald-400 font-medium">${(kpis.montoColocado / 1000).toFixed(1)}k</span>
              <span>colocados en total</span>
            </div>
          </div>

          {/* Card 2: Aprobados */}
          <div className="bg-[#111726] border border-emerald-950/60 rounded-xl p-5 shadow-sm relative overflow-hidden group hover:border-emerald-800/60 transition-all">
            <div className="absolute -top-12 -right-12 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-emerald-400/90 uppercase tracking-wider">Aprobaciones Directas</p>
              <div className="p-2 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white mt-3 font-mono">{kpis.aprobados}</p>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <span className="text-emerald-400 font-semibold">{kpis.tasaAprobacion}%</span>
              <span>tasa de efectividad BPM</span>
            </div>
          </div>

          {/* Card 3: Tareas Paralelas */}
          <div className="bg-[#111726] border border-amber-950/60 rounded-xl p-5 shadow-sm relative overflow-hidden group hover:border-amber-800/60 transition-all">
            <div className="absolute -top-12 -right-12 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-amber-400/90 uppercase tracking-wider">Tareas Paralelas (Fork)</p>
              <div className="p-2 rounded-lg bg-amber-950/80 text-amber-300 border border-amber-800/50">
                <GitFork className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white mt-3 font-mono">{kpis.tareasParalelas}</p>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Verificación de campo activa</span>
            </div>
          </div>

          {/* Card 4: Revisión de Riesgo */}
          <div className="bg-[#111726] border border-rose-950/60 rounded-xl p-5 shadow-sm relative overflow-hidden group hover:border-rose-800/60 transition-all">
            <div className="absolute -top-12 -right-12 w-28 h-28 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-rose-400/90 uppercase tracking-wider">Revisión de Riesgo</p>
              <div className="p-2 rounded-lg bg-rose-950/80 text-rose-400 border border-rose-800/50">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-bold text-white mt-3 font-mono">{kpis.revisionRiesgo}</p>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <span className="text-rose-400 font-medium">Comité</span>
              <span>requiere dictamen colegiado</span>
            </div>
          </div>
        </section>

        {/* Tab Selector */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2 p-1 rounded-xl bg-[#111726] border border-slate-800">
            <button
              onClick={() => setActiveTab('directorio')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'directorio'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              Directorio de Solicitudes
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-700/80 text-slate-300 font-mono">
                {solicitudes.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('nueva')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'nueva'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              Nueva Solicitud de Crédito
            </button>
          </div>

          <div className="text-xs text-slate-500 font-mono hidden sm:block">
            Motor BPM: Reglas V1.4 &middot; Enrutamiento Dinámico
          </div>
        </div>

        {/* ================================================================= */}
        {/* PESTAÑA 1: DIRECTORIO DE SOLICITUDES                             */}
        {/* ================================================================= */}
        {activeTab === 'directorio' && (
          <div className="space-y-4">
            {/* Search & Status Filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-[#111726]/60 p-3 rounded-xl border border-slate-800">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por cliente o cédula..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <Filter className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
                {['TODOS', 'Aprobado', 'Tareas_Paralelas', 'Revision_Riesgo', 'Rechazado'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      statusFilter === status
                        ? 'bg-slate-700 text-white font-semibold'
                        : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {status === 'TODOS' ? 'Todos los Estados' : status.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="bg-[#111726] border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0D121F] border-b border-slate-800/80 text-slate-400 uppercase tracking-wider font-mono text-[11px]">
                    <tr>
                      <th className="py-3.5 px-4 font-semibold">ID / Fecha</th>
                      <th className="py-3.5 px-4 font-semibold">Cliente</th>
                      <th className="py-3.5 px-4 font-semibold">Monto Solicitado</th>
                      <th className="py-3.5 px-4 font-semibold">Ingresos Mensuales</th>
                      <th className="py-3.5 px-4 font-semibold">Plazo</th>
                      <th className="py-3.5 px-4 font-semibold">Nivel Riesgo</th>
                      <th className="py-3.5 px-4 font-semibold">Estado BPM</th>
                      <th className="py-3.5 px-4 font-semibold text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {loading ? (
                      <tr>
                        <td colSpan="8" className="py-12 text-center text-slate-500">
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                            <span>Cargando instancias del motor BPM...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredSolicitudes.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="py-12 text-center text-slate-500">
                          No se encontraron solicitudes con los criterios seleccionados.
                        </td>
                      </tr>
                    ) : (
                      filteredSolicitudes.map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                          onClick={() => handleOpenDetail(item.id)}
                        >
                          <td className="py-3.5 px-4">
                            <span className="font-mono font-bold text-slate-200">#{item.id}</span>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {new Date(item.created_at).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-semibold text-white group-hover:text-emerald-300 transition-colors">
                              {item.cliente_nombre}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono">CI: {item.cliente_cedula}</p>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-semibold text-slate-100">
                            ${Number(item.monto_solicitado).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-300">
                            ${Number(item.ingresos_mensuales).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-400">
                            {item.plazo_meses} meses
                          </td>
                          <td className="py-3.5 px-4">
                            {renderRiskBadge(item.nivel_riesgo)}
                          </td>
                          <td className="py-3.5 px-4">
                            {renderStatusBadge(item.estado_actual)}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDetail(item.id);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-all"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Trazabilidad</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* PESTAÑA 2: NUEVA SOLICITUD DE CRÉDITO                            */}
        {/* ================================================================= */}
        {activeTab === 'nueva' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Formulario */}
            <div className="lg:col-span-7 bg-[#111726] border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-sm">
              <div className="flex items-center gap-3 pb-6 border-b border-slate-800">
                <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-800/60 text-emerald-400">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Nueva Solicitud de Crédito</h2>
                  <p className="text-xs text-slate-400">
                    Ingresa los datos del cliente. El motor BPM evaluará reglas en tiempo real.
                  </p>
                </div>
              </div>

              {formError && (
                <div className="mt-6 p-4 rounded-xl bg-rose-950/60 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmitForm} className="mt-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Nombre Completo del Cliente
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        name="cliente_nombre"
                        required
                        placeholder="Ej. Valeria Alarcón"
                        value={formData.cliente_nombre}
                        onChange={handleInputChange}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Cédula / Identificación
                    </label>
                    <div className="relative">
                      <FileText className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        name="cliente_cedula"
                        required
                        placeholder="Ej. 1723456789"
                        value={formData.cliente_cedula}
                        onChange={handleInputChange}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Ingresos Mensuales Netos ($ USD)
                    </label>
                    <div className="relative">
                      <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="number"
                        name="ingresos_mensuales"
                        required
                        min="100"
                        step="50"
                        placeholder="Ej. 1800"
                        value={formData.ingresos_mensuales}
                        onChange={handleInputChange}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Monto Solicitado ($ USD)
                    </label>
                    <div className="relative">
                      <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="number"
                        name="monto_solicitado"
                        required
                        min="500"
                        step="100"
                        placeholder="Ej. 4500"
                        value={formData.monto_solicitado}
                        onChange={handleInputChange}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    Plazo de Financiamiento (Meses)
                  </label>
                  <div className="grid grid-cols-5 gap-2.5">
                    {['12', '24', '36', '48', '60'].map((meses) => (
                      <button
                        key={meses}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, plazo_meses: meses }))}
                        className={`py-2 rounded-xl text-xs font-mono font-medium transition-all ${
                          formData.plazo_meses === meses
                            ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                            : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {meses} m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('directorio')}
                    className="px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Evaluando Reglas BPM...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Procesar en Motor BPM</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Panel Lateral: Simulación y Decisión Instantánea */}
            <div className="lg:col-span-5 space-y-6">
              {/* Simulador de Pre-evaluación */}
              <div className="bg-[#111726] border border-slate-800/80 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Simulación de Capacidad (DTI)
                    </h3>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Motor Heurístico</span>
                </div>

                {livePreAssessment ? (
                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase">Cuota Mensual Est.</p>
                        <p className="text-lg font-bold text-white font-mono mt-1">
                          ${livePreAssessment.cuotaEstimada}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase">Ratio Cuota/Ingreso</p>
                        <p className="text-lg font-bold text-white font-mono mt-1">
                          {livePreAssessment.ratioDti}%
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
                      <p className="text-[11px] text-slate-400 mb-2">Comportamiento esperado del motor:</p>
                      <div className="flex items-center gap-2">
                        {renderStatusBadge(livePreAssessment.dictamenEstimado.estado)}
                        <span className="text-xs text-slate-300 font-medium">
                          {livePreAssessment.dictamenEstimado.texto}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-500">
                    Ingresa monto e ingresos en el formulario para pre-visualizar el dictamen de reglas.
                  </div>
                )}
              </div>

              {/* Tarjeta de Decisión Instantánea tras Enviar */}
              {formDecision && (
                <div className="bg-[#111726] border-2 border-emerald-500/60 rounded-2xl p-6 shadow-xl shadow-emerald-950/20 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <CheckCircle2 className="w-4 h-4" />
                      Decisión Instantánea BPM
                    </span>
                    <span className="text-xs font-mono text-slate-400">ID #{formDecision.solicitud.id}</span>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Estado Asignado:</span>
                      {renderStatusBadge(formDecision.decision_bpm.estado_asignado)}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Nivel de Riesgo:</span>
                      {renderRiskBadge(formDecision.decision_bpm.nivel_riesgo)}
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
                      <p className="text-[10px] text-slate-500 uppercase font-mono mb-1">Fundamento de Regla:</p>
                      <p>{formDecision.decision_bpm.justificacion}</p>
                    </div>

                    {formDecision.decision_bpm.tareas_paralelas?.length > 0 && (
                      <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-xs">
                        <p className="text-[10px] text-amber-400 font-mono font-semibold uppercase mb-1.5 flex items-center gap-1">
                          <GitFork className="w-3 h-3" />
                          Tareas Paralelas Instanciadas (Fork):
                        </p>
                        <ul className="space-y-1 text-slate-300">
                          {formDecision.decision_bpm.tareas_paralelas.map(t => (
                            <li key={t.id} className="flex items-center justify-between text-[11px]">
                              <span>&bull; {t.tipo_tarea}</span>
                              <span className="font-mono text-amber-400">Pendiente</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button
                      onClick={() => handleOpenDetail(formDecision.solicitud.id)}
                      className="w-full mt-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>Ver Trazabilidad y Bitácora</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ================================================================= */}
      {/* PANEL LATERAL / MODAL DE TRAZABILIDAD Y AUDITORÍA INMUTABLE        */}
      {/* ================================================================= */}
      {selectedCreditId && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full max-w-2xl bg-[#0D121F] border-l border-slate-800 h-full flex flex-col shadow-2xl relative animate-in slide-in-from-right duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Drawer */}
            <div className="p-6 border-b border-slate-800/80 flex items-center justify-between bg-[#111726]/80">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300">
                  <FileText className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      Instancia #{selectedCreditId}
                    </h2>
                    {creditDetail && renderStatusBadge(creditDetail.solicitud.estado_actual)}
                  </div>
                  <p className="text-xs text-slate-400">
                    {creditDetail?.solicitud.cliente_nombre} &middot; CI: {creditDetail?.solicitud.cliente_cedula}
                  </p>
                </div>
              </div>

              <button
                onClick={handleCloseDetail}
                className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Contenido con Scroll */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loadingDetail || !creditDetail ? (
                <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                  <span className="text-xs">Cargando bitácora y sub-flujos BPM...</span>
                </div>
              ) : (
                <>
                  {/* Resumen Financiero */}
                  <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase">Monto</p>
                      <p className="font-mono font-bold text-white mt-0.5">
                        ${Number(creditDetail.solicitud.monto_solicitado).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase">Ingresos</p>
                      <p className="font-mono font-bold text-slate-300 mt-0.5">
                        ${Number(creditDetail.solicitud.ingresos_mensuales).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase">Plazo / Asesor</p>
                      <p className="font-mono text-slate-300 mt-0.5">
                        {creditDetail.solicitud.plazo_meses}m &middot; {creditDetail.solicitud.asesor_id || 'Digital'}
                      </p>
                    </div>
                  </div>

                  {/* Sección 1: Tareas Paralelas (Sub-flujos Fork & Join) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                        <GitFork className="w-4 h-4 text-amber-400" />
                        Sub-flujos Concurrentes (Tareas Paralelas)
                      </h3>
                      <span className="text-[10px] font-mono text-slate-500">
                        {creditDetail.tareas_paralelas?.length || 0} asignadas
                      </span>
                    </div>

                    {creditDetail.tareas_paralelas?.length === 0 ? (
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-500 text-center">
                        Esta solicitud no requirió sub-flujos de verificación en campo.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {creditDetail.tareas_paralelas.map((tarea) => (
                          <div
                            key={tarea.id}
                            className="p-4 rounded-xl bg-[#111726] border border-slate-800/80 space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-100 font-mono">
                                {tarea.tipo_tarea.replace('_', ' ')}
                              </span>
                              {tarea.estado === 'Completada' ? (
                                <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Completada
                                </span>
                              ) : tarea.estado === 'Rechazada' ? (
                                <span className="text-[11px] font-semibold text-rose-400 flex items-center gap-1">
                                  <XCircle className="w-3.5 h-3.5" />
                                  Rechazada
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" />
                                  Pendiente
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-slate-400">
                              Asignado a: <strong className="text-slate-300">{tarea.asignado_a || 'Oficial de Campo'}</strong>
                            </p>

                            {tarea.observaciones && (
                              <p className="text-[11px] text-slate-300 bg-slate-900 p-2 rounded-lg border border-slate-800 font-mono">
                                Nota: {tarea.observaciones}
                              </p>
                            )}

                            {/* Acciones de Resolver Tarea si está pendiente */}
                            {tarea.estado === 'Pendiente' && (
                              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleResolveTask(tarea.id, 'Rechazada')}
                                  className="px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/60 text-xs font-medium transition-colors"
                                >
                                  Rechazar
                                </button>
                                <button
                                  onClick={() => handleResolveTask(tarea.id, 'Completada')}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs shadow-sm transition-colors"
                                >
                                  Marcar Completada
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Sección 2: Bitácora de Auditoría Inmutable (WORM) */}
                  <div className="space-y-3 pt-4 border-t border-slate-800">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                        <Lock className="w-4 h-4 text-emerald-400" />
                        Bitácora de Auditoría Inmutable (WORM)
                      </h3>
                      <span className="text-[10px] text-slate-400 font-mono">SQLite Protected</span>
                    </div>

                    <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                      {creditDetail.bitacora_auditoria?.map((ev, index) => (
                        <div key={ev.id || index} className="relative group">
                          {/* Bullet Icon */}
                          <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-slate-900 border border-emerald-500/80 flex items-center justify-center text-[10px] font-mono text-emerald-400">
                            {index + 1}
                          </div>

                          <div className="bg-[#111726] border border-slate-800 rounded-xl p-3.5 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white font-mono">
                                {ev.accion}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {new Date(ev.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-400">
                              Responsable: <strong className="text-slate-300">{ev.usuario_responsable}</strong>
                            </p>

                            {ev.resultado && (
                              <pre className="text-[10px] font-mono p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 overflow-x-auto">
                                {typeof ev.resultado === 'object'
                                  ? JSON.stringify(ev.resultado, null, 2)
                                  : ev.resultado}
                              </pre>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer con aviso de inmutabilidad */}
            <div className="p-4 border-t border-slate-800/80 bg-[#111726]/60 text-center">
              <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5 font-mono">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                Registros protegidos contra alteración o eliminación por Triggers ABORT de SQLite
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

