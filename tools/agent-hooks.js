// One-click hook install, shared by every agent (2026-10-20; split out of claude-hooks.js). Claude Code
// (~/.claude/settings.json) and Codex (~/.codex/hooks.json) both keep { hooks: { Event: [ { hooks: [handler] } ] } },
// so one merger serves both: only adds what is missing (one group per event), keeps everything else (other
// tools' hooks included), backs the old file up once (<file>.vibing-backup). uninstall() takes ours back out.
// A group is "ours" when its command calls our URL.
const fs = require('fs');
const path = require('path');

// opts: { file, url, events, handler: () => object, needDir?: dir that must exist (the agent is installed),
//         okMsg: shown after a fresh install }
function agentHooks({ file, url, events, handler, needDir, okMsg }) {
  const ours = groups => Array.isArray(groups) && groups.some(g => g && Array.isArray(g.hooks) && g.hooks.some(h => h && typeof h.command === 'string' && h.command.includes(url)));
  const read = () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};   // throws on a broken file → we leave it alone
  const missing = () => needDir && !fs.existsSync(needDir);

  // 'on' = every event wired, 'partial', 'off', 'error' (file is not valid JSON), 'none' (agent not installed)
  function status() {
    if (missing()) return 'none';
    let s; try { s = read(); } catch { return 'error'; }
    const n = events.filter(e => ours(s.hooks && s.hooks[e])).length;
    return n === events.length ? 'on' : n ? 'partial' : 'off';
  }

  function install() {
    if (missing()) return { ok: false, msg: '找不到設定資料夾' };
    let s; try { s = read(); } catch { return { ok: false, msg: `${path.basename(file)} 格式有誤` }; }
    if (!s.hooks || typeof s.hooks !== 'object') s.hooks = {};
    let added = 0;
    for (const e of events) {
      if (ours(s.hooks[e])) continue;
      if (!Array.isArray(s.hooks[e])) s.hooks[e] = [];
      s.hooks[e].push({ hooks: [handler()] });
      added++;
    }
    if (!added) return { ok: true, msg: '已安裝' };
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const bak = file + '.vibing-backup';
      if (fs.existsSync(file) && !fs.existsSync(bak)) fs.copyFileSync(file, bak);
      fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
    } catch { return { ok: false, msg: '寫入失敗' }; }
    return { ok: true, msg: okMsg };
  }

  // takes out only the groups that call our URL; other hooks and settings stay. An event left with no groups
  // is dropped, and so is an empty "hooks" object.
  function uninstall() {
    if (!fs.existsSync(file)) return { ok: true, msg: '沒有安裝' };
    let s; try { s = read(); } catch { return { ok: false, msg: `${path.basename(file)} 格式有誤` }; }
    if (!s.hooks || typeof s.hooks !== 'object') return { ok: true, msg: '沒有安裝' };
    let removed = 0;
    for (const e of Object.keys(s.hooks)) {
      if (!Array.isArray(s.hooks[e])) continue;
      const keep = s.hooks[e].filter(g => !ours([g]));
      removed += s.hooks[e].length - keep.length;
      if (keep.length) s.hooks[e] = keep; else delete s.hooks[e];
    }
    if (!Object.keys(s.hooks).length) delete s.hooks;
    if (!removed) return { ok: true, msg: '沒有安裝' };
    try { fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n'); } catch { return { ok: false, msg: '寫入失敗' }; }
    return { ok: true, msg: '已移除' };
  }

  return { status, install, uninstall, FILE: file };
}

module.exports = { agentHooks };
