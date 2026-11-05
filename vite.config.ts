import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages serwuje projekt pod adresem /<nazwa-repozytorium>/, a nie pod
 * korzeniem domeny. Bez `base` przegladarka szukalaby /assets/... zamiast
 * /aualejgo/assets/... i gra nie wczytalaby zadnej grafiki.
 *
 * W trybie dev zostawiamy '/', zeby lokalnie dzialalo http://localhost:5173/.
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/aualejgo/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
}));
