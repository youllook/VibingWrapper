// Minimal bridge between the HUD page and the desktop shell.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  // true while the pointer is over the HUD strip / open menu → the window takes mouse input
  setInteractive: on => ipcRenderer.send('pet:interactive', !!on),
  // the gear menu is open → main keeps the HUD above other windows meanwhile
  menuOpen: on => ipcRenderer.send('pet:menu-open', !!on),
  // tray menu → same single-letter commands as the keyboard (r, v, m, h, escape)
  // quit and start the whole app again (menu: 重新啟動)
  restart: () => ipcRenderer.send('pet:restart'),
  // 解除安裝: main asks for confirmation (native dialog), then removes the hooks and deletes our files after exit
  uninstall: () => ipcRenderer.send('pet:uninstall'),
  // AI state machine (Claude hooks → weather state): current value + live changes
  // wallpaper style = a theme folder id; the list comes from themes/*/theme.json
  getWallpaperStyle: () => ipcRenderer.invoke('pet:wallpaper-style'),
  getWallpaperStyles: () => ipcRenderer.invoke('pet:wallpaper-styles'),
  setWallpaperStyle: s => ipcRenderer.invoke('pet:set-wallpaper-style', s),
  // the last few themes picked (newest first), for the top of the 桌布 page
  recentThemes: () => ipcRenderer.invoke('pet:recent-themes'),
  // 主題庫: [{ id, name, size, status: builtin / installed / update / available, job }] or { error } (the menu
  // counts what is new); openStore(id) opens the library window (focused on that theme)
  themeCatalog: () => ipcRenderer.invoke('pet:theme-catalog'),
  openStore: id => ipcRenderer.send('pet:open-store', id),
  openHelp: () => ipcRenderer.send('pet:open-help'),          // 說明: the one-page guide
  version: () => ipcRenderer.invoke('pet:version'),           // app version: the tour shows what is new since the last one seen
  // 自動更新: { phase: idle / checking / latest / available / downloading / installing / error, current, version, got, total, canInstall, msg }
  updateState: () => ipcRenderer.invoke('pet:update-state'),
  updateCheck: () => ipcRenderer.invoke('pet:update-check'),
  updateInstall: () => ipcRenderer.invoke('pet:update-install'),
  setUpdateMode: m => ipcRenderer.invoke('pet:set-update-mode', m),   // 'auto' / 'manual'
  onUpdateState: fn => ipcRenderer.on('pet:update-state', (_e, s) => fn(s)),
  getTimeMode: () => ipcRenderer.invoke('pet:time-mode'),        // 模式: 'auto' (real clock) / 'day' / 'night'
  setTimeMode: mode => ipcRenderer.invoke('pet:set-time-mode', mode),
  // Debug 模式: the switch, and firing one hook by hand: 'start' / 'prompt' / 'tool' / 'wait' / 'stop' / 'end'
  getDebugMode: () => ipcRenderer.invoke('pet:debug-mode'),
  setDebugMode: on => ipcRenderer.invoke('pet:set-debug-mode', !!on),
  debugHook: kind => ipcRenderer.invoke('pet:debug-hook', kind),
  // 一鍵安裝 hook, agent = 'claude' (default) / 'codex': 'on' / 'partial' / 'off' / 'error' / 'none', and install → { ok, msg }
  hooksStatus: agent => ipcRenderer.invoke('pet:hooks-status', agent),
  installHooks: agent => ipcRenderer.invoke('pet:install-hooks', agent),
  // screen recording (gear menu): toggle + state { state: idle|starting|recording|stopping, startedAt, file, hotkey }
  toggleRecord: () => ipcRenderer.send('pet:record'),
  // Xbox Game Bar recording of the window the user was in (resolves with its title)
  gameBar: () => ipcRenderer.invoke('pet:gamebar'),
  getRecState: () => ipcRenderer.invoke('pet:rec-state'),
  onRecState: fn => ipcRenderer.on('pet:rec-state', (_e, s) => fn(s)),
  getAiState: () => ipcRenderer.invoke('pet:ai-state'),
  onAiState: fn => ipcRenderer.on('pet:ai-state', (_e, s) => fn(s)),
  // hide / show all desktop icons (also Ctrl+Alt+D and the tray menu)
  toggleIcons: () => ipcRenderer.invoke('pet:toggle-icons'),
  // true when Ctrl+Alt+D is ours (shown as a reminder next to 桌面圖示)
  iconsHotkey: () => ipcRenderer.invoke('pet:icons-hotkey'),
  // 老闆鍵 (boss key): toggle, current { key, registered, hidden }, record a new key
  bossToggle: () => ipcRenderer.send('pet:boss'),
  bossKey: () => ipcRenderer.invoke('pet:boss-key'),
  bossCapture: on => ipcRenderer.send('pet:boss-capture', !!on),
  setBossKey: acc => ipcRenderer.invoke('pet:set-boss-key', acc),
  // 範圍截圖: start one, its key { key, registered }, record a new key (same flow as the boss key)
  capture: () => ipcRenderer.send('pet:capture'),
  captureKey: () => ipcRenderer.invoke('pet:capture-key'),
  captureCapture: on => ipcRenderer.send('pet:capture-capture', !!on),
  setCaptureKey: acc => ipcRenderer.invoke('pet:set-capture-key', acc),
  onBossState: fn => ipcRenderer.on('pet:boss-state', (_e, s) => fn(s)),
  onCommand: fn => ipcRenderer.on('pet:command', (_e, key) => fn(key)),
});
