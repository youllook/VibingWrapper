// Claude Code → weather bridge (2026-09-29, weather since 2026-09-30).
// 1. Claude Code hooks POST their JSON (the hook's stdin) to http://127.0.0.1:47321/claude;
//    we map the event to a weather state and write themes/state.json.
// 2. The same server serves the themes/ folder (one sub-folder per wallpaper theme, 2026-10-01) and
//    answers every themes/<id>/state.json with that one file, so each page can fetch('state.json') from its
//    own folder (a file:// page could not). GET /themes/list.json = the enabled themes (see themes/README.md).
// Localhost only, small bodies only, static files from themes/ only; nothing is executed.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 47321;
const THEMES_DIR = path.join(__dirname, '..', 'themes');
const STATE_FILE = path.join(THEMES_DIR, 'state.json');
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.glsl': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };

// Claude Code event → weather. Working = storm, thinking = overcast, done = clearing → clear.
const EVENT_WEATHER = {
  SessionStart: 'clear',
  UserPromptSubmit: 'overcast',
  PreToolUse: 'storm',
  PostToolUse: 'storm',
  Notification: null,          // → weatherFor(): waiting, or ignored
  Stop: 'clearing',
  SubagentStop: null,          // a subagent finishing does not mean the main turn is done
  SessionEnd: 'clear',
};
const CLEAR_AFTER_MS = 20000;  // clearing → clear once things stay quiet

// 等你 (2026-09-30): Claude is blocked on the user — a permission prompt, or a question (AskUserQuestion /
// plan approval). The wallpaper dims and one star pulses until the user answers.
const WAIT_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode']);
const WAIT_NOTIFY = new Set(['permission_prompt', 'elicitation_dialog']);
function weatherFor(j) {
  const name = j.hook_event_name;
  if (name === 'PreToolUse' && WAIT_TOOLS.has(j.tool_name)) return 'waiting';
  if (name === 'Notification') {
    // idle_prompt = the "still there?" nudge a minute after a finished turn: not a question → ignore
    if (typeof j.notification_type === 'string') return WAIT_NOTIFY.has(j.notification_type) ? 'waiting' : null;
    return /waiting for your input/i.test(String(j.message || '')) ? null : 'waiting';   // older Claude Code: no type
  }
  return EVENT_WEATHER[name] || null;
}

/* ---- event log (2026-09-30), for observing how the weather behaves over a real session ----
   JSON lines: {t, event, tool, session, weather (this session), sky (combined), changed (sky changed)}. Only names and ids — never prompt text,
   commands or paths. Rotates at 1 MB (keeps one .1 file). */
const LOG_MAX = 1024 * 1024;
let logFile = null;
function log(entry) {
  if (!logFile) return;
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const t = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  const line = JSON.stringify({ t, ...entry }) + '\n';
  fs.stat(logFile, (err, st) => {
    const append = () => fs.appendFile(logFile, line, e => e && console.error('[claude-bridge] log', e.message));
    if (!err && st.size > LOG_MAX) fs.rename(logFile, logFile + '.1', append); else append();
  });
}

/* ---- several sessions at once (2026-09-30) ----
   The user runs up to 5 Claude Code sessions side by side (the hooks are global since 2026-09-30).
   Each session keeps its OWN state; the sky shows the most urgent one:
       waiting > storm > overcast > clearing > clear
   so one session finishing never clears the sky while another still works, and a session waiting for
   the user always shows its star. A session leaves on SessionEnd, or after going quiet (30 min; 2 h
   while it waits for the user). At most MAX_SESSIONS are tracked — a 6th pushes out the one quiet the
   longest. Each keeps a fixed slot 0–4 (state.json "sessions"), ready for one boat per session. */
const MAX_SESSIONS = 5;
const PRIORITY = ['clear', 'clearing', 'overcast', 'storm', 'waiting'];
const QUIET_MS = 30 * 60000, QUIET_WAIT_MS = 2 * 3600000;
const sessions = new Map();                              // id → { state, last, slot, clearT }

function skyState() {
  let best = 'clear';
  for (const x of sessions.values()) if (PRIORITY.indexOf(x.state) > PRIORITY.indexOf(best)) best = x.state;
  return best;
}
function slotStates() { const a = Array(MAX_SESSIONS).fill(null); for (const x of sessions.values()) a[x.slot] = x.state; return a; }
function addSession(id) {
  if (sessions.size >= MAX_SESSIONS) {                   // full: drop the one quiet the longest (a waiting one last)
    let out = null;
    for (const [k, x] of sessions) {
      const o = out && sessions.get(out);
      if (!o || (o.state === 'waiting') > (x.state === 'waiting') || ((o.state === 'waiting') === (x.state === 'waiting') && x.last < o.last)) out = k;
    }
    dropSession(out);
  }
  const used = new Set([...sessions.values()].map(x => x.slot));
  let slot = 0; while (used.has(slot)) slot++;
  const x = { state: 'clear', last: Date.now(), slot, clearT: null };
  sessions.set(id, x);
  return x;
}
function dropSession(id) { const x = sessions.get(id); if (x) { clearTimeout(x.clearT); sessions.delete(id); } }

let lastWritten = null, lastSlots = '';
const listeners = [];                                    // (state) => void, e.g. the pet's AI category
// write the combined sky (+ per-slot states) when anything changed; returns true if the SKY changed
function publish() {
  const state = skyState(), sl = slotStates(), key = JSON.stringify(sl);
  const changed = state !== lastWritten;
  if (!changed && key === lastSlots) return false;
  lastWritten = state; lastSlots = key;
  if (changed) for (const fn of listeners) { try { fn(state); } catch (e) { console.error('[claude-bridge] listener', e.message); } }
  // synchronous on purpose: two sessions can publish within the same millisecond, and two async
  // writes to the same .tmp interleave into broken JSON. The file is ~80 bytes.
  const tmp = STATE_FILE + '.tmp';
  try { fs.writeFileSync(tmp, JSON.stringify({ state, sessions: sl }) + '\n'); fs.renameSync(tmp, STATE_FILE); }
  catch (e) { console.error('[claude-bridge]', e.message); }
  return changed;
}
function onEvent(j) {
  const name = j.hook_event_name;
  const id = typeof j.session_id === 'string' && j.session_id ? j.session_id : 'default';
  const base = {
    event: name,
    tool: typeof j.tool_name === 'string' ? j.tool_name.slice(0, 60) : undefined,
    ntype: typeof j.notification_type === 'string' ? j.notification_type.slice(0, 40) : undefined,
    session: id.slice(0, 8),
  };
  if (name === 'SessionEnd') { dropSession(id); log({ ...base, weather: null, sky: skyState(), changed: publish() }); return; }
  let x = sessions.get(id);
  let w = weatherFor(j);
  // while a session waits, its background subagents' tool calls must not wipe the star
  if (x && x.state === 'waiting' && j.agent_id) w = null;
  if (!w) { log({ ...base, weather: null, changed: false }); return; }   // e.g. SubagentStop: seen, ignored
  x = x || addSession(id);
  x.last = Date.now();
  clearTimeout(x.clearT);
  x.state = w;
  if (w === 'clearing') x.clearT = setTimeout(() => {
    x.state = 'clear';
    log({ event: 'timer', session: id.slice(0, 8), weather: 'clear', sky: skyState(), changed: publish() });
  }, CLEAR_AFTER_MS);
  log({ ...base, weather: w, sky: skyState(), changed: publish() });
}
// sessions that went quiet (closed without SessionEnd, crashed, forgotten) leave after a while
setInterval(() => {
  const now = Date.now();
  let n = 0;
  for (const [k, x] of sessions) if (now - x.last > (x.state === 'waiting' ? QUIET_WAIT_MS : QUIET_MS)) { dropSession(k); n++; }
  if (n) log({ event: 'sweep', dropped: n, sky: skyState(), changed: publish() });
}, 60000).unref();

/* ---- themes (2026-10-01): every folder themes/<id>/ with a theme.json is a wallpaper ----
   theme.json: { name, order, entry = 'index.html', enabled = true, description }. Folders starting with _ or .
   are skipped. Read fresh on every call, so a new folder shows up without a restart. */
const BASE = `http://127.0.0.1:${PORT}/themes/`;
function themes() {
  let dirs = [];
  try { dirs = fs.readdirSync(THEMES_DIR, { withFileTypes: true }).filter(d => d.isDirectory() && !/^[_.]/.test(d.name)); } catch { return []; }
  const list = [];
  for (const d of dirs) {
    let t; try { t = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, d.name, 'theme.json'), 'utf8')); } catch { continue; }
    if (!t || t.enabled === false) continue;
    const entry = typeof t.entry === 'string' && t.entry ? t.entry : 'index.html';
    list.push({ id: d.name, name: String(t.name || d.name), order: Number(t.order) || 99, description: t.description || '', url: BASE + d.name + '/' + entry });
  }
  return list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
const themeUrl = id => (themes().find(t => t.id === id) || {}).url || null;

function serveThemes(req, res) {
  const rel = decodeURIComponent(req.url.split('?')[0].slice('/themes/'.length)) || 'demo.html';
  const send = (type, buf) => { res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(buf); };
  if (rel === 'list.json') return send(TYPES['.json'], JSON.stringify(themes()));
  const file = path.basename(rel) === 'state.json' ? STATE_FILE : path.resolve(THEMES_DIR, rel);
  if (file !== STATE_FILE && !file.startsWith(THEMES_DIR + path.sep)) { res.writeHead(404).end(); return; }   // no traversal
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

function start(opts = {}) {
  if (opts.logDir) logFile = require('path').join(opts.logDir, 'weather-log.jsonl');
  if (opts.onState) listeners.push(opts.onState);
  // pick up the last state; if it is older than 2 min (app was closed / Claude died mid-turn) start clear
  try {
    const st = fs.statSync(STATE_FILE);
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).state;
    if (Date.now() - st.mtimeMs < 120000 && typeof s === 'string') lastWritten = s; else publish();
  } catch { publish(); }
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url.startsWith('/themes/')) return serveThemes(req, res);
    if (req.method !== 'POST' || req.url !== '/claude') { res.writeHead(404).end(); return; }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 64 * 1024) req.destroy(); });
    req.on('end', () => {
      res.writeHead(204).end();
      let j; try { j = JSON.parse(body); } catch { return; }
      if (j && typeof j.hook_event_name === 'string') onEvent(j);
    });
  });
  server.on('error', e => console.error('[claude-bridge]', e.message));   // e.g. port taken
  server.listen(PORT, '127.0.0.1');
  return server;
}

const current = () => lastWritten || 'clear';
const sessionStates = () => slotStates();
module.exports = { start, current, sessionStates, MAX_SESSIONS, PORT, themes, themeUrl };
