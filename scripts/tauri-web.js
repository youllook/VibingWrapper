// Tauri build (2026-11-07): copies the pages the shell itself shows into web-dist/, which Tauri embeds in the exe.
// Only these few files: themes/ (GBs) stay on disk and are served by the bridge on 127.0.0.1:47321.
// Also writes web-dist/i18n-en.json (tools/i18n.js's EN table) for the Rust side's tray and window titles.
// Runs as tauri.conf.json beforeDevCommand / beforeBuildCommand.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web-dist');
const FILES = ['prototype/hud.html', 'tools/i18n.js', 'tools/store.html', 'tools/help.html'];
const DIRS = ['prototype/vendor', 'assets'];

fs.rmSync(OUT, { recursive: true, force: true });
const copy = rel => { const to = path.join(OUT, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), to); };
FILES.forEach(copy);
for (const d of DIRS) for (const f of fs.readdirSync(path.join(ROOT, d))) if (fs.statSync(path.join(ROOT, d, f)).isFile()) copy(d + '/' + f);
fs.writeFileSync(path.join(OUT, 'i18n-en.json'), JSON.stringify(require('../tools/i18n').en));
console.log('web-dist ready');
