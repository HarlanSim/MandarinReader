import { defineConfig, build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync } from 'fs';

export default defineConfig({
  publicDir: 'public',
  plugins: [
    react(),
    {
      name: 'build-content-script',
      async closeBundle() {
        await build({
          configFile: false,
          build: {
            outDir: 'dist',
            emptyOutDir: false,
            lib: {
              entry: resolve(__dirname, 'src/content/content.ts'),
              name: 'MandarinReaderContent',
              formats: ['iife'],
              fileName: () => 'content.js',
            },
            rollupOptions: {
              output: {
                inlineDynamicImports: true,
              },
            },
          },
        });

        const distDir = resolve(__dirname, 'dist');

        copyFileSync(
          resolve(__dirname, 'manifest.json'),
          resolve(distDir, 'manifest.json')
        );

        copyFileSync(
          resolve(__dirname, 'src/content/content.css'),
          resolve(distDir, 'content.css')
        );
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/pages/popup.html'),
        vocabulary: resolve(__dirname, 'src/pages/vocabulary.html'),
        'word-detail': resolve(__dirname, 'src/pages/word-detail.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
