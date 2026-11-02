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
