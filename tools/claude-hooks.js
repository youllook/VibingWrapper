// 一鍵安裝 Claude hook (2026-10-15): merges the bridge's hooks into ~/.claude/settings.json, so a downloaded
// build works without hand-editing JSON. Only adds what is missing (one entry per event), keeps everything
// else, and backs the old file up once (settings.json.vibing-backup). uninstall() takes ours back out.
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL = 'http://127.0.0.1:47321/claude';
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'Notification', 'Stop', 'SubagentStop', 'SessionEnd'];
const COMMAND = `curl -s -m 1 -o /dev/null -X POST -H "Content-Type: application/json" --data-binary @- ${URL} 2>/dev/null || true`;
const FILE = path.join(os.homedir(), '.claude', 'settings.json');

const ours = groups => Array.isArray(groups) && groups.some(g => g && Array.isArray(g.hooks) && g.hooks.some(h => h && typeof h.command === 'string' && h.command.includes(URL)));

function read() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));     // throws on a broken file → we leave it alone
}

// 'on' = every event wired, 'partial', 'off', or 'error' (settings.json is not valid JSON)
function status() {
  let s; try { s = read(); } catch { return 'error'; }
  const n = EVENTS.filter(e => ours(s.hooks && s.hooks[e])).length;
  return n === EVENTS.length ? 'on' : n ? 'partial' : 'off';
}

function install() {
  let s; try { s = read(); } catch { return { ok: false, msg: 'settings.json 格式有誤' }; }
  if (!s.hooks || typeof s.hooks !== 'object') s.hooks = {};
  let added = 0;
  for (const e of EVENTS) {
    if (ours(s.hooks[e])) continue;
    if (!Array.isArray(s.hooks[e])) s.hooks[e] = [];
    s.hooks[e].push({ hooks: [{ type: 'command', command: COMMAND, timeout: 3, async: true }] });
    added++;
  }
  if (!added) return { ok: true, msg: '已安裝' };
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const bak = FILE + '.vibing-backup';
    if (fs.existsSync(FILE) && !fs.existsSync(bak)) fs.copyFileSync(FILE, bak);
    fs.writeFileSync(FILE, JSON.stringify(s, null, 2) + '\n');
  } catch (e) { return { ok: false, msg: '寫入失敗' }; }
  return { ok: true, msg: '已安裝，重開 Claude Code' };
}

// 解除安裝 (2026-10-16): takes out only the hook groups that call our URL; other hooks and settings stay.
// An event left with no groups is dropped, and so is an empty "hooks" object.
function uninstall() {
  if (!fs.existsSync(FILE)) return { ok: true, msg: '沒有安裝' };
  let s; try { s = read(); } catch { return { ok: false, msg: 'settings.json 格式有誤' }; }
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
  try { fs.writeFileSync(FILE, JSON.stringify(s, null, 2) + '\n'); } catch { return { ok: false, msg: '寫入失敗' }; }
  return { ok: true, msg: '已移除' };
}

module.exports = { status, install, uninstall, FILE };
