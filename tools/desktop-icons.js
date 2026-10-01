// 收桌面 (2026-09-30): one switch that hides / shows ALL desktop icons — the same as desktop right-click →
// 檢視 → 顯示桌面圖示. Nothing is moved, so every icon comes back exactly where it was.
// Ctrl+Alt+D (2026-10-01; a plain Ctrl+H was tried first and dropped: it stole Ctrl+H from every app), or the
// tray / gear menu. A resident PowerShell helper (desktop-icons.ps1) does the
// Win32 call, so a toggle answers at once instead of paying PowerShell's start-up each time.
// The same helper also answers covered() — is the desktop hidden behind a maximized / full-screen window —
// which main.js polls to pause the wallpaper (2026-10-01).
const { spawn } = require('child_process');
const path = require('path');
const { globalShortcut } = require('electron');

const HOTKEY = 'Control+Alt+D';
const status = { hotkey: false };   // false = another program holds Ctrl+Alt+D

let ps = null, buf = '', waiting = [], onChange = () => {};
let visible = true;

function helper() {
  if (ps) return ps;
  ps = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'desktop-icons.ps1')], { windowsHide: true });
  ps.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      const r = waiting.shift();
      if (r) r(line);
    }
  });
  ps.on('exit', () => { ps = null; buf = ''; for (const r of waiting.splice(0)) r(null); });
  ps.on('error', e => console.error('[desktop-icons]', e.message));
  return ps;
}
function ask(cmd) {
  return new Promise(resolve => {
    waiting.push(resolve);
    try { helper().stdin.write(cmd + '\n'); } catch { waiting.pop(); resolve(null); }
  });
}

const seen = line => { if (line === '0' || line === '1') visible = line === '1'; return visible; };
const get = () => ask('get').then(seen);
async function toggle() { const v = seen(await ask('toggle')); onChange(v); return v; }
const covered = () => ask('covered').then(line => line === 'c1');

function init(cb) {
  if (cb) onChange = cb;
  status.hotkey = globalShortcut.register(HOTKEY, () => { toggle(); });
  get().then(v => onChange(v));
}
function stop() { if (ps) { ps.stdin.end(); ps = null; } }

module.exports = { init, get, toggle, covered, stop, status, isVisible: () => visible };
