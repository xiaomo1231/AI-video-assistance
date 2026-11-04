import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve('renderer'),
  base: './',
  plugins: [react()],
  build: { outDir: path.resolve('dist'), emptyOutDir: true, chunkSizeWarningLimit: 2000, target: 'chrome130' },
  server: { fs: { allow: [path.resolve('.')] } },
});
