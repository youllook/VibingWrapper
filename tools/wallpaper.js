// Weather wallpaper host (2026-09-30): replaces Lively Wallpaper. Opens the chosen theme page (themes/<id>/) in a
// full-screen window and parents it BEHIND the desktop icons (attach-wallpaper.ps1), so it is
// always the bottom layer and can never be clicked or selected.
// The page is served by claude-bridge (http://127.0.0.1:47321/themes/<id>/) so its fetch('state.json')
// works exactly as the spec says.
const { BrowserWindow, screen } = require('electron');
const { execFile } = require('child_process');
const path = require('path');

let win = null, enabled = false, retryT = null, currentUrl = null, paused = false;

function attach() {
  if (!win || win.isDestroyed()) return;
  const b = screen.getPrimaryDisplay().bounds;           // full screen, behind the taskbar too
  const hwnd = win.getNativeWindowHandle();
  const id = hwnd.length >= 8 ? hwnd.readBigUInt64LE(0) : BigInt(hwnd.readUInt32LE(0));
  execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'attach-wallpaper.ps1'),
    '-Hwnd', id.toString(), '-X', String(b.x), '-Y', String(b.y), '-W', String(b.width), '-H', String(b.height)],
    { windowsHide: true, timeout: 20000 }, (err, out) => {
      if (!win || win.isDestroyed()) return;
      if (err || !(Number(String(out).trim()) > 0)) { console.error('[wallpaper] attach failed', err || out); return; }
      win.setOpacity(1);                                  // invisible until it sits under the icons
    });
}

function create(url) {
  const b = screen.getPrimaryDisplay().bounds;
  win = new BrowserWindow({
    // thickFrame: false — otherwise Chromium keeps a 7–8 px invisible resize border inside the window,
    // which showed as a black strip on the left once parented under the icons (2026-09-30)
    ...b, show: false, frame: false, thickFrame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, focusable: false, hasShadow: false, backgroundColor: '#1b2230',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setIgnoreMouseEvents(true);
  win.setOpacity(0);
  win.loadURL(url);
  win.once('ready-to-show', () => { win.showInactive(); attach(); });
  win.webContents.on('did-finish-load', applyPause);
  // Explorer restarts destroy the WorkerW (and our window with it): come back after a moment
  win.on('closed', () => { win = null; if (enabled) { clearTimeout(retryT); retryT = setTimeout(() => create(currentUrl || url), 3000); } });
}

function setEnabled(on, url) {
  enabled = on;
  if (url) currentUrl = url;
  if (on && win && !win.isDestroyed() && url && win.webContents.getURL() !== url) win.loadURL(url);   // style change: swap the page in place
  if (on && !win) create(url);
  if (!on && win && !win.isDestroyed()) { const w = win; win = null; w.destroy(); }
}

// 2026-10-01: pause while a window covers the whole desktop (main.js polls). Each wallpaper page exposes
// window.wpPause(on); it resumes from where it stopped, so nothing jumps. A freshly loaded page starts
// running, so the flag is re-sent after every load.
function applyPause() {
  if (win && !win.isDestroyed()) win.webContents.executeJavaScript(`window.wpPause && window.wpPause(${paused})`).catch(() => {});
}
function setPaused(on) { if (on === paused) return; paused = on; applyPause(); }

// screen size changed → re-attach with the new rectangle
function reattach() { if (win && !win.isDestroyed()) attach(); }

module.exports = { setEnabled, reattach, setPaused, isPaused: () => paused };
