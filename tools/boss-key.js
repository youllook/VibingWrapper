// 一鍵隱藏 (2026-10-01, user: 上班偷用時快速切回 — a boss key). One user-defined hotkey hides every 星圖
// window that is showing (the live wallpaper → the plain Windows wallpaper shows again, mood panel …; the
// HUD only shrinks to its small gear, and main.js removes the tray icon)
// and, if 收桌面 had hidden the desktop icons, brings them back — so the screen looks like an ordinary
// work desktop. The same key restores exactly what was showing. Gear menu: shows the key, 變更快捷鍵.
const { BrowserWindow, globalShortcut } = require('electron');

const DEFAULT_KEY = 'Control+Alt+B';
let key = DEFAULT_KEY, registered = false, hidden = false;
let shown = [], iconsWereHidden = false, icons = null, onChange = () => {}, keep = () => null;

async function toggle() {
  if (!hidden) {
    hidden = true;
    // the HUD stays (it shrinks to just its gear — the way back, user 2026-10-01: 保留設定小齒輪即可)
    const k = keep();
    shown = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && w.isVisible() && w !== k);
    for (const w of shown) w.hide();
    iconsWereHidden = !!icons && !icons.isVisible();
    if (iconsWereHidden) await icons.toggle();
  } else {
    hidden = false;
    for (const w of shown) if (!w.isDestroyed()) w.showInactive();
    shown = [];
    if (iconsWereHidden && icons && icons.isVisible()) await icons.toggle();
    iconsWereHidden = false;
  }
  onChange(status());
}

// try a new accelerator; on failure (taken / invalid) keep the old one working
function setKey(acc) {
  if (typeof acc !== 'string' || !acc) return { ok: false, ...status() };
  if (acc === key && registered) return { ok: true, ...status() };
  if (registered) globalShortcut.unregister(key);
  let ok = false;
  try { ok = globalShortcut.register(acc, toggle); } catch { ok = false; }
  if (ok) { key = acc; registered = true; }
  else { registered = false; try { registered = globalShortcut.register(key, toggle); } catch { registered = false; } }
  onChange(status());
  return { ok, ...status() };
}
// while the gear menu records a new key, the current one must not fire
function suspend(on) {
  if (on && registered) { globalShortcut.unregister(key); registered = false; }
  else if (!on && !registered) { try { registered = globalShortcut.register(key, toggle); } catch { registered = false; } }
}

function status() { return { key, registered, hidden }; }
function init(opts = {}) {
  icons = opts.icons || null;
  if (opts.onChange) onChange = opts.onChange;
  if (opts.keep) keep = opts.keep;
  key = opts.accelerator || DEFAULT_KEY;
  try { registered = globalShortcut.register(key, toggle); } catch { registered = false; }
}
// 'Control+Alt+B' → 'Ctrl+Alt+B' for menus
const pretty = acc => String(acc).replace('Control', 'Ctrl').replace('Super', 'Win');

module.exports = { init, toggle, setKey, suspend, status, pretty, DEFAULT_KEY };
