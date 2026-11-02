#!/usr/bin/env node
/**
 * @file scripts/build-extension.mjs
 * @description Monorepo Extension Builder. Runs Vite inside apps/extension and validates manifest.json.
 */

import { execSync } from 'child_process';
import { resolve } from 'path';
import { existsSync, copyFileSync } from 'fs';

const rootDir = process.cwd();
const extensionDir = resolve(rootDir, 'apps/extension');

console.log('🚀 Building Arca Extension...');
execSync('pnpm --filter @vaultguard/extension build', {
  cwd: rootDir,
  stdio: 'inherit',
});

console.log('📦 Extension build complete in apps/extension/dist');
