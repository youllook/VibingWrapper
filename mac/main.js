// macOS test shell (2026-10-20): just the wallpaper, no HUD. The Windows shell (main.js) parents its window
// under the desktop icons with PowerShell; on macOS Electron's `type: 'desktop'` window already sits at the
// desktop level (below the icons, on every Space). Theme picker + rotation live in the menu bar.
//   electron mac/main.js [--theme=<id>] [--rotate=<minutes>] [--shot=<file.png> [--shotDelay=<s>]]
const { app, BrowserWindow, Tray, Menu, nativeImage, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const bridge = require('../tools/claude-bridge');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const settingsFile = () => path.join(app.getPath('userData'), 'mac-settings.json');
let settings = { theme: 'weather', rotateMin: 0 };
let win = null, tray = null, rotateT = null;

function load() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch {}
  settings.theme = arg('theme', settings.theme);
  settings.rotateMin = Number(arg('rotate', settings.rotateMin)) || 0;
}
const save = () => { try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (e) { console.error(e.message); } };

function show(id) {
  const url = bridge.themeUrl(id) || (bridge.themes()[0] || {}).url;
  if (!url) return;
  settings.theme = id; save();
  if (win && !win.isDestroyed()) { win.loadURL(url); menu(); return; }
  win = new BrowserWindow({
    ...screen.getPrimaryDisplay().bounds, type: 'desktop', show: false, frame: false, resizable: false, movable: false,
    focusable: false, hasShadow: false, enableLargerThanScreen: true, backgroundColor: '#1b2230',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setIgnoreMouseEvents(true);
  win.setVisibleOnAllWorkspaces(true);
  win.loadURL(url);
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => { win = null; });
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') console.error(`[page:${e.level}]`, e.message);
  });
  win.webContents.on('did-fail-load', (_e, code, description, url) => console.error('[page:load-failed]', code, description, url));
  win.webContents.on('render-process-gone', (_e, d) => console.error('[page] gone', d.reason));
  // --shot=<file.png>: the page's own pixels a while after load, for checking over ssh (screencapture
  // without Screen Recording permission only sees the system wallpaper)
  const shot = arg('shot');
  if (shot) win.webContents.once('did-finish-load', () => setTimeout(async () => {
    try {
      fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
      console.log('[shot]', shot, win.getBounds(), win.isVisible());
      const diagnostics = await win.webContents.executeJavaScript(`({
        url: location.href,
        jellyfish: window.jellyfish ? {
          glbReady: window.jellyfish.glb.ready,
          glbTriangles: window.jellyfish.glb.tris,
          reefReady: window.jellyfish.reef.ready
        } : null
      })`);
      console.log('[shot:diagnostics]', JSON.stringify(diagnostics));
    }
    catch (e) { console.error('[shot]', e.message); }
  }, Number(arg('shotDelay', 12)) * 1000));
  menu();
}

function rotate() {
  clearInterval(rotateT);
  if (!settings.rotateMin) return;
  rotateT = setInterval(() => {
    const list = bridge.themes(), i = list.findIndex(t => t.id === settings.theme);
    show(list[(i + 1) % list.length].id);
  }, settings.rotateMin * 60000);
}

function menu() {
  if (!tray) return;
  const rot = m => ({ label: m ? `每 ${m} 分鐘` : '關', type: 'radio', checked: settings.rotateMin === m,
    click: () => { settings.rotateMin = m; save(); rotate(); menu(); } });
  tray.setContextMenu(Menu.buildFromTemplate([
    ...bridge.themes().map(t => ({ label: t.name, type: 'radio', checked: t.id === settings.theme, click: () => show(t.id) })),
    { type: 'separator' },
    { label: '自動輪播', submenu: [0, 1, 5, 15].map(rot) },
    { label: `狀態：${bridge.current()}`, enabled: false },
    { type: 'separator' },
    { label: '結束', click: () => app.quit() },
  ]));
}

app.whenReady().then(() => {
  load();
  if (app.dock) app.dock.hide();
  bridge.start({ stateDir: app.getPath('userData'), logDir: app.getPath('userData'), onState: () => menu() });
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('☁︎');
  show(settings.theme);
  rotate();
  screen.on('display-metrics-changed', () => win && !win.isDestroyed() && win.setBounds(screen.getPrimaryDisplay().bounds));
});
app.on('window-all-closed', e => e.preventDefault());
