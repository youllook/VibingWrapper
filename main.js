// Desktop shell: a small transparent, frameless HUD in the top-right corner of the primary screen.
// Only the HUD strip and its open menu take mouse input; everything else clicks through.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const capture = require('./tools/capture');           // Ctrl+Alt+S region capture (PicPick replacement)
const claudeBridge = require('./tools/claude-bridge'); // Claude Code hooks → themes/state.json (+ serves themes/)
const recorder = require('./tools/recorder');        // gear menu / tray → screen recording → Videos
const wallpaper = require('./tools/wallpaper');       // weather wallpaper behind the desktop icons (replaces Lively)
const desktopIcons = require('./tools/desktop-icons'); // Ctrl+Alt+D hides / shows all desktop icons (收桌面); also tray + gear menu
const bossKey = require('./tools/boss-key');           // 老闆鍵: user-defined hotkey hides every VibingWrapper window (boss key)
const claudeHooks = require('./tools/claude-hooks');   // 一鍵安裝 Claude hook → ~/.claude/settings.json
const codexHooks = require('./tools/codex-hooks');     // 一鍵安裝 Codex hook → ~/.codex/hooks.json
const AGENT_HOOKS = { claude: claudeHooks, codex: codexHooks };
const agentHooks = a => AGENT_HOOKS[a] || claudeHooks;
const uninstall = require('./tools/uninstall');         // 解除安裝: hooks out, settings + program files deleted after exit
const themeStore = require('./tools/theme-store');     // 下載主題: theme packs from GitHub Releases → userData/themes/

// a dev copy can run beside the installed app: its own profile (and VIBINGWRAPPER_PORT for the bridge)
if (process.env.VIBINGWRAPPER_PROFILE) app.setPath('userData', process.env.VIBINGWRAPPER_PROFILE);

// a second copy only hands its arguments to the first (second-instance below) and leaves; it must not run
// whenReady itself, or --uninstall would ask twice (seen 2026-10-16)
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
// 2026-10-01: render on the high-performance GPU (RTX 2060 SUPER). Chromium picked the Intel UHD 630 that
// drives the screen, and the ocean wallpaper alone kept it ~47% busy.
app.commandLine.appendSwitch('force_high_performance_gpu');

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
// first-run wallpaper: the lite build (scripts/dist-lite.js) sets vibingwrapper.defaultTheme in package.json
const DEFAULT_STYLE = (require('./package.json').vibingwrapper || {}).defaultTheme || 'weather';
function loadSettings() {
  const defaults = { alwaysOnTop: false, weatherWallpaper: true, wallpaperStyle: DEFAULT_STYLE };
  try { return { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; }
  catch { return defaults; }
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (e) { console.error(e); }
}

let win = null, tray = null, settings = null;
// During quit/relaunch the window is destroyed while the page may still send IPC.
const alive = () => win && !win.isDestroyed();

// 2026-10-01: the pet is a small HUD (AI state icon + settings) in the top-right corner.
const PAGE = 'hud.html';
const HUD_W = 280, HUD_H = 520;   // HUD_H leaves room for the settings menu (and its 桌布 / 下載主題 lists) to open downwards
function petBounds() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - HUD_W, y: wa.y, width: HUD_W, height: HUD_H };
}

function createWindow() {
  win = new BrowserWindow({
    ...petBounds(),
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    // no `resizable: false`: on Electron 44 / Windows it turns this transparent window into an opaque white
    // box (2026-10-21). Frameless with no resize border, so nothing can drag its size anyway.
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: settings.alwaysOnTop,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'prototype', PAGE));
  // a fresh page starts click-through again (a reload mid-hover used to leave the strip holding the mouse)
  win.webContents.on('did-finish-load', () => { if (alive()) { win.setIgnoreMouseEvents(true, { forward: true }); menuOnTop(false); } });
  win.once('ready-to-show', () => win.showInactive());
  // keep external links / new windows out of the pet
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('closed', () => { win = null; });
}

// the gear menu opens downwards over other windows: lift the HUD above them while it is open (2026-10-21)
function menuOnTop(open) {
  if (!alive()) return;
  if (open) { win.setAlwaysOnTop(true, 'pop-up-menu'); win.moveTop(); }
  else win.setAlwaysOnTop(!!settings.alwaysOnTop);
}
ipcMain.on('pet:menu-open', (_e, open) => menuOnTop(!!open));
ipcMain.on('pet:interactive', (_e, on) => {
  if (!alive()) return;
  if (on) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
});

// wallpaper style (gear menu) = a theme folder id under themes/ (2026-10-01; see themes/README.md)
// 模式 (settings.timeMode): 'auto' follows the real clock; 'day' adds ?day=1 (late morning), 'night' adds ?night=1 (22:00)
const TIME_MODES = ['auto', 'day', 'night'];
const timeMode = () => TIME_MODES.includes(settings.timeMode) ? settings.timeMode : (settings.dayMode ? 'day' : 'auto');   // dayMode: the old on/off switch
const wallpaperUrl = () => {
  const u = claudeBridge.themeUrl(settings.wallpaperStyle) || (claudeBridge.themes()[0] || {}).url;
  const m = timeMode();
  return u && m !== 'auto' ? u + (u.includes('?') ? '&' : '?') + m + '=1' : u;
};
ipcMain.handle('pet:wallpaper-style', () => settings.wallpaperStyle);
ipcMain.handle('pet:wallpaper-styles', () => claudeBridge.themes().map(t => ({ id: t.id, name: t.name })));
function setWallpaperStyle(style) {
  if (!claudeBridge.themeUrl(style)) return settings.wallpaperStyle;
  settings.wallpaperStyle = style; saveSettings();
  wallpaper.setEnabled(settings.weatherWallpaper, wallpaperUrl());
  buildTrayMenu();                                      // keep the tray's radio list in step
  return style;
}
ipcMain.handle('pet:set-wallpaper-style', (_e, style) => setWallpaperStyle(style));
// 下載主題: the HUD menu lists the packs (with sizes); downloading happens in its own window (tools/store.html)
let storeWin = null;
function openStore(focusId) {
  if (storeWin && !storeWin.isDestroyed()) { storeWin.show(); storeWin.focus(); storeWin.webContents.send('store:focus', focusId || null); return; }
  storeWin = new BrowserWindow({ width: 560, height: 680, minWidth: 420, minHeight: 360, title: '下載主題 · VibingWrapper', autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.ico'), backgroundColor: '#eef3f8', show: false,
    webPreferences: { preload: path.join(__dirname, 'tools', 'store-preload.js'), contextIsolation: true, nodeIntegration: false } });
  storeWin.loadFile(path.join(__dirname, 'tools', 'store.html'));
  storeWin.once('ready-to-show', () => { storeWin.show(); if (focusId) storeWin.webContents.send('store:focus', focusId); });
  storeWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  storeWin.webContents.on('will-navigate', e => e.preventDefault());
  storeWin.on('closed', () => { storeWin = null; });
}
const storeList = fresh => themeStore.list(claudeBridge.themes(), fresh);
ipcMain.handle('pet:theme-catalog', () => storeList().catch(e => ({ error: String(e.message || e) })));
ipcMain.on('pet:open-store', (_e, id) => openStore(typeof id === 'string' ? id : null));
ipcMain.handle('store:catalog', (_e, fresh) => storeList(fresh).then(items => ({ items, source: themeStore.sourceLabel(), current: settings.wallpaperStyle }))
  .catch(e => ({ error: String(e.message || e) })));
ipcMain.handle('store:install', async (_e, id) => {
  const send = p => { if (storeWin && !storeWin.isDestroyed()) storeWin.webContents.send('store:progress', p); };
  const r = await themeStore.install(String(id), send);
  if (r.ok) buildTrayMenu();
  return r;
});
ipcMain.handle('store:remove', (_e, id) => {
  const r = themeStore.remove(String(id));
  if (r.ok && settings.wallpaperStyle === id) wallpaper.setEnabled(settings.weatherWallpaper, wallpaperUrl());   // falls back if it is gone
  buildTrayMenu();
  return r;
});
ipcMain.handle('store:use', (_e, id) => setWallpaperStyle(String(id)));
ipcMain.handle('pet:time-mode', () => timeMode());
ipcMain.handle('pet:set-time-mode', (_e, mode) => {
  if (!TIME_MODES.includes(mode)) return timeMode();
  settings.timeMode = mode; delete settings.dayMode; saveSettings();
  wallpaper.setEnabled(settings.weatherWallpaper, wallpaperUrl());
  return mode;
});
ipcMain.on('pet:record', () => recorder.toggle());
ipcMain.handle('pet:gamebar', () => recorder.gameBar());
ipcMain.handle('pet:rec-state', () => recorder.status());
ipcMain.handle('pet:ai-state', () => claudeBridge.current());   // AI category asks once on load
ipcMain.handle('pet:icons-hotkey', () => desktopIcons.status.hotkey);
ipcMain.handle('pet:toggle-icons', () => desktopIcons.toggle());
// 老闆鍵 (boss key): the key lives in settings.json `bossKey`
ipcMain.on('pet:boss', () => bossKey.toggle());
ipcMain.handle('pet:boss-key', () => bossKey.status());
ipcMain.on('pet:boss-capture', (_e, on) => bossKey.suspend(!!on));
// 範圍截圖 key (gear menu, under 螢幕錄影): settings.json `captureKey`
ipcMain.handle('pet:capture-key', () => capture.status());
ipcMain.on('pet:capture-capture', (_e, on) => capture.suspend(!!on));
ipcMain.handle('pet:set-capture-key', (_e, acc) => {
  const r = capture.setKey(acc);
  if (r.ok) { settings.captureKey = r.key; saveSettings(); }
  return r;
});
ipcMain.on('pet:capture', () => capture.start('region'));
ipcMain.handle('pet:set-boss-key', (_e, acc) => {
  const r = bossKey.setKey(acc);
  if (r.ok) { settings.bossKey = r.key; saveSettings(); }
  return r;
});
ipcMain.handle('pet:hooks-status', (_e, agent) => agentHooks(agent).status());
ipcMain.handle('pet:install-hooks', (_e, agent) => { const r = agentHooks(agent).install(); buildTrayMenu(); return r; });
ipcMain.on('pet:restart', () => { app.relaunch(); app.exit(0); });
const runUninstall = () => uninstall.run({ claudeHooks, codexHooks, desktopIcons, loginItemArgs });
ipcMain.on('pet:uninstall', runUninstall);

// 32×32 tray icon drawn in code (an ice-blue diamond), so no image file is needed.
function makeTrayIcon() {
  const S = 32, buf = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.abs(x - 15.5) / 11 + Math.abs(y - 15.5) / 15;
    const i = (y * S + x) * 4;
    if (d <= 1) {
      const lit = x + y < 30 ? 1 : 0.75;              // brighter top-left facet
      buf[i] = 255 * lit; buf[i + 1] = 225 * lit; buf[i + 2] = 170 * lit;  // BGRA
      buf[i + 3] = d > 0.9 ? 255 : 220;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: S, height: S });
}

function loginItemArgs() {
  // In dev (`electron .`) the login item must pass the app folder to electron.exe.
  // Forward slashes: setLoginItemSettings drops backslashes from args ("E:\DesktopPet" → "E:DesktopPet").
  return app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath().replace(/\\/g, '/')] };
}

// 2026-09-30: StarWeather logo (Codex) for the tray; the drawn ice diamond stays as a fallback
function makeTray() {
  const logo = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.ico'));
  tray = new Tray(logo.isEmpty() ? makeTrayIcon() : logo);
  tray.setToolTip(recorder.status().state === 'recording' ? 'VibingWrapper · 錄影中' : 'VibingWrapper');
  buildTrayMenu();
}

function buildTrayMenu() {
  if (!tray || tray.isDestroyed()) return;              // no tray while 老闆鍵 is on
  const openAtLogin = app.getLoginItemSettings(loginItemArgs()).openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '範圍截圖' + (capture.status().registered ? '\t' : '（') + bossKey.pretty(capture.status().key) + (capture.status().registered ? '' : ' 被占用）'), click: () => capture.start('region') },
    { label: (recorder.status().state === 'idle' ? '螢幕錄影' : '停止錄影') + (recorder.status().hotkey ? '\tCtrl+Alt+R' : '（Ctrl+Alt+R 被占用）'), click: () => recorder.toggle() },
    { label: '錄目前視窗（Game Bar）\tWin+Alt+R', click: () => recorder.gameBar() },
    { label: '桌面圖示' + (desktopIcons.status.hotkey ? '\tCtrl+Alt+D' : '（Ctrl+Alt+D 被占用）'), click: () => desktopIcons.toggle() },
    { label: (bossKey.status().hidden ? '取消隱藏' : '還原桌面') + (bossKey.status().registered ? '\t' : '（') + bossKey.pretty(bossKey.status().key) + (bossKey.status().registered ? '' : ' 被占用）'), click: () => bossKey.toggle() },
    { type: 'separator' },
    {
      label: '動態桌布', type: 'checkbox', checked: settings.weatherWallpaper,
      click: item => { settings.weatherWallpaper = item.checked; wallpaper.setEnabled(item.checked, wallpaperUrl()); saveSettings(); },
    },
    // 桌布: pick one directly (2026-10-14; the gear menu used to only cycle to the next theme)
    { label: '桌布', submenu: claudeBridge.themes().map(t => ({ label: t.name, type: 'radio', checked: t.id === settings.wallpaperStyle, click: () => setWallpaperStyle(t.id) })) },
    {
      label: '永遠在最上層', type: 'checkbox', checked: settings.alwaysOnTop,
      click: item => { settings.alwaysOnTop = item.checked; win.setAlwaysOnTop(item.checked); saveSettings(); },
    },
    {
      label: '開機自動啟動', type: 'checkbox', checked: openAtLogin,
      click: item => { app.setLoginItemSettings({ openAtLogin: item.checked, ...loginItemArgs() }); buildTrayMenu(); },
    },
    { label: claudeHooks.status() === 'on' ? 'Claude hook 已安裝' : '安裝 Claude hook', enabled: claudeHooks.status() !== 'on', click: () => { claudeHooks.install(); buildTrayMenu(); } },
    ...(codexHooks.status() === 'none' ? [] : [{ label: codexHooks.status() === 'on' ? 'Codex hook 已安裝' : '安裝 Codex hook', enabled: codexHooks.status() !== 'on', click: () => { codexHooks.install(); buildTrayMenu(); } }]),
    { type: 'separator' },
    { label: '下載主題…', click: () => openStore() },
    { type: 'separator' },
    { label: '開發者工具', click: () => win.webContents.openDevTools({ mode: 'detach' }) },
    { label: '重新載入', click: () => win.reload() },
    { type: 'separator' },
    { label: '重新啟動', click: () => { app.relaunch(); app.exit(0); } },
    { label: '解除安裝…', click: runUninstall },
    { label: '結束', click: () => app.quit() },
  ]));
}

app.whenReady().then(() => {
  if (!primary) return;
  // no application menu: its default accelerators (Ctrl+R reload, Ctrl+Shift+I, Ctrl+W …) hit whichever of our
  // windows has focus — Ctrl+R reloaded the HUD mid-hover and left it stuck, grey gear (2026-10-21)
  Menu.setApplicationMenu(null);
  // Windows 設定 →「已安裝的應用程式」→ 解除安裝 starts VibingWrapper.exe --uninstall: only the uninstall dialog
  if (process.argv.includes('--uninstall')) { runUninstall().then(done => { if (!done) app.quit(); }); return; }
  uninstall.register();
  settings = loadSettings();
  createWindow();
  makeTray();
  capture.init(buildTrayMenu, settings.captureKey);
  recorder.init(st => {                                 // keep tray + gear menu in step with the recorder
    buildTrayMenu();
    if (tray && !tray.isDestroyed()) tray.setToolTip(st.state === 'recording' ? 'VibingWrapper · 錄影中' : 'VibingWrapper');
    if (alive()) win.webContents.send('pet:rec-state', st);
  });   // menu is rebuilt when a hotkey gets registered
  claudeBridge.start({ logDir: app.getPath('userData'), stateDir: app.getPath('userData'), themeDirs: [themeStore.init(app.getPath('userData'), settings.themeStore)],
    version: app.getVersion(), onState: s => alive() && win.webContents.send('pet:ai-state', s) });   // → %APPDATA%\vibing-wrapper\weather-log.jsonl
  wallpaper.setEnabled(settings.weatherWallpaper, wallpaperUrl());
  desktopIcons.init(buildTrayMenu);
  // 老闆鍵: everything goes except the HUD, which shrinks to its gear (the way back); the tray icon goes too
  bossKey.init({
    accelerator: settings.bossKey, icons: desktopIcons, keep: () => (alive() ? win : null),
    onChange: st => {
      if (st.hidden && tray && !tray.isDestroyed()) { tray.destroy(); tray = null; }
      if (!st.hidden && !tray) makeTray();
      buildTrayMenu();
      if (alive()) win.webContents.send('pet:boss-state', st);
    },
  });
  // pause the wallpaper while a maximized / full-screen window hides the whole desktop (2026-10-01)
  setInterval(async () => { if (settings.weatherWallpaper) wallpaper.setPaused(await desktopIcons.covered()); }, 700);
  const reposition = () => alive() && win.setBounds(petBounds());
  screen.on('display-metrics-changed', () => { reposition(); wallpaper.reattach(); });
  screen.on('display-added', reposition);
  screen.on('display-removed', reposition);
});

app.on('second-instance', (_e, argv) => { if (argv.includes('--uninstall')) runUninstall(); else if (alive()) win.showInactive(); });
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { globalShortcut.unregisterAll(); desktopIcons.stop(); });
