// Tauri zip (2026-11-07): dist/VibingWrapper-<version>-tauri-win-x64.zip, one folder VibingWrapper-<version>-tauri/
// inside with VibingWrapper.exe, themes/basic and a README. Other themes come from 主題庫. The updater looks for
// exactly this asset name (*-tauri-win-x64.zip) on GitHub Releases.
// 用法：npm run dist:tauri   (--skip-build: package the exe already in src-tauri/target/release)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');
const THEMES = ['basic'];
const NAME = `VibingWrapper-${pkg.version}-tauri`;
const OUT = path.join(ROOT, 'dist');
const DIR = path.join(OUT, NAME);
const ZIP = path.join(OUT, `${NAME}-win-x64.zip`);

if (!process.argv.includes('--skip-build')) execFileSync('npx', ['tauri', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true });

fs.rmSync(DIR, { recursive: true, force: true });
fs.rmSync(ZIP, { force: true });
fs.mkdirSync(DIR, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'src-tauri', 'target', 'release', 'VibingWrapper.exe'), path.join(DIR, 'VibingWrapper.exe'));
for (const t of THEMES) fs.cpSync(path.join(ROOT, 'themes', t), path.join(DIR, 'themes', t), { recursive: true });
fs.writeFileSync(path.join(DIR, 'README.txt'), [
  `VibingWrapper ${pkg.version}`,
  '',
  '雙擊 VibingWrapper.exe 就會啟動：右上角出現小狀態列，桌布換成會跟著 Claude Code／Codex 變天氣的動態桌布。',
  '第一次用：齒輪 → 設定 → 安裝 Claude hook，然後重開 Claude Code。更多主題在齒輪 →「主題庫」。',
  '需要 Microsoft Edge WebView2（Windows 10／11 大多已內建）。',
  '解除安裝：齒輪 → 設定 → 解除安裝，或 Windows 設定 → 已安裝的應用程式。',
  '',
  'Double-click VibingWrapper.exe: a small status strip appears top-right and the wallpaper turns into live weather',
  'that follows Claude Code / Codex. First time: gear → Settings → Install Claude hook, then restart Claude Code.',
  'More themes: gear → Theme library. Needs Microsoft Edge WebView2 (built into most Windows 10 / 11).',
  'Uninstall: gear → Settings → Uninstall, or Windows Settings → Installed apps.',
  '',
  'https://github.com/youllook/VibingWrapper',
  '',
].join('\r\n'));

// System32's bsdtar writes zip with -a (a Git-for-Windows GNU tar earlier on PATH cannot)
const TAR = path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'tar.exe');
execFileSync(TAR, ['-a', '-c', '-f', ZIP, '-C', OUT, NAME]);
const mb = f => (fs.statSync(f).size / 1048576).toFixed(2) + ' MB';
console.log(`exe ${mb(path.join(DIR, 'VibingWrapper.exe'))}, zip ${mb(ZIP)}\n${ZIP}`);
