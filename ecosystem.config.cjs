/**
 * ============================================================================
 * AURUM BPM Credit Core - Configuración PM2 (ecosystem.config.cjs)
 * Gestión de Procesos para Hostinger VPS / Linux
 * ============================================================================
 */

module.exports = {
  apps: [
    {
      name: 'aurum-bpm-credit-core',
      script: './server.js',
      instances: 1, // Arquitectura 'fork' de 1 proceso optimizada para SQLite WAL
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      time: true,
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000
      }
    }
  ]
};
