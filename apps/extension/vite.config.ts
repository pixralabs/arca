import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup/index.html'),
        options: resolve(__dirname, 'options/index.html'),
        share: resolve(__dirname, 'share/index.html'),
        offscreen: resolve(__dirname, 'offscreen/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        contentFill: resolve(__dirname, 'src/content/fill.ts'),
        contentFormObserver: resolve(__dirname, 'src/content/formObserver.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'background/index.js';
          }
          if (chunkInfo.name === 'contentFill') {
            return 'content/fill.js';
          }
          if (chunkInfo.name === 'contentFormObserver') {
            return 'content/formObserver.js';
          }
          return '[name]/assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@vaultguard/shared': resolve(__dirname, '../../packages/shared/src'),
      '@vaultguard/crypto': resolve(__dirname, '../../packages/crypto/src'),
      '@vaultguard/ui': resolve(__dirname, '../../packages/ui/src'),
    },
  },
});
