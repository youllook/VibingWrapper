// 下載主題 window ↔ main (tools/store.html).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('storeAPI', {
  // { source, current, items: [{ id, name, description, size, status, job }] } or { error }
  catalog: fresh => ipcRenderer.invoke('store:catalog', !!fresh),
  install: id => ipcRenderer.invoke('store:install', id),       // → { ok, msg }
  remove: id => ipcRenderer.invoke('store:remove', id),
  use: id => ipcRenderer.invoke('store:use', id),               // → the wallpaper now in use
  onProgress: fn => ipcRenderer.on('store:progress', (_e, p) => fn(p)),
  onFocus: fn => ipcRenderer.on('store:focus', (_e, id) => fn(id)),
});
