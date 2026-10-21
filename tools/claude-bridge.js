// Claude Code → weather bridge (2026-09-29, weather since 2026-09-30).
// 1. Claude Code hooks POST their JSON (the hook's stdin) to http://127.0.0.1:47321/claude;
//    we map the event to a weather state and write themes/state.json.
// 2. The same server serves the themes/ folder (one sub-folder per wallpaper theme, 2026-10-01) and
//    answers every themes/<id>/state.json with that one file, so each page can fetch('state.json') from its
//    own folder (a file:// page could not). GET /themes/list.json = the enabled themes (see themes/README.md).
// 3. GET /themes/events.json = recent events and per-slot detail for the basic theme's live view and debug
//    panel (2026-10-21): event names, tool names and ids only, like the log.
// Localhost only, small bodies only, static files from the theme folders only; nothing is executed.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.VIBINGWRAPPER_PORT) || 47321;   // env override only for a side-by-side dev copy
const THEMES_DIR = path.join(__dirname, '..', 'themes');
let THEME_DIRS = [THEMES_DIR];                           // start({ themeDirs }) puts downloaded themes first
let STATE_FILE = path.join(THEMES_DIR, 'state.json');   // start({ stateDir }) moves it out of the app folder (read-only once packaged)
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.glsl': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm', '.pck': 'application/octet-stream' };   // Godot web exports

/* ---- event sources (2026-10-20, designed with Fable) ----
   Each agent's hooks POST their raw JSON to /hook/<source> (/claude stays as the old Claude route). An adapter
   turns that body into one normalized event, so onEvent never reads a provider's own fields:
     { session, kind, tool?, agent?, event, ntype? }      (adapter returns null = drop unlogged)
   kind: start | prompt | tool | wait | stop | end | interrupt | ignore (logged, no weather change)
   A new agent (Gemini CLI …) = one more adapter; unknown sources get a 404. */
const KIND_WEATHER = { start: 'clear', prompt: 'overcast', tool: 'storm', wait: 'waiting', stop: 'clearing', interrupt: 'clearing' };
const CLEAR_AFTER_MS = 20000;  // clearing → clear once things stay quiet
const str = (v, n) => typeof v === 'string' && v ? v.slice(0, n) : undefined;
const common = j => ({ session: str(j.session_id, 200) || 'default', tool: str(j.tool_name, 60), agent: str(j.agent_id, 80), event: str(j.hook_event_name, 40) });

// Claude Code event → weather. Working = storm, thinking = overcast, done = clearing → clear.
// 等你 (2026-09-30): Claude is blocked on the user — a permission prompt, or a question (AskUserQuestion /
// plan approval). The wallpaper dims and one star pulses until the user answers.
const WAIT_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode']);
const WAIT_NOTIFY = new Set(['permission_prompt', 'elicitation_dialog']);
// Background probes, not work (2026-10-15): idle Claude desktop sessions poll the Chrome extension every
// ~20 s. Counting them kept those sessions storming forever and filled all 5 slots; they are dropped unlogged.
const PROBE_TOOLS = new Set(['mcp__claude-in-chrome__list_connected_browsers']);
const CLAUDE_KIND = { SessionStart: 'start', UserPromptSubmit: 'prompt', PreToolUse: 'tool', PostToolUse: 'tool', Stop: 'stop', SessionEnd: 'end' };
function claudeAdapter(j) {
  if (PROBE_TOOLS.has(j.tool_name)) return null;
  const e = { ...common(j), ntype: str(j.notification_type, 40) }, name = j.hook_event_name;
  if (name === 'PreToolUse' && WAIT_TOOLS.has(j.tool_name)) e.kind = 'wait';
  else if (name === 'Notification') {
    // idle_prompt = the "still there?" nudge a minute after a finished turn: not a question → ignore
    if (e.ntype) e.kind = WAIT_NOTIFY.has(e.ntype) ? 'wait' : 'ignore';
    else e.kind = /waiting for your input/i.test(String(j.message || '')) ? 'ignore' : 'wait';   // older Claude Code: no type
  } else e.kind = CLAUDE_KIND[name] || 'ignore';   // e.g. SubagentStop: a subagent finishing does not end the turn
  return e;
}

// OpenAI Codex CLI (hooks.json, 0.163): same field names as Claude, plus turn_id. No Notification event;
// PermissionRequest is the "waiting for the user's approval" moment. PostToolUse is wired so an approved
// call turns the star back into storm right away. Compact / SubagentStart change nothing.
const CODEX_KIND = { SessionStart: 'start', UserPromptSubmit: 'prompt', PreToolUse: 'tool', PostToolUse: 'tool',
  PermissionRequest: 'wait', Stop: 'stop', SessionEnd: 'end', Interrupt: 'interrupt' };
const codexAdapter = j => ({ ...common(j), kind: CODEX_KIND[j.hook_event_name] || 'ignore' });

const ADAPTERS = { claude: claudeAdapter, codex: codexAdapter };
const SOURCE_TAG = { claude: 'cc', codex: 'cx' };   // short prefix for the log

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
const sessions = new Map();                              // 'source:session_id' → { state, last, slot, clearT, source }

function skyState() {
  let best = 'clear';
  for (const x of sessions.values()) if (PRIORITY.indexOf(x.state) > PRIORITY.indexOf(best)) best = x.state;
  return best;
}
function slotStates() { const a = Array(MAX_SESSIONS).fill(null); for (const x of sessions.values()) a[x.slot] = x.state; return a; }
function slotSources() { const a = Array(MAX_SESSIONS).fill(null); for (const x of sessions.values()) a[x.slot] = x.source; return a; }
function addSession(id, source) {
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
  const x = { state: 'clear', last: Date.now(), slot, clearT: null, source };
  sessions.set(id, x);
  return x;
}
function dropSession(id) { const x = sessions.get(id); if (x) { clearTimeout(x.clearT); sessions.delete(id); } }

let lastWritten = null, lastSlots = '';
const listeners = [];                                    // (state) => void, e.g. the pet's AI category
// write the combined sky (+ per-slot states) when anything changed; returns true if the SKY changed
function publish() {
  // "sources" (2026-10-20) runs parallel to "sessions": which agent each slot belongs to, for themes that
  // want to draw them apart. "sessions" keeps its shape so existing themes are untouched.
  const state = skyState(), sl = slotStates(), src = slotSources(), key = JSON.stringify([sl, src]);
  const changed = state !== lastWritten;
  if (!changed && key === lastSlots) return false;
  lastWritten = state; lastSlots = key;
  if (changed) for (const fn of listeners) { try { fn(state); } catch (e) { console.error('[claude-bridge] listener', e.message); } }
  // synchronous on purpose: two sessions can publish within the same millisecond, and two async
  // writes to the same .tmp interleave into broken JSON. The file is ~80 bytes.
  const tmp = STATE_FILE + '.tmp';
  try { fs.writeFileSync(tmp, JSON.stringify({ state, sessions: sl, sources: src }) + '\n'); fs.renameSync(tmp, STATE_FILE); }
  catch (e) { console.error('[claude-bridge]', e.message); }
  return changed;
}
const RECENT_MAX = 40, recent = [], counts = { total: 0 };   // for events.json
let startedAt = Date.now(), appVersion = '';
function remember(source, e, x) {
  counts.total++; counts[e.kind] = (counts[e.kind] || 0) + 1;
  if (x) { x.events = (x.events || 0) + 1; if (e.tool) x.tool = e.tool; }
  recent.push({ t: Date.now(), src: SOURCE_TAG[source], kind: e.kind, event: e.event, tool: e.tool, slot: x ? x.slot : null, sky: skyState() });
  if (recent.length > RECENT_MAX) recent.shift();
}
function eventsJson() {
  const now = Date.now();
  return { now, version: appVersion, uptime: now - startedAt, sky: skyState(), counts, recent,
    sessions: [...sessions.values()].sort((a, b) => a.slot - b.slot).map(x => ({ slot: x.slot, source: x.source, state: x.state, idle: now - x.last, tool: x.tool || null, events: x.events || 0 })) };
}
function onEvent(source, e) {
  const id = source + ':' + e.session;
  const base = { event: e.event, src: SOURCE_TAG[source], tool: e.tool, ntype: e.ntype, session: e.session.slice(0, 8) };
  if (e.kind === 'end') { dropSession(id); remember(source, e, null); log({ ...base, weather: null, sky: skyState(), changed: publish() }); return; }
  let x = sessions.get(id);
  let w = KIND_WEATHER[e.kind] || null;
  // while a session waits, its background subagents' tool calls must not wipe the star
  if (x && x.state === 'waiting' && e.agent) w = null;
  if (!w) { remember(source, e, x); log({ ...base, weather: null, changed: false }); return; }   // e.g. SubagentStop: seen, ignored
  x = x || addSession(id, source);
  x.last = Date.now();
  clearTimeout(x.clearT);
  x.state = w;
  if (w === 'clearing') x.clearT = setTimeout(() => {
    x.state = 'clear';
    log({ event: 'timer', src: SOURCE_TAG[source], session: e.session.slice(0, 8), weather: 'clear', sky: skyState(), changed: publish() });
  }, CLEAR_AFTER_MS);
  const changed = publish(); remember(source, e, x);
  log({ ...base, weather: w, sky: skyState(), changed });
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
   are skipped. Read fresh on every call, so a new folder shows up without a restart.
   Several roots (2026-10-21): downloaded themes (userData/themes, see tools/theme-store.js) come first, so a
   downloaded copy of a built-in theme replaces it; `root` says where each one lives. */
const BASE = `http://127.0.0.1:${PORT}/themes/`;
function themes() {
  const list = [], seen = new Set();
  for (const root of THEME_DIRS) {
    let dirs = [];
    try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && !/^[_.]/.test(d.name)); } catch { continue; }
    for (const d of dirs) {
      if (seen.has(d.name)) continue;
      let t; try { t = JSON.parse(fs.readFileSync(path.join(root, d.name, 'theme.json'), 'utf8')); } catch { continue; }
      if (!t || t.enabled === false) continue;
      seen.add(d.name);
      const entry = typeof t.entry === 'string' && t.entry ? t.entry : 'index.html';
      list.push({ id: d.name, name: String(t.name || d.name), order: Number(t.order) || 99, description: t.description || '', url: BASE + d.name + '/' + entry,
        builtin: root === THEMES_DIR });
    }
  }
  return list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
// which root serves themes/<id>/… (the first that has it); demo.html etc. at the top level come from the app
const rootFor = id => THEME_DIRS.find(r => { try { return fs.statSync(path.join(r, id, 'theme.json')).isFile(); } catch { return false; } }) || THEMES_DIR;
const themeUrl = id => (themes().find(t => t.id === id) || {}).url || null;

function serveThemes(req, res) {
  const rel = decodeURIComponent(req.url.split('?')[0].slice('/themes/'.length)) || 'demo.html';
  const send = (type, buf) => { res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(buf); };
  if (rel === 'list.json') return send(TYPES['.json'], JSON.stringify(themes()));
  if (path.basename(rel) === 'events.json') return send(TYPES['.json'], JSON.stringify(eventsJson()));
  const root = rel.includes('/') ? rootFor(rel.split('/')[0]) : THEMES_DIR;
  const file = path.basename(rel) === 'state.json' ? STATE_FILE : path.resolve(root, rel);
  if (file !== STATE_FILE && !file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }   // no traversal
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

function start(opts = {}) {
  if (opts.logDir) logFile = require('path').join(opts.logDir, 'weather-log.jsonl');
  if (opts.stateDir) STATE_FILE = path.join(opts.stateDir, 'state.json');
  if (opts.onState) listeners.push(opts.onState);
  if (opts.themeDirs) THEME_DIRS = [...opts.themeDirs, THEMES_DIR];
  if (opts.version) appVersion = String(opts.version);
  startedAt = Date.now();
  // pick up the last state; if it is older than 2 min (app was closed / Claude died mid-turn) start clear
  try {
    const st = fs.statSync(STATE_FILE);
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).state;
    const age = Date.now() - st.mtimeMs;
    if (age < 120000 && typeof s === 'string') {
      lastWritten = s;
      // the session map itself is not restored: if no event re-creates it by the 2-min mark, fall back to
      // clear — otherwise a restart mid-turn kept the old sky forever (seen on the Mac test, 2026-10-20)
      setTimeout(() => { if (!sessions.size) publish(); }, 120000 - age).unref();
    } else publish();
  } catch { publish(); }
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url.startsWith('/themes/')) return serveThemes(req, res);
    // POST /hook/<source> (/claude = the original Claude route, kept for hooks installed before 2026-10-20)
    const m = req.method === 'POST' && (req.url === '/claude' ? ['', 'claude'] : /^\/hook\/([a-z]+)$/.exec(req.url));
    const adapter = m && Object.hasOwn(ADAPTERS, m[1]) && ADAPTERS[m[1]];
    if (!adapter) { res.writeHead(404).end(); return; }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 64 * 1024) req.destroy(); });
    req.on('end', () => {
      res.writeHead(204).end();
      let j; try { j = JSON.parse(body); } catch { return; }
      if (!j || typeof j.hook_event_name !== 'string') return;
      const e = adapter(j);
      if (e) onEvent(m[1], e);
    });
  });
  server.on('error', e => console.error('[claude-bridge]', e.message));   // e.g. port taken
  server.listen(PORT, '127.0.0.1');
  return server;
}

const current = () => lastWritten || 'clear';
const sessionStates = () => slotStates();
const sessionSources = () => slotSources();
module.exports = { start, current, sessionStates, sessionSources, MAX_SESSIONS, PORT, themes, themeUrl };
