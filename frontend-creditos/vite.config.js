import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Ruta base exacta para despliegue en GitHub Pages bajo el subdirectorio del repositorio
  base: '/aurum-bpm-credit-core/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
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
