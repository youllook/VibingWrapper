// 除錯紀錄 (2026-10-22): %APPDATA%\vibing-wrapper\debug.log, so a friend whose copy won't open or whose wallpaper
// never shows can just send this file instead of running commands. One line per event, plain text.
// Startup facts (version, Windows build, GPU, screens), why the app quit, each wallpaper attach step, and crashes.
// The previous run's file is kept as debug.old.log.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

let file = null;

// rotate=false for a second copy: it only adds its "already running" line to the first copy's file
function init(dir, rotate = true) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, 'debug.log');
    if (rotate && fs.existsSync(file)) fs.renameSync(file, path.join(dir, 'debug.old.log'));
  } catch { file = null; }
}

function log(tag, ...parts) {
  const text = parts.map(p => p instanceof Error ? (p.stack || p.message) : typeof p === 'string' ? p : JSON.stringify(p)).join(' ');
  const line = `${new Date().toISOString()} [${tag}] ${text}\n`;
  if (file) try { fs.appendFileSync(file, line); } catch {}
}

// Windows' own name for the release (24H2, 25H2 …) and build: os.release() alone says 10.0.26100 for both 24H2 and 25H2
function windowsVersion() {
  return new Promise(res => {
    if (process.platform !== 'win32') return res(null);
    execFile('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'], { windowsHide: true, timeout: 5000 }, (err, out) => {
      if (err) return res(null);
      const v = k => (String(out).match(new RegExp('^\\s*' + k + '\\s+REG_\\w+\\s+(.+)$', 'm')) || [])[1]?.trim();
      // Windows 11 still writes "Windows 10 …" as ProductName; build 22000+ is 11
      const product = (v('ProductName') || '').replace(/^Windows 10/, Number(v('CurrentBuild')) >= 22000 ? 'Windows 11' : 'Windows 10');
      res({ product, release: v('DisplayVersion'), build: [v('CurrentBuild'), v('UBR') && parseInt(v('UBR'), 16)].filter(Boolean).join('.') });
    });
  });
}

// app/screen are passed in: this file is required before Electron is ready
async function startup(app, screen) {
  log('start', `VibingWrapper ${app.getVersion()} · Electron ${process.versions.electron} · Chrome ${process.versions.chrome}`,
    `· ${process.platform} ${os.release()} ${process.arch} · packaged=${app.isPackaged}`);
  log('start', 'exe', process.execPath, '· userData', app.getPath('userData'));
  const win = await windowsVersion();
  if (win) log('start', 'windows', `${win.product || '?'} ${win.release || '?'} build ${win.build || '?'}`);
  try {
    log('start', 'screens', screen.getAllDisplays().map(d => `${d.bounds.width}x${d.bounds.height}@${d.scaleFactor}${d.id === screen.getPrimaryDisplay().id ? '(primary)' : ''}`).join(', '));
  } catch (e) { log('start', 'screens ?', e); }
  app.getGPUInfo('basic').then(g => {
    const gpus = (g.gpuDevice || []).map(d => `${d.active ? '*' : ''}${d.vendorId?.toString(16)}:${d.deviceId?.toString(16)} ${d.driverVersion || ''}`.trim());
    log('start', 'gpu', gpus.join(' | ') || 'none reported');
  }).catch(e => log('start', 'gpu ?', e));
}

// crashes of the main process and of any page / GPU process
function watch(app) {
  process.on('uncaughtException', e => log('crash', 'uncaught', e));
  process.on('unhandledRejection', e => log('crash', 'unhandled rejection', e));
  app.on('render-process-gone', (_e, wc, d) => log('crash', 'page gone', wc.getURL(), d.reason, 'exit', d.exitCode));
  app.on('child-process-gone', (_e, d) => log('crash', d.type, 'gone', d.reason, 'exit', d.exitCode, d.name || ''));
  app.on('will-quit', () => log('quit', 'will-quit'));
  // anything the code already reports with console.error lands here too
  const orig = console.error.bind(console);
  console.error = (...a) => { log('error', ...a); orig(...a); };
}

module.exports = { init, log, startup, watch, file: () => file };
