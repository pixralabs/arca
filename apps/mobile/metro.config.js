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
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
