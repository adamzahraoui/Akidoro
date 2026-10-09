import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages project site is served from /Akidoro/. The dev server stays at the
// root (http://localhost:5173/) so the documented local URL keeps working.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Akidoro/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
}));
