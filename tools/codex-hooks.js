// 一鍵安裝 Codex hook (2026-10-20): merges the bridge's hooks into ~/.codex/hooks.json (Codex CLI ≥ 0.153,
// feature "hooks"). Other tools' hooks in that file stay. Codex only runs a hook the user has trusted, so after
// installing, `/hooks` in Codex has to approve them once (and again whenever their definition changes).
const os = require('os');
const path = require('path');
const { agentHooks } = require('./agent-hooks');

const URL = 'http://127.0.0.1:47321/hook/codex';
// Codex runs hook commands through PowerShell on Windows (measured 2026-10-20: pwsh, stdin is passed on to
// curl.exe) and through sh elsewhere. `curl.exe`, `NUL` and the quoted "@-" keep PowerShell from reading
// them as its own alias / path / splat. A failed curl (wallpaper not running) shows nothing in Codex.
const COMMAND = process.platform === 'win32'
  ? `curl.exe -s -m 1 -o NUL -X POST -H "Content-Type: application/json" --data-binary "@-" ${URL}`
  : `curl -s -m 1 -o /dev/null -X POST -H "Content-Type: application/json" --data-binary @- ${URL} 2>/dev/null || true`;
const DIR = path.join(os.homedir(), '.codex');

module.exports = agentHooks({
  file: path.join(DIR, 'hooks.json'),
  url: URL,
  // PostToolUse: an approved PermissionRequest turns back into storm right away. Codex has no Notification.
  events: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'SubagentStop', 'SessionEnd'],
  handler: () => ({ type: 'command', command: COMMAND, timeout: 3 }),   // Codex rejects unknown fields (no "async")
  needDir: DIR,
  okMsg: '已安裝，到 Codex 輸入 /hooks 信任',
});
