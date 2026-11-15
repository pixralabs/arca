import { defineConfig } from 'vitest/config';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const libsodiumPath = require.resolve('libsodium-wrappers-sumo');

export default defineConfig({
  test: {
    environment: 'node',
    alias: {
      'libsodium-wrappers-sumo': libsodiumPath,
    },
  },
});
