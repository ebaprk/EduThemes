import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const frontendDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: resolve(frontendDir, 'participant'),
  envDir: frontendDir,
  publicDir: resolve(frontendDir, 'public'),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(frontendDir, 'dist-participant'),
    emptyOutDir: true,
    manifest: true,
  },
  server: { port: 3001 },
  base: '/',
});
