// 一鍵安裝 Claude hook (2026-10-15): merges the bridge's hooks into ~/.claude/settings.json, so a downloaded
// build works without hand-editing JSON. The merge / backup / uninstall logic lives in agent-hooks.js.
const os = require('os');
const path = require('path');
const { agentHooks } = require('./agent-hooks');

const URL = 'http://127.0.0.1:47321/claude';
// Claude Code runs hook commands through bash (Git Bash on Windows), so one command serves every platform
const COMMAND = `curl -s -m 1 -o /dev/null -X POST -H "Content-Type: application/json" --data-binary @- ${URL} 2>/dev/null || true`;

module.exports = agentHooks({
  file: path.join(os.homedir(), '.claude', 'settings.json'),
  url: URL,
  events: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'Notification', 'Stop', 'SubagentStop', 'SessionEnd'],
  handler: () => ({ type: 'command', command: COMMAND, timeout: 3, async: true }),
  okMsg: '已安裝，重開 Claude Code',
});
