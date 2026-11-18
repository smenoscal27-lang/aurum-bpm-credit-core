import React, { useState } from 'react';
import Login from './components/Login';
import DashboardCreditos from './components/DashboardCreditos';

/**
 * AURUM BPM Credit Core - Contenedor Raíz con Route Guard Bancario
 * Administra el estado de la sesión activa y el ciclo de vida del usuario.
 */
function App() {
  const [user, setUser] = useState(() => {
    try {
      const storedUserId = localStorage.getItem('aurum_user_id');
      const storedRole = localStorage.getItem('aurum_user_role');
      if (storedUserId && storedRole) {
        return {
          id: storedUserId,
          role: storedRole,
          nombre: localStorage.getItem('aurum_user_name') || 'Operador Bancario',
          email: localStorage.getItem('aurum_user_email') || '',
          cargo: localStorage.getItem('aurum_user_cargo') || '',
          signature: localStorage.getItem('aurum_auth_token') || ''
        };
      }
    } catch (e) {
      console.error('Error leyendo sesión de localStorage:', e);
    }
    return null;
  });

  const handleLoginSuccess = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('aurum_user_id');
      localStorage.removeItem('aurum_user_role');
      localStorage.removeItem('aurum_user_name');
      localStorage.removeItem('aurum_user_email');
      localStorage.removeItem('aurum_user_cargo');
      localStorage.removeItem('aurum_auth_token');
    } catch (e) {
      console.error('Error eliminando sesión de localStorage:', e);
    }
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-[#080B11] text-slate-100">
      {!user ? (
        <Login onLoginSuccess={handleLoginSuccess} />
      ) : (
        <DashboardCreditos user={user} onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;
