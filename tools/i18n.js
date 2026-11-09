// Interface language (2026-11-06): Traditional Chinese is the source text; English is looked up from EN below.
// Shared by main (require) and the HUD / 主題庫 / 說明 pages (<script src>, language from ?lang=).
//   settings.lang: 'auto' (follow the system: zh* → 中文, anything else → English) / 'zh' / 'en'
//   T('更新到 {0}', v) → '更新到 0.3.0' or 'Update to 0.3.0'. A string missing from EN stays Chinese.
// Themes carry their own English in theme.json: name_en, description_en (tags go through EN like the rest).
(function (root) {
  const EN = {
    // HUD: AI state
    'AI 狀態': 'AI status', '待命': 'Idle', '思考中': 'Thinking', '執行中': 'Working', '收尾': 'Wrapping up', '等你': 'Waiting for you',
    // gear menu
    '設定': 'Settings', '桌布': 'Wallpaper', '模式': 'Mode', '預設': 'Auto', '日間': 'Day', '夜間': 'Night',
    '還原桌面': 'Plain desktop', '取消隱藏': 'Unhide', '桌面圖示': 'Desktop icons', '開': 'On', '關': 'Off', '有新版': 'New',
    '已安裝': 'Installed', '點此補齊': 'Click to repair', '點此安裝': 'Click to install', '設定檔有誤': 'Config file error',
    'Claude 連動': 'Connect Claude', 'Codex 連動': 'Connect Codex', '快捷鍵（點一下可改）': 'Shortcuts (click to change)',
    '更新': 'Update', '更新方式': 'Update mode', '自動': 'Auto', '手動': 'Manual', '說明': 'Help', 'Debug 模式': 'Debug mode',
    '重新啟動': 'Restart', '解除安裝': 'Uninstall', '語言': 'Language', '中文': '中文', 'English': 'English',
    '手動觸發 hook': 'Fire a hook by hand', '結束對話': 'End session',
    '最近用過': 'Recent', '全部': 'All', '沒有符合的桌布': 'No matching wallpaper', '主題庫…': 'Theme library…', '新 {0}': '{0} new',
    '搜尋桌布…': 'Search wallpapers…', '重新整理': 'Refresh',
    '檢查中…': 'Checking…', '已是最新 {0}': 'Up to date {0}', '下載中 {0}%': 'Downloading {0}%', '安裝中，馬上重開…': 'Installing, restarting…',
    '更新到 {0}': 'Update to {0}', '有新版 {0}': 'New version {0}', '檢查失敗': 'Check failed', '{0} · 檢查': '{0} · Check',
    '被占用': 'in use', '熱鍵被占用': 'Hotkey in use', '請按新組合…': 'Press the new keys…', '要加 Ctrl／Alt／Shift': 'Add Ctrl / Alt / Shift',
    '已更新': 'Updated', '被占用，沒換': 'In use, not changed',
    // tour
    '我在這裡：左邊是 Claude 的狀態，點齒輪看設定': "I'm up here: the icon shows what your AI is doing; the gear opens settings",
    '換桌布在這裡：最近用過的排最上面，其他主題到「主題庫」逛': 'Change wallpaper here: recent ones on top, more in the Theme library',
    '桌面圖示一鍵收起／放回，Ctrl+Alt+D 也行': 'Hide or show all desktop icons in one click, or press Ctrl+Alt+D',
    'Claude 連動、改快捷鍵、更新和說明，在「設定」': 'Connect Claude / Codex, shortcuts, updates and help live in Settings',
    '更新到 {0}：選單改版了，點齒輪看看': 'Updated to {0}: the menu changed, click the gear to see',
    '還有 {0} 個': '{0} more', '略過': 'Skip', '下一個': 'Next', '知道了': 'Got it',
    // tray
    '（{0} 被占用）': ' ({0} in use)', '動態桌布': 'Live wallpaper', '永遠在最上層': 'Always on top', '開機自動啟動': 'Start with Windows',
    'Claude hook 已安裝': 'Claude hook installed', '安裝 Claude hook': 'Install Claude hook',
    'Codex hook 已安裝': 'Codex hook installed', '安裝 Codex hook': 'Install Codex hook',
    '開啟除錯紀錄': 'Open debug log', '開發者工具': 'Developer tools', '重新載入': 'Reload', '解除安裝…': 'Uninstall…', '結束': 'Quit',
    '主題庫 · VibingWrapper': 'Theme library · VibingWrapper', '說明 · VibingWrapper': 'Help · VibingWrapper',
    // hooks
    '找不到設定資料夾': 'Config folder not found', '{0} 格式有誤': '{0} is not valid JSON', '寫入失敗': 'Could not write the file',
    '沒有安裝': 'Not installed', '已移除': 'Removed',
    '已安裝，重開 Claude Code': 'Installed: restart Claude Code', '已安裝，到 Codex 輸入 /hooks 信任': 'Installed: run /hooks in Codex to trust it',
    // updater / theme store (main side)
    '檢查失敗：{0}': 'Check failed: {0}', '下載失敗 {0}': 'Download failed {0}', '檔案大小不符，請重試': 'Size mismatch, please retry',
    '檔案校驗不符，請重試': 'Checksum mismatch, please retry', '壓縮檔裡找不到 VibingWrapper.exe': 'VibingWrapper.exe is missing from the zip',
    '讀不到主題清單（{0}）': 'Could not load the theme list ({0})', '正在安裝': 'Already installing', '清單裡沒有這個主題': 'Not in the theme list',
    '檔案太大': 'File too large', '不是下載的主題': 'Not a downloaded theme',
    // 主題庫 window
    '主題庫': 'Theme library', '搜尋名稱、說明…': 'Search name, description…', '讀取中…': 'Loading…',
    '可下載': 'Available', '有更新': 'Updates',
    '讀不到線上主題清單（{0}），先列出已安裝的': 'Could not load the online theme list ({0}); showing installed themes',
    '來源：{0} · {1} 個主題，{2} 個已安裝': 'Source: {0} · {1} themes, {2} installed', '，可下載 {0} 個共 {1}': ', {0} to download ({1})',
    '沒有符合的主題': 'No matching themes', '目前沒有主題': 'No themes yet', '還沒有預覽圖': 'No preview yet',
    '使用中': 'In use', '內建': 'Built-in', '移除「{0}」': 'Remove "{0}"', '安裝中…': 'Installing…',
    '更新 {0}？': 'Update ({0})?', '下載 {0}？': 'Download ({0})?', '確定': 'OK', '取消': 'Cancel',
    '點一下更新': 'Click to update', '點一下套用': 'Click to use', '點一下下載': 'Click to download',
    '已安裝並套用': 'Installed and applied', '已換成這個桌布': 'Wallpaper changed',
    '移除「{0}」？之後可以再從主題庫下載。': 'Remove "{0}"? You can download it again from the Theme library.',
    // theme tags
    '天空': 'Sky', '海': 'Sea', '夜景': 'Night', '鄉村': 'Countryside', '鐵道': 'Railway', '像素': 'Pixel', '風格實驗': 'Experimental',
    '山': 'Mountains', '簡約': 'Minimal',
    // uninstall dialog
    '解除安裝 VibingWrapper': 'Uninstall VibingWrapper', '要解除安裝 VibingWrapper 嗎？': 'Uninstall VibingWrapper?', '會做這些事：': 'This will:',
    '・從 Claude Code／Codex 設定移除 VibingWrapper 的 hook（其他設定不動）': '• remove the VibingWrapper hooks from Claude Code / Codex (nothing else is touched)',
    '・關閉開機自動啟動': '• turn off start with Windows', '・刪除設定與紀錄（{0}）': '• delete settings and logs ({0})',
    '・刪除程式檔案（{0}）': '• delete the program files ({0})', '・開發模式：不刪程式檔案': '• dev mode: program files are kept',
    '完成後程式會關閉。': 'The app closes when done.', '好': 'OK',
    '沒辦法移除 {0} hook，已停止解除安裝。': 'Could not remove the {0} hook, so uninstall stopped.',
    '{0}：{1}\n修好這個檔案後再試一次，或手動刪掉裡面含 127.0.0.1:47321 的 hook。': '{0}: {1}\nFix this file and try again, or delete the hooks containing 127.0.0.1:47321 by hand.',
    'hook 已移除，但沒辦法自動刪除檔案。': 'The hooks are removed, but the files could not be deleted automatically.',
    '程式關閉後，請手動刪除：\n{0}': 'After the app closes, please delete:\n{0}',
  };

  let lang = 'zh';
  const fmt = (s, args) => args.length ? s.replace(/\{(\d)\}/g, (m, i) => (args[i] !== undefined ? String(args[i]) : m)) : s;
  const T = (s, ...args) => fmt(lang === 'en' && Object.prototype.hasOwnProperty.call(EN, s) ? EN[s] : s, args);
  // setting + the system's locale(s) → 'zh' / 'en'
  const resolve = (setting, locales) => setting === 'zh' || setting === 'en' ? setting
    : [].concat(locales || []).some(l => /^zh/i.test(String(l))) ? 'zh' : 'en';
  const api = { en: EN, T, resolve, setLang: l => { lang = l === 'en' ? 'en' : 'zh'; }, lang: () => lang, has: s => Object.prototype.hasOwnProperty.call(EN, s) };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.I18N = api;
    try { api.setLang(new URLSearchParams(root.location.search).get('lang')); } catch (_) {}
    if (root.document) root.document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
  }
})(typeof window !== 'undefined' ? window : globalThis);
