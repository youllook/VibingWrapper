// Minimal bridge between the ice page and the desktop shell.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  // true while the pointer is over the ice → the window takes mouse input
  setInteractive: on => ipcRenderer.send('pet:interactive', !!on),
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
  // 下載主題: [{ id, name, size, status: builtin / installed / update / available, progress }] or { error }
  themeCatalog: () => ipcRenderer.invoke('pet:theme-catalog'),
  installTheme: id => ipcRenderer.invoke('pet:install-theme', id),
  removeTheme: id => ipcRenderer.invoke('pet:remove-theme', id),
  onThemeProgress: fn => ipcRenderer.on('pet:theme-progress', (_e, p) => fn(p)),
  getTimeMode: () => ipcRenderer.invoke('pet:time-mode'),        // 模式: 'auto' (real clock) / 'day' / 'night'
  setTimeMode: mode => ipcRenderer.invoke('pet:set-time-mode', mode),
  // 一鍵安裝 hook, agent = 'claude' (default) / 'codex': 'on' / 'partial' / 'off' / 'error' / 'none', and install → { ok, msg }
  hooksStatus: agent => ipcRenderer.invoke('pet:hooks-status', agent),
  installHooks: agent => ipcRenderer.invoke('pet:install-hooks', agent),
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
  onBossState: fn => ipcRenderer.on('pet:boss-state', (_e, s) => fn(s)),
  onCommand: fn => ipcRenderer.on('pet:command', (_e, key) => fn(key)),
});
