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
    },
    resolveRequest: (context, moduleName, platform) => {
      if (['url', 'path', 'fs', 'crypto', 'stream', 'os', 'http', 'https', 'zlib'].includes(moduleName)) {
        return { type: 'empty' };
      }
      if (moduleName === 'libsodium-wrappers-sumo') {
        return {
          type: 'sourceFile',
          filePath: path.resolve(monorepoRoot, 'node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js'),
        };
      }
      if (moduleName === 'libsodium-sumo') {
        return {
          type: 'sourceFile',
          filePath: path.resolve(monorepoRoot, 'node_modules/libsodium-sumo/dist/modules-sumo/libsodium-sumo.js'),
        };
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
