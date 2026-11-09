// Every shell page reads its language (and the help page its version) from ?lang= / ?v= (tools/i18n.js).
// Tauri loads them from the embedded files, so the shell sets the query here, before the page's own scripts run.
(function () {
  try {
    const q = new URLSearchParams(location.search);
    let changed = false;
    if (window.__VW_LANG && q.get('lang') !== window.__VW_LANG) { q.set('lang', window.__VW_LANG); changed = true; }
    if (window.__VW_VERSION && q.get('v') !== window.__VW_VERSION) { q.set('v', window.__VW_VERSION); changed = true; }
    if (changed) history.replaceState(null, '', location.pathname + '?' + q);
  } catch (_) {}
})();
