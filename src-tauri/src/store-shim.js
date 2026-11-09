// window.storeAPI for the theme library (tools/store.html) under Tauri (2026-11-07): the same API
// tools/store-preload.js gives it under Electron. Calls go to the Rust command `pet` with the old channel names.
(function () {
  const call = (name, arg) => window.__TAURI_INTERNALS__.invoke('pet', { name, arg: arg === undefined ? null : arg });
  const on = (ev, fn) => {
    const go = () => window.__TAURI__.event.listen(ev, e => fn(e.payload));
    if (window.__TAURI__ && window.__TAURI__.event) go(); else addEventListener('DOMContentLoaded', go);
  };
  window.storeAPI = {
    catalog: fresh => call('store:catalog', !!fresh),
    install: id => call('store:install', id),
    remove: id => call('store:remove', id),
    use: id => call('store:use', id),
    onProgress: fn => on('store:progress', fn),
    // opened from a theme (gear menu): the window starts focused on it
    onFocus: fn => { on('store:focus', fn); if (window.__VW_FOCUS) setTimeout(() => fn(window.__VW_FOCUS), 0); },
  };
})();
