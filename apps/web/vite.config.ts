import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@whiteboard': fileURLToPath(new URL('./src/features/whiteboard', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
    dedupe: ['react', 'react-dom', 'react-konva', 'konva', 'lucide-react'],
  },
});
