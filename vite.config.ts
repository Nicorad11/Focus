import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps every asset path relative, so the same build runs from the
// Vite dev server, a static host (GitHub Pages), and inside the Tauri desktop shell.
export default defineConfig({
  base: './',
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
