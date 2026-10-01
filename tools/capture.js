// Screen tools (2026-09-29): replaces the two PicPick features the user actually used.
//   Ctrl+Q  screen eyedropper → hex colour to the clipboard
//   Ctrl+R  crosshair region capture → PNG to the clipboard + a copy saved in SAVE_DIR
// Separate from the pet on purpose: it only shares the Electron process (already running at login).
// Flow: grab the display under the cursor → show a frozen full-screen overlay (pre-created, so it
// opens fast) → the page reports a colour / rectangle → clipboard.
const { app, BrowserWindow, globalShortcut, desktopCapturer, screen, clipboard, ClipboardItem, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const HOTKEYS = { 'Control+Q': 'color', 'Control+R': 'region' };
const SAVE_DIR = path.join(app.getPath('pictures'), 'Saved Pictures');   // user's choice (2026-09-29)

// 截圖_20260929_154512.png (+ _2, _3 … when several land in the same second)
function savePng(png) {
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  fs.mkdirSync(SAVE_DIR, { recursive: true });
  let file = path.join(SAVE_DIR, `截圖_${stamp}.png`);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(SAVE_DIR, `截圖_${stamp}_${i}.png`);
  fs.writeFile(file, png, e => e && console.error('[capture] save failed', e));
}
let win = null, busy = false, shot = null, retryT = null, onChange = () => {}, shownAt = 0;
const status = {};  // accelerator -> true when registered

function makeWindow() {
  win = new BrowserWindow({
    show: false, frame: false, resizable: false, movable: false, minimizable: false,
    maximizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false,
    backgroundColor: '#000000',
    // backgroundThrottling off: a hidden window gets no animation frames, and the overlay must
    // be able to paint + report ready while still hidden
    webPreferences: { preload: path.join(__dirname, 'capture-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'capture.html'));
  // alt-tab away = cancel; but Windows focus-stealing protection can blur the overlay right as
  // it appears, so ignore blurs in the first 0.6 s
  win.on('blur', () => { if (busy && Date.now() - shownAt > 600) finish(); });
  win.on('closed', () => { win = null; });
}

async function start(mode) {
  if (busy) return;
  busy = true;
  try {
    if (!win || win.isDestroyed()) makeWindow();
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const sf = display.scaleFactor, { width, height } = display.bounds;
    const pw = Math.round(width * sf), ph = Math.round(height * sf);
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: pw, height: ph } });
    const src = sources.find(s => s.display_id === String(display.id)) || sources[0];
    if (!src) throw new Error('no screen source');
    shot = src.thumbnail;
    const size = shot.getSize();
    const cur = screen.getCursorScreenPoint();
    win.setBounds(display.bounds);
    // BGRA on Windows; the page swaps to RGBA
    win.webContents.send('cap:start', { mode, width: size.width, height: size.height, scale: size.width / width, pixels: shot.toBitmap(),
      cursor: { x: cur.x - display.bounds.x, y: cur.y - display.bounds.y } });
  } catch (e) {
    console.error('[capture]', e);
    finish();
  }
}

function finish() {
  shot = null; busy = false;
  if (win && !win.isDestroyed() && win.isVisible()) win.hide();
}

ipcMain.on('cap:ready', () => { if (busy && win) { shownAt = Date.now(); win.show(); win.moveTop(); win.focus(); } });
// Electron 44 clipboard is async (W3C style): writeText / write([ClipboardItem]) return promises.
ipcMain.on('cap:color', (_e, hex) => { clipboard.writeText(hex).catch(e => console.error('[capture]', e)); });
ipcMain.on('cap:region', (_e, r) => {
  if (!shot || !r || r.width <= 0 || r.height <= 0) return;
  const png = shot.crop(r).toPNG();
  clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })])
    .catch(e => console.error('[capture]', e));
  try { savePng(png); } catch (e) { console.error('[capture] save failed', e); }
});
ipcMain.on('cap:done', () => finish());

function register() {
  let missing = false, changed = false;
  for (const [acc, mode] of Object.entries(HOTKEYS)) {
    if (status[acc]) continue;
    status[acc] = globalShortcut.register(acc, () => start(mode));
    if (status[acc]) changed = true;
    if (!status[acc]) missing = true;
  }
  // Another program (e.g. PicPick) may still hold the key: keep trying until it lets go.
  if (changed) onChange();
  clearTimeout(retryT);
  if (missing) retryT = setTimeout(register, 10000);
}

function init(cb) {
  if (cb) onChange = cb;
  makeWindow();
  register();
}

module.exports = { init, start, status, HOTKEYS };
