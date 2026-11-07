// window.petAPI for the HUD under Tauri (2026-11-07): the same API preload.js gives it under Electron, so
// prototype/hud.html runs unchanged. Every call goes to the one Rust command `pet` with the old channel name.
(function () {
  const call = (name, arg) => window.__TAURI_INTERNALS__.invoke('pet', { name, arg: arg === undefined ? null : arg });
  const send = (name, arg) => { call(name, arg).catch(() => {}); };
  const on = (ev, fn) => {
    const go = () => window.__TAURI__.event.listen(ev, e => fn(e.payload));
    if (window.__TAURI__ && window.__TAURI__.event) go(); else addEventListener('DOMContentLoaded', go);
  };
  window.petAPI = {
    setInteractive: v => send('pet:interactive', !!v),
    menuOpen: v => send('pet:menu-open', !!v),
    restart: () => send('pet:restart'),
    uninstall: () => send('pet:uninstall'),
    getWallpaperStyle: () => call('pet:wallpaper-style'),
    getWallpaperStyles: () => call('pet:wallpaper-styles'),
    setWallpaperStyle: s => call('pet:set-wallpaper-style', s),
    recentThemes: () => call('pet:recent-themes'),
    themeCatalog: () => call('pet:theme-catalog'),
    openStore: id => send('pet:open-store', id),
    openHelp: () => send('pet:open-help'),
    version: () => call('pet:version'),
    updateState: () => call('pet:update-state'),
    updateCheck: () => call('pet:update-check'),
    updateInstall: () => call('pet:update-install'),
    setUpdateMode: m => call('pet:set-update-mode', m),
    onUpdateState: fn => on('pet:update-state', fn),
    getTimeMode: () => call('pet:time-mode'),
    setTimeMode: m => call('pet:set-time-mode', m),
    getDebugMode: () => call('pet:debug-mode'),
    setDebugMode: v => call('pet:set-debug-mode', !!v),
    debugHook: k => call('pet:debug-hook', k),
    hooksStatus: a => call('pet:hooks-status', a),
    installHooks: a => call('pet:install-hooks', a),
    getAiState: () => call('pet:ai-state'),
    onAiState: fn => on('pet:ai-state', fn),
    toggleIcons: () => call('pet:toggle-icons'),
    iconsVisible: () => call('pet:icons-visible'),
    iconsHotkey: () => call('pet:icons-hotkey'),
    bossToggle: () => send('pet:boss'),
    bossKey: () => call('pet:boss-key'),
    bossCapture: v => send('pet:boss-capture', !!v),
    setBossKey: acc => call('pet:set-boss-key', acc),
    onBossState: fn => on('pet:boss-state', fn),
    getLang: () => call('pet:lang'),
    setLang: l => call('pet:set-lang', l),
    onCommand: fn => on('pet:command', fn),
  };
  // Electron forwarded mouse moves to a click-through window; Tauri cannot, so the shell sends the cursor
  // position while it is over us, replayed as a mousemove so the HUD's own .ui-hit test (prototype/hud.html)
  // runs and keeps its idea of "interactive" in step
  on('vw:cursor', p => document.dispatchEvent(new MouseEvent('mousemove', { clientX: p.x, clientY: p.y })));
})();
