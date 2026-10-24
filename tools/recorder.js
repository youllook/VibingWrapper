// Screen recording (2026-09-30): gear menu / tray → record the primary screen (+ system audio when
// Windows allows loopback) → Videos\錄影_YYYYMMDD_HHMMSS.mp4 (webm if mp4 is unsupported).
// A hidden page (recorder.html) runs getDisplayMedia + MediaRecorder; chunks arrive every second and
// are appended to the file right away, so long recordings do not pile up in memory.
const { app, BrowserWindow, desktopCapturer, screen, session, ipcMain, shell, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');

let win = null, out = null, file = null, startedAt = 0, state = 'idle';   // idle | starting | recording | stopping
let onChange = () => {};
// Ctrl+Alt+R starts / stops (2026-10-02; pairs with Win+Alt+R = Game Bar). Global: it also takes Ctrl+Alt+R away from
// other apps (Notepad++ uses it for right-to-left text).
const HOTKEY = 'Control+Alt+R';
let hotkey = false;                                                   // false = another program holds it

function stamp() {
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}
function setState(s) { state = s; onChange(status()); }
function status() { return { state, startedAt, file, hotkey }; }

function makeWindow() {
  // own session: the display-media handler below only applies to this page
  const ses = session.fromPartition('recorder');
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const primary = screen.getPrimaryDisplay();
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      const src = sources.find(s => s.display_id === String(primary.id)) || sources[0];
      callback(src ? { video: src, ...(request.audioRequested ? { audio: 'loopback' } : {}) } : {});
    } catch (e) { console.error('[recorder]', e); callback({}); }
  });
  win = new BrowserWindow({
    show: false, skipTaskbar: true,
    webPreferences: { partition: 'recorder', preload: path.join(__dirname, 'recorder-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.loadFile(path.join(__dirname, 'recorder.html'));
  win.on('closed', () => { win = null; });
  return new Promise(r => win.webContents.once('did-finish-load', r));
}

async function start() {
  if (state !== 'idle') return;
  setState('starting');
  try {
    if (!win || win.isDestroyed()) await makeWindow();
    win.webContents.send('rec:start');
  } catch (e) { console.error('[recorder]', e); setState('idle'); }
}
function stop() { if (state === 'recording' && win) { setState('stopping'); win.webContents.send('rec:stop'); } }
function toggle() { if (state === 'idle') start(); else stop(); }

// page → main
ipcMain.on('rec:started', (_e, ext) => {
  const dir = app.getPath('videos');
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, `錄影_${stamp()}.${ext}`);
  out = fs.createWriteStream(file);
  startedAt = Date.now();
  setState('recording');
});
ipcMain.on('rec:chunk', (_e, buf) => { if (out) out.write(Buffer.from(buf)); });
ipcMain.on('rec:done', () => {
  const f = file;
  if (out) out.end(() => { if (f) shell.showItemInFolder(f); });
  out = null; startedAt = 0; setState('idle');
});
ipcMain.on('rec:failed', (_e, msg) => {
  console.error('[recorder] failed:', msg);
  if (out) out.end(); out = null; startedAt = 0; setState('idle');
});

// 錄目前視窗 (2026-09-30): Xbox Game Bar records the app window the user was in (Win+Alt+R; again = stop).
// gamebar.ps1 brings that window back to the front first, since clicking our menu took the focus.
const { execFile } = require('child_process');
function gameBar() {
  return new Promise(resolve => execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'gamebar.ps1'), '-OwnPid', String(process.pid)],
    { windowsHide: true, timeout: 15000, encoding: 'utf8' }, (err, out) => {
      if (err) console.error('[recorder] game bar', err.message);
      resolve(String(out || '').trim());
    }));
}

function init(cb) {
  if (cb) onChange = cb;
  try { hotkey = globalShortcut.register(HOTKEY, toggle); } catch { hotkey = false; }
  onChange(status());
}
module.exports = { init, toggle, start, stop, status, gameBar };
