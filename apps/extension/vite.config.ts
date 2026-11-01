import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
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
      'libsodium-wrappers-sumo': resolve(__dirname, '../../node_modules/.pnpm/libsodium-wrappers-sumo@0.7.16/node_modules/libsodium-wrappers-sumo/dist/modules-sumo-esm/libsodium-wrappers.mjs'),
      './libsodium-sumo.mjs': resolve(__dirname, '../../node_modules/.pnpm/libsodium-sumo@0.7.16/node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs'),
      'libsodium-sumo': resolve(__dirname, '../../node_modules/.pnpm/libsodium-sumo@0.7.16/node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs'),
    },
  },
});
