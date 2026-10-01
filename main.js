// Desktop shell: a transparent, frameless window covering the right third of the
// primary screen. Only the ice shards take mouse input; everything else clicks through.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const capture = require('./tools/capture');           // Ctrl+Q eyedropper / Ctrl+R region capture (PicPick replacement)
const claudeBridge = require('./tools/claude-bridge'); // Claude Code hooks → themes/state.json (+ serves themes/)
const wallpaper = require('./tools/wallpaper');       // weather wallpaper behind the desktop icons (replaces Lively)
const desktopIcons = require('./tools/desktop-icons'); // Ctrl+Alt+D hides / shows all desktop icons (收桌面); also tray + gear menu
const bossKey = require('./tools/boss-key');           // 一鍵隱藏: user-defined hotkey hides every 星圖 window (boss key)

if (!app.requestSingleInstanceLock()) app.quit();
// 2026-10-01: render on the high-performance GPU (RTX 2060 SUPER). Chromium picked the Intel UHD 630 that
// drives the screen, and the ocean wallpaper alone kept it ~47% busy.
app.commandLine.appendSwitch('force_high_performance_gpu');

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return { alwaysOnTop: false, weatherWallpaper: true, wallpaperStyle: 'weather', ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; }
  catch { return { alwaysOnTop: false, weatherWallpaper: true, wallpaperStyle: 'weather' }; }
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (e) { console.error(e); }
}

let win = null, tray = null, settings = null;
// During quit/relaunch the window is destroyed while the page may still send IPC.
const alive = () => win && !win.isDestroyed();

// 2026-10-01: the pet is a small HUD (AI state icon + settings) in the top-right corner, where the
// category map used to be (the 比例生活 star-chart page is not part of the public repo).
const PAGE = 'hud.html';
const HUD_W = 280, HUD_H = 380;   // HUD_H leaves room for the settings menu to open downwards
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
    resizable: false,
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
  win.once('ready-to-show', () => win.showInactive());
  // keep external links / new windows out of the pet
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('closed', () => { win = null; });
}

ipcMain.on('pet:interactive', (_e, on) => {
  if (!alive()) return;
  if (on) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
});

// wallpaper style (gear menu) = a theme folder id under themes/ (2026-10-01; see themes/README.md)
const wallpaperUrl = () => claudeBridge.themeUrl(settings.wallpaperStyle) || (claudeBridge.themes()[0] || {}).url;
ipcMain.handle('pet:wallpaper-style', () => settings.wallpaperStyle);
ipcMain.handle('pet:wallpaper-styles', () => claudeBridge.themes().map(t => ({ id: t.id, name: t.name })));
ipcMain.handle('pet:set-wallpaper-style', (_e, style) => {
  if (!claudeBridge.themeUrl(style)) return settings.wallpaperStyle;
  settings.wallpaperStyle = style; saveSettings();
  wallpaper.setEnabled(settings.weatherWallpaper, wallpaperUrl());
  return style;
});
ipcMain.handle('pet:ai-state', () => claudeBridge.current());   // AI category asks once on load
ipcMain.handle('pet:icons-hotkey', () => desktopIcons.status.hotkey);
ipcMain.handle('pet:toggle-icons', () => desktopIcons.toggle());
// 一鍵隱藏 (boss key): the key lives in settings.json `bossKey`
ipcMain.on('pet:boss', () => bossKey.toggle());
ipcMain.handle('pet:boss-key', () => bossKey.status());
ipcMain.on('pet:boss-capture', (_e, on) => bossKey.suspend(!!on));
ipcMain.handle('pet:set-boss-key', (_e, acc) => {
  const r = bossKey.setKey(acc);
  if (r.ok) { settings.bossKey = r.key; saveSettings(); }
  return r;
});
ipcMain.on('pet:restart', () => { app.relaunch(); app.exit(0); });

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

// 2026-09-30: StarWeather logo (Codex) for 星圖 too; the drawn ice diamond stays as a fallback
function makeTray() {
  const logo = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.ico'));
  tray = new Tray(logo.isEmpty() ? makeTrayIcon() : logo);
  tray.setToolTip('VibingWrapper');
  buildTrayMenu();
}

function buildTrayMenu() {
  if (!tray || tray.isDestroyed()) return;              // no tray while 一鍵隱藏 is on
  const openAtLogin = app.getLoginItemSettings(loginItemArgs()).openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '螢幕吸色' + (capture.status['Control+Q'] ? '\tCtrl+Q' : '（Ctrl+Q 被占用）'), click: () => capture.start('color') },
    { label: '範圍截圖' + (capture.status['Control+R'] ? '\tCtrl+R' : '（Ctrl+R 被占用）'), click: () => capture.start('region') },
    { label: '桌面圖示' + (desktopIcons.status.hotkey ? '\tCtrl+Alt+D' : '（Ctrl+Alt+D 被占用）'), click: () => desktopIcons.toggle() },
    { label: (bossKey.status().hidden ? '取消隱藏' : '一鍵隱藏') + (bossKey.status().registered ? '\t' : '（') + bossKey.pretty(bossKey.status().key) + (bossKey.status().registered ? '' : ' 被占用）'), click: () => bossKey.toggle() },
    { type: 'separator' },
    {
      label: '動態桌布', type: 'checkbox', checked: settings.weatherWallpaper,
      click: item => { settings.weatherWallpaper = item.checked; wallpaper.setEnabled(item.checked, wallpaperUrl()); saveSettings(); },
    },
    {
      label: '永遠在最上層', type: 'checkbox', checked: settings.alwaysOnTop,
      click: item => { settings.alwaysOnTop = item.checked; win.setAlwaysOnTop(item.checked); saveSettings(); },
    },
    {
      label: '開機自動啟動', type: 'checkbox', checked: openAtLogin,
      click: item => { app.setLoginItemSettings({ openAtLogin: item.checked, ...loginItemArgs() }); buildTrayMenu(); },
    },
    { type: 'separator' },
    { label: '開發者工具', click: () => win.webContents.openDevTools({ mode: 'detach' }) },
    { label: '重新載入', click: () => win.reload() },
    { type: 'separator' },
    { label: '重新啟動', click: () => { app.relaunch(); app.exit(0); } },
    { label: '結束', click: () => app.quit() },
  ]));
}

app.whenReady().then(() => {
  settings = loadSettings();
  createWindow();
  makeTray();
  capture.init(buildTrayMenu);
  claudeBridge.start({ logDir: app.getPath('userData'), onState: s => alive() && win.webContents.send('pet:ai-state', s) });   // → %APPDATA%\vibing-wrapper\weather-log.jsonl
  wallpaper.setEnabled(settings.weatherWallpaper, wallpaperUrl());
  desktopIcons.init(buildTrayMenu);
  // 一鍵隱藏: everything goes except the HUD, which shrinks to its gear (the way back); the tray icon goes too
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

app.on('second-instance', () => { if (alive()) win.showInactive(); });
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { globalShortcut.unregisterAll(); desktopIcons.stop(); });
