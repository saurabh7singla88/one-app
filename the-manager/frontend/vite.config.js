import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'ENABLE_'],
  base: './',   // relative paths so Electron can load via file://
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:47421',
        changeOrigin: true
      }
    }
  }
})
