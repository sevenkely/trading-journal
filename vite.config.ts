import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Autorise l'aperçu hébergé (*.e2b.app) et localhost
    allowedHosts: ['.e2b.app', 'localhost'],
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Les pages sont chargées à la demande : le premier rendu peut être lent
    testTimeout: 20_000,
    // Les tests supposent le mode démo. Le `.env` du développeur ne doit pas les faire
    // basculer en mode Supabase : sans session, les pages afficheraient l'écran de
    // connexion et les audits porteraient sur la mauvaise page.
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
});
