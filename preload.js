// Minimal bridge between the ice page and the desktop shell.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  // true while the pointer is over the ice → the window takes mouse input
  setInteractive: on => ipcRenderer.send('pet:interactive', !!on),
  // tray menu → same single-letter commands as the keyboard (r, v, m, h, escape)
  // quit and start the whole app again (menu: 重新啟動)
  restart: () => ipcRenderer.send('pet:restart'),
  // AI state machine (Claude hooks → weather state): current value + live changes
  // wallpaper style: 'weather' | 'sea' | 'ocean'
  getWallpaperStyle: () => ipcRenderer.invoke('pet:wallpaper-style'),
  setWallpaperStyle: s => ipcRenderer.invoke('pet:set-wallpaper-style', s),
  getAiState: () => ipcRenderer.invoke('pet:ai-state'),
  onAiState: fn => ipcRenderer.on('pet:ai-state', (_e, s) => fn(s)),
  // hide / show all desktop icons (also Ctrl+Alt+D and the tray menu)
  toggleIcons: () => ipcRenderer.invoke('pet:toggle-icons'),
  // true when Ctrl+Alt+D is ours (shown as a reminder next to 桌面圖示)
  iconsHotkey: () => ipcRenderer.invoke('pet:icons-hotkey'),
  // 一鍵隱藏 (boss key): toggle, current { key, registered, hidden }, record a new key
  bossToggle: () => ipcRenderer.send('pet:boss'),
  bossKey: () => ipcRenderer.invoke('pet:boss-key'),
  bossCapture: on => ipcRenderer.send('pet:boss-capture', !!on),
  setBossKey: acc => ipcRenderer.invoke('pet:set-boss-key', acc),
  onBossState: fn => ipcRenderer.on('pet:boss-state', (_e, s) => fn(s)),
  onCommand: fn => ipcRenderer.on('pet:command', (_e, key) => fn(key)),
});
