// Recorder page ↔ main (tools/recorder.js)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rec', {
  onStart: fn => ipcRenderer.on('rec:start', () => fn()),
  onStop: fn => ipcRenderer.on('rec:stop', () => fn()),
  started: ext => ipcRenderer.send('rec:started', ext),
  chunk: buf => ipcRenderer.send('rec:chunk', buf),
  done: () => ipcRenderer.send('rec:done'),
  failed: msg => ipcRenderer.send('rec:failed', String(msg)),
});
