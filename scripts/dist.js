// 完整版 zip: npm run dist → dist/VibingWrapper-<version>-win-x64.zip, everything inside VibingWrapper-<version>/
// Themes whose theme.json says "bundled": false stay out of the zip (2026-10-21): they are download-only,
// from the gear menu → 下載主題 (scripts/pack-themes.js).
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const { pack } = require('./pack');

const THEMES = path.join(__dirname, '..', 'themes');
const downloadOnly = fs.readdirSync(THEMES, { withFileTypes: true }).filter(d => {
  if (!d.isDirectory()) return false;
  try { return JSON.parse(fs.readFileSync(path.join(THEMES, d.name, 'theme.json'), 'utf8')).bundled === false; } catch { return false; }
}).map(d => `!themes/${d.name}/**`);

pack({ config: { ...pkg.build, files: [...pkg.build.files, ...downloadOnly] }, folder: `${pkg.build.productName}-${pkg.version}` })
  .catch(e => { console.error(e); process.exit(1); });
