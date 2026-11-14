import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const proxyTarget = loadEnv(mode, '..', 'API_PROXY_TARGET').API_PROXY_TARGET || 'http://127.0.0.1:3000';
  return {
    envDir: '..',
    plugins: [react(), tailwindcss()],
    server: { host: '0.0.0.0', port: 4173, strictPort: true, proxy: { '/api': { target: proxyTarget, changeOrigin: true } } },
    preview: { proxy: { '/api': { target: proxyTarget, changeOrigin: true } } },
    test: { environment: 'node' },
  };
});
