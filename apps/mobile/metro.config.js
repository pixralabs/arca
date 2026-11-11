const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = {
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    extraNodeModules: {
      '@vaultguard/shared': path.resolve(monorepoRoot, 'packages/shared/src'),
      '@vaultguard/crypto': path.resolve(monorepoRoot, 'packages/crypto/src'),
      'react-native-sodium-jsi': path.resolve(projectRoot, 'src/crypto/sodiumJsi.ts'),
      '@vaultguard/react-native-sodium': path.resolve(projectRoot, 'src/crypto/sodiumJsi.ts'),
    },
    resolveRequest: (context, moduleName, platform) => {
      if (['url', 'path', 'fs', 'crypto', 'stream', 'os', 'http', 'https', 'zlib'].includes(moduleName)) {
        return { type: 'empty' };
      }
      // Route all libsodium imports (including shared @vaultguard/crypto imports)
      // directly to the zero-copy C++ JSI adapter on React Native (zero WASM/asm.js).
      if (
        moduleName === 'react-native-sodium-jsi' ||
        moduleName === '@vaultguard/react-native-sodium' ||
        moduleName === 'libsodium-wrappers-sumo' ||
        moduleName === 'libsodium-sumo'
      ) {
        return {
          type: 'sourceFile',
          filePath: path.resolve(projectRoot, 'src/crypto/sodiumJsi.ts'),
        };
      }
      if (moduleName === 'react-native-jail-monkey') {
        try {
          return context.resolveRequest(context, 'jail-monkey', platform);
        } catch (_) {}
      }
      try {
        return context.resolveRequest(context, moduleName, platform);
      } catch (e) {
        if (moduleName.endsWith('.js')) {
          const stripped = moduleName.slice(0, -3);
          try {
            return context.resolveRequest(context, stripped, platform);
          } catch (_) {}
        }
        throw e;
      }
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
