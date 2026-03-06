import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  base: '/',
  server: {
    port: 5173,
    strictPort: false,
    open: true,
    hmr: true,
    headers: {
      // Required for SharedArrayBuffer (Havok physics) and correct WASM MIME type
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          babylon: ['@babylonjs/core'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@core': resolve(__dirname, './src/core'),
      '@systems': resolve(__dirname, './src/systems'),
      '@entities': resolve(__dirname, './src/entities'),
      '@gameplay': resolve(__dirname, './src/gameplay'),
      '@animation': resolve(__dirname, './src/animation'),
      '@vfx': resolve(__dirname, './src/vfx'),
      '@ui': resolve(__dirname, './src/ui'),
      '@audio': resolve(__dirname, './src/audio'),
    },
  },
  optimizeDeps: {
    include: ['@babylonjs/core', 'howler'],
  },
});
