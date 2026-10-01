// Bridge for the screen-tools overlay (capture.html).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('capAPI', {
  onStart: fn => ipcRenderer.on('cap:start', (_e, job) => fn(job)),
  ready: () => ipcRenderer.send('cap:ready'),
  color: hex => ipcRenderer.send('cap:color', hex),
  region: rect => ipcRenderer.send('cap:region', rect),
  done: () => ipcRenderer.send('cap:done'),
});
