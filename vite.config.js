import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages serves a project site from /<repo-name>/, so the deploy workflow sets VITE_BASE to that.
  // Locally (and on a custom domain) it stays '/'.
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
