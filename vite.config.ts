import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const src = resolve(import.meta.dirname, 'src');

export default defineConfig({
  root: src,
  publicDir: resolve(import.meta.dirname, 'public'),
  envDir: import.meta.dirname,
  plugins: [tailwindcss()],
  server: { open: '/html/login.html' },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      // Cada página nueva del sistema se agrega aquí.
      input: {
        login: resolve(src, 'html/login.html'),
        panel: resolve(src, 'html/panel.html'),
        ventas: resolve(src, 'html/ventas.html'),
        historial: resolve(src, 'html/historial.html'),
        recibo: resolve(src, 'html/recibo.html'),
      },
    },
  },
});
