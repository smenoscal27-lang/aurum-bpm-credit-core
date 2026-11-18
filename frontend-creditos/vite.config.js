import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Base path adaptativo: /aurum-bpm-credit-core/ para GitHub Pages y / para entorno local
  base: process.env.NODE_ENV === 'development'
    ? '/'
    : (process.env.GITHUB_ACTIONS ? '/aurum-bpm-credit-core/' : (process.env.VITE_BASE_PATH || '/aurum-bpm-credit-core/')),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  }
})

