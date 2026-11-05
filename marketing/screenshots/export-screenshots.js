/**
 * @file marketing/screenshots/export-screenshots.js
 * @description Headless Chromium Play Store screenshot exporter for all device form factors.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CHROMIUM_PATH = '/snap/bin/chromium';
const HTML_FILE = path.resolve(__dirname, 'generate-mockups.html');

const TARGETS = [
  {
    name: 'phone',
    dir: path.resolve(__dirname, 'phone'),
    width: 1080,
    height: 1920,
    device: 'phone',
  },
  {
    name: 'tablet/7-inch',
    dir: path.resolve(__dirname, 'tablet/7-inch'),
    width: 1200,
    height: 1920,
    device: 'tablet-7',
  },
  {
    name: 'tablet/10-inch',
    dir: path.resolve(__dirname, 'tablet/10-inch'),
    width: 1600,
    height: 2560,
    device: 'tablet-10',
  },
  {
    name: 'desktop',
    dir: path.resolve(__dirname, 'desktop'),
    width: 1920,
    height: 1080,
    device: 'desktop',
  },
];

const SLIDES = [
  { id: 1, name: '01_vault.png' },
  { id: 2, name: '02_totp.png' },
  { id: 3, name: '03_add_item.png' },
  { id: 4, name: '04_settings.png' },
  { id: 5, name: '05_setup.png' },
];

async function main() {
  console.log('🚀 Starting Google Play Store Screenshot Generation...\n');

  for (const target of TARGETS) {
    if (!fs.existsSync(target.dir)) {
      fs.mkdirSync(target.dir, { recursive: true });
    }

    console.log(`📦 Generating [${target.name}] (${target.width}x${target.height})...`);

    for (const slide of SLIDES) {
      const outputPath = path.join(target.dir, slide.name);
      const url = `file://${HTML_FILE}?slide=${slide.id}&device=${target.device}`;

      const cmd = `"${CHROMIUM_PATH}" --headless --disable-gpu --hide-scrollbars --screenshot="${outputPath}" --window-size=${target.width},${target.height} "${url}"`;

      try {
        execSync(cmd, { stdio: 'pipe' });
        const stats = fs.statSync(outputPath);
        const kb = (stats.size / 1024).toFixed(1);
        console.log(`  ✓ ${slide.name} -> ${kb} KB`);
      } catch (err) {
        console.error(`  ✗ Error generating ${slide.name}:`, err.message);
      }
    }
    console.log('');
  }

  console.log('🎉 All screenshots generated successfully!');
}

main().catch(console.error);

