// Claude Code / Codex → weather bridge. Rust port of tools/claude-bridge.js (2026-11-07); same routes, same
// state.json, same log lines, so hooks installed by the Electron build keep working unchanged.
//   POST /claude, POST /hook/<source>   hook JSON → per-session weather → state.json (+ on_state callback)
//   GET  /themes/...                    the theme folders, list.json, events.json, every <id>/state.json
// Localhost only, small bodies only, static files from the theme folders only; nothing is executed.
use serde_json::{json, Map, Value};
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub const MAX_SESSIONS: usize = 5;
const PRIORITY: [&str; 5] = ["clear", "clearing", "overcast", "storm", "waiting"];
const CLEAR_AFTER: Duration = Duration::from_secs(20);
const QUIET: Duration = Duration::from_secs(30 * 60);
const QUIET_WAIT: Duration = Duration::from_secs(2 * 3600);
const LOG_MAX: u64 = 1024 * 1024;
const RECENT_MAX: usize = 40;

fn prio(s: &str) -> usize { PRIORITY.iter().position(|x| *x == s).unwrap_or(0) }
fn now_ms() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }

/* ---- event sources: each adapter turns a provider's hook JSON into one normalized event ---- */
struct Ev { session: String, kind: &'static str, tool: Option<String>, agent: Option<String>, event: Option<String>, ntype: Option<String> }

fn s(j: &Value, k: &str, n: usize) -> Option<String> {
    j.get(k).and_then(|v| v.as_str()).filter(|v| !v.is_empty()).map(|v| v.chars().take(n).collect())
}
fn common(j: &Value, kind: &'static str) -> Ev {
    Ev { session: s(j, "session_id", 200).unwrap_or_else(|| "default".into()), kind, tool: s(j, "tool_name", 60),
         agent: s(j, "agent_id", 80), event: s(j, "hook_event_name", 40), ntype: None }
}
fn claude_adapter(j: &Value) -> Option<Ev> {
    let tool = j.get("tool_name").and_then(|v| v.as_str()).unwrap_or("");
    // idle desktop sessions poll the Chrome extension every ~20 s: not work, dropped unlogged
    if tool == "mcp__claude-in-chrome__list_connected_browsers" { return None; }
    let name = j.get("hook_event_name").and_then(|v| v.as_str()).unwrap_or("");
    let ntype = s(j, "notification_type", 40);
    let kind = match name {
        "PreToolUse" if tool == "AskUserQuestion" || tool == "ExitPlanMode" => "wait",
        "Notification" => match ntype.as_deref() {
            Some("permission_prompt") | Some("elicitation_dialog") => "wait",
            Some(_) => "ignore",   // idle_prompt = the "still there?" nudge
            None => {
                let msg = j.get("message").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                if msg.contains("waiting for your input") { "ignore" } else { "wait" }
            }
        },
        "SessionStart" => "start", "UserPromptSubmit" => "prompt", "PreToolUse" | "PostToolUse" => "tool",
        "Stop" => "stop", "SessionEnd" => "end",
        _ => "ignore",
    };
    let mut e = common(j, kind);
    e.ntype = ntype;
    Some(e)
}
fn codex_adapter(j: &Value) -> Option<Ev> {
    let kind = match j.get("hook_event_name").and_then(|v| v.as_str()).unwrap_or("") {
        "SessionStart" => "start", "UserPromptSubmit" => "prompt", "PreToolUse" | "PostToolUse" => "tool",
        "PermissionRequest" => "wait", "Stop" => "stop", "SessionEnd" => "end", "Interrupt" => "interrupt",
        _ => "ignore",
    };
    Some(common(j, kind))
}
fn weather_of(kind: &str) -> Option<&'static str> {
    match kind { "start" => Some("clear"), "prompt" => Some("overcast"), "tool" => Some("storm"), "wait" => Some("waiting"),
                 "stop" | "interrupt" => Some("clearing"), _ => None }
}
fn tag(source: &str) -> &'static str { match source { "claude" => "cc", "codex" => "cx", _ => "db" } }

struct Session { state: &'static str, last: Instant, slot: usize, clear_at: Option<Instant>, source: String, tool: Option<String>, events: u64 }

#[derive(Default)]
struct Inner {
    sessions: HashMap<String, Session>,
    last_written: Option<String>,
    last_slots: String,
    recent: VecDeque<Value>,
    counts: Map<String, Value>,
    restore_until: Option<Instant>,   // restored sky from a recent state.json: clear it if nothing confirms it
}

pub struct Bridge {
    inner: Mutex<Inner>,
    pub port: u16,
    builtin: PathBuf,
    theme_dirs: Vec<PathBuf>,
    state_file: PathBuf,
    log_file: PathBuf,
    version: String,
    started: u64,
    lang_en: Box<dyn Fn() -> bool + Send + Sync>,
    on_state: Box<dyn Fn(&str) + Send + Sync>,
}

pub struct Opts {
    pub port: u16,
    pub builtin: PathBuf,
    pub downloaded: PathBuf,
    pub data_dir: PathBuf,
    pub version: String,
    pub lang_en: Box<dyn Fn() -> bool + Send + Sync>,
    pub on_state: Box<dyn Fn(&str) + Send + Sync>,
}

impl Bridge {
    pub fn start(o: Opts) -> Arc<Bridge> {
        let b = Arc::new(Bridge {
            inner: Mutex::new(Inner::default()), port: o.port, theme_dirs: vec![o.downloaded, o.builtin.clone()], builtin: o.builtin,
            state_file: o.data_dir.join("state.json"), log_file: o.data_dir.join("weather-log.jsonl"), version: o.version,
            started: now_ms(), lang_en: o.lang_en, on_state: o.on_state,
        });
        // pick up the last state if it is under 2 min old (a restart mid-turn), else start clear
        let restored = fs::metadata(&b.state_file).ok().and_then(|m| m.modified().ok()).and_then(|t| t.elapsed().ok())
            .filter(|age| *age < Duration::from_secs(120))
            .and_then(|age| {
                let v: Value = serde_json::from_str(&fs::read_to_string(&b.state_file).ok()?).ok()?;
                Some((v.get("state")?.as_str()?.to_string(), age))
            });
        match restored {
            Some((st, age)) => { let mut i = b.inner.lock().unwrap(); i.last_written = Some(st); i.restore_until = Some(Instant::now() + Duration::from_secs(120) - age); }
            None => { b.publish(&mut b.inner.lock().unwrap()); }
        }
        // timers: clearing → clear after 20 s, quiet sessions leave, the restored sky expires
        let t = b.clone();
        std::thread::spawn(move || {
            let mut last_sweep = Instant::now();
            loop {
                std::thread::sleep(Duration::from_millis(250));
                t.tick(last_sweep.elapsed() >= Duration::from_secs(60));
                if last_sweep.elapsed() >= Duration::from_secs(60) { last_sweep = Instant::now(); }
            }
        });
        match tiny_http::Server::http(("127.0.0.1", b.port)) {
            Ok(server) => {
                let server = Arc::new(server);
                for _ in 0..4 {
                    let (server, b) = (server.clone(), b.clone());
                    std::thread::spawn(move || for req in server.incoming_requests() { b.handle(req); });
                }
            }
            Err(e) => eprintln!("[bridge] cannot listen on {}: {}", b.port, e),   // e.g. port taken
        }
        b
    }

    fn tick(&self, sweep: bool) {
        let mut i = self.inner.lock().unwrap();
        let now = Instant::now();
        let due: Vec<String> = i.sessions.iter().filter(|(_, x)| x.clear_at.map_or(false, |t| t <= now)).map(|(k, _)| k.clone()).collect();
        for k in due {
            let (src, short) = { let x = i.sessions.get_mut(&k).unwrap(); x.state = "clear"; x.clear_at = None; (x.source.clone(), k.split_once(':').map(|p| p.1).unwrap_or("").chars().take(8).collect::<String>()) };
            let changed = self.publish(&mut i);
            self.log(json!({ "event": "timer", "src": tag(&src), "session": short, "weather": "clear", "sky": sky(&i), "changed": changed }));
        }
        if i.restore_until.map_or(false, |t| t <= now) { i.restore_until = None; if i.sessions.is_empty() { self.publish(&mut i); } }
        if sweep {
            let before = i.sessions.len();
            i.sessions.retain(|_, x| x.last.elapsed() <= if x.state == "waiting" { QUIET_WAIT } else { QUIET });
            let n = before - i.sessions.len();
            if n > 0 { let changed = self.publish(&mut i); self.log(json!({ "event": "sweep", "dropped": n, "sky": sky(&i), "changed": changed })); }
        }
    }

    // write the combined sky (+ per-slot states) when anything changed; true if the SKY changed
    fn publish(&self, i: &mut Inner) -> bool {
        let state = sky(i).to_string();
        let (sl, src) = slots(i);
        let key = json!([sl, src]).to_string();
        let changed = i.last_written.as_deref() != Some(&state);
        if !changed && key == i.last_slots { return false; }
        i.last_written = Some(state.clone());
        i.last_slots = key;
        if changed { (self.on_state)(&state); }
        let tmp = self.state_file.with_extension("json.tmp");
        let body = json!({ "state": state, "sessions": sl, "sources": src }).to_string() + "\n";
        if let Err(e) = fs::write(&tmp, body).and_then(|_| fs::rename(&tmp, &self.state_file)) { eprintln!("[bridge] {}", e); }
        changed
    }

    fn log(&self, entry: Value) {
        let mut m = Map::new();
        m.insert("t".into(), json!(chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f").to_string()));
        if let Value::Object(e) = entry { m.extend(e); }
        // undefined fields vanish from JSON.stringify in the JS version: drop nulls the same way, keep weather: null
        m.retain(|k, v| !v.is_null() || k == "weather");
        if fs::metadata(&self.log_file).map_or(false, |m| m.len() > LOG_MAX) { let _ = fs::rename(&self.log_file, self.log_file.with_extension("jsonl.1")); }
        if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&self.log_file) { let _ = writeln!(f, "{}", Value::Object(m)); }
    }

    fn remember(&self, i: &mut Inner, source: &str, e: &Ev, slot_key: Option<&str>) {
        let bump = |c: &mut Map<String, Value>, k: &str| { let n = c.get(k).and_then(|v| v.as_u64()).unwrap_or(0) + 1; c.insert(k.into(), json!(n)); };
        bump(&mut i.counts, "total"); bump(&mut i.counts, e.kind);
        let mut slot = Value::Null;
        if let Some(x) = slot_key.and_then(|k| i.sessions.get_mut(k)) { x.events += 1; if e.tool.is_some() { x.tool = e.tool.clone(); } slot = json!(x.slot); }
        let sky_now = sky(i);
        i.recent.push_back(json!({ "t": now_ms(), "src": tag(source), "kind": e.kind, "event": e.event, "tool": e.tool, "slot": slot, "sky": sky_now }));
        if i.recent.len() > RECENT_MAX { i.recent.pop_front(); }
    }

    fn on_event(&self, source: &str, e: Ev) {
        let mut i = self.inner.lock().unwrap();
        let id = format!("{}:{}", source, e.session);
        let short: String = e.session.chars().take(8).collect();
        let base = |weather: Value, sky: &str, changed: bool| json!({ "event": e.event, "src": tag(source), "tool": e.tool, "ntype": e.ntype, "session": short, "weather": weather, "sky": sky, "changed": changed });
        if e.kind == "end" {
            i.sessions.remove(&id);
            self.remember(&mut i, source, &e, None);
            let changed = self.publish(&mut i);
            self.log(base(Value::Null, sky(&i), changed));
            return;
        }
        let mut w = weather_of(e.kind);
        // while a session waits, its background subagents' tool calls must not wipe the star
        if i.sessions.get(&id).map_or(false, |x| x.state == "waiting") && e.agent.is_some() { w = None; }
        let Some(w) = w else {
            let has = i.sessions.contains_key(&id);
            self.remember(&mut i, source, &e, if has { Some(&id) } else { None });
            let mut l = base(Value::Null, "", false); l.as_object_mut().unwrap().remove("sky");
            self.log(l);
            return;
        };
        if !i.sessions.contains_key(&id) { add_session(&mut i, &id, source); }
        { let x = i.sessions.get_mut(&id).unwrap(); x.last = Instant::now(); x.state = w; x.clear_at = if w == "clearing" { Some(Instant::now() + CLEAR_AFTER) } else { None }; }
        i.restore_until = None;
        let changed = self.publish(&mut i);
        self.remember(&mut i, source, &e, Some(&id));
        self.log(base(json!(w), sky(&i), changed));
    }

    // Debug 模式: fire a hook by hand, as its own session
    pub fn inject(&self, kind: &str) -> bool {
        let (k, ev): (&'static str, &str) = match kind {
            "start" => ("start", "SessionStart"), "prompt" => ("prompt", "UserPromptSubmit"), "tool" => ("tool", "PreToolUse"),
            "wait" => ("wait", "Notification"), "stop" => ("stop", "Stop"), "end" => ("end", "SessionEnd"), _ => return false,
        };
        self.on_event("debug", Ev { session: "manual".into(), kind: k, tool: (k == "tool").then(|| "Debug".into()), agent: None, event: Some(ev.into()), ntype: None });
        true
    }

    pub fn current(&self) -> String { self.inner.lock().unwrap().last_written.clone().unwrap_or_else(|| "clear".into()) }

    /* ---- themes: every folder <root>/<id>/ with a theme.json; downloaded ones first ---- */
    fn base(&self) -> String { format!("http://127.0.0.1:{}/themes/", self.port) }
    pub fn themes(&self) -> Vec<Value> {
        let en = (self.lang_en)();
        let mut list: Vec<Value> = vec![];
        let mut seen = std::collections::HashSet::new();
        for root in &self.theme_dirs {
            let Ok(rd) = fs::read_dir(root) else { continue };
            for d in rd.flatten() {
                let name = d.file_name().to_string_lossy().to_string();
                if !d.path().is_dir() || name.starts_with('_') || name.starts_with('.') || seen.contains(&name) { continue; }
                let Some(t) = fs::read_to_string(d.path().join("theme.json")).ok().and_then(|x| serde_json::from_str::<Value>(&x).ok()) else { continue };
                if !t.is_object() || t.get("enabled") == Some(&json!(false)) { continue; }
                seen.insert(name.clone());
                let st = |k: &str| t.get(k).and_then(|v| v.as_str()).filter(|v| !v.is_empty());
                let entry = st("entry").unwrap_or("index.html");
                let pv = st("preview").filter(|p| valid_preview(p)).unwrap_or("preview.jpg");
                let preview = if d.path().join(pv).exists() { json!(format!("{}{}/{}", self.base(), name, pv)) } else { Value::Null };
                let order = t.get("order").and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(99.0);
                let tags: Vec<String> = t.get("tags").and_then(|v| v.as_array()).map(|a| a.iter().take(6).map(|x| x.as_str().map(String::from).unwrap_or_else(|| x.to_string())).collect()).unwrap_or_default();
                list.push(json!({
                    "id": name, "name": (if en { st("name_en") } else { None }).or(st("name")).unwrap_or(&name),
                    "order": order, "description": (if en { st("description_en") } else { None }).or(st("description")).unwrap_or(""),
                    "url": format!("{}{}/{}", self.base(), name, entry), "builtin": root == &self.builtin,
                    "bundled": t.get("bundled") != Some(&json!(false)), "tags": tags, "preview": preview,
                }));
            }
        }
        list.sort_by(|a, b| a["order"].as_f64().partial_cmp(&b["order"].as_f64()).unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a["id"].as_str().cmp(&b["id"].as_str())));
        list
    }
    pub fn theme_url(&self, id: &str) -> Option<String> {
        self.themes().into_iter().find(|t| t["id"] == id).and_then(|t| t["url"].as_str().map(String::from))
    }
    fn root_for(&self, id: &str) -> &Path {
        self.theme_dirs.iter().find(|r| r.join(id).join("theme.json").is_file()).unwrap_or(&self.builtin)
    }

    fn events_json(&self) -> Value {
        let i = self.inner.lock().unwrap();
        let now = now_ms();
        let mut ss: Vec<&Session> = i.sessions.values().collect();
        ss.sort_by_key(|x| x.slot);
        json!({ "now": now, "version": self.version, "uptime": now - self.started, "sky": sky(&i), "counts": i.counts, "recent": i.recent,
            "sessions": ss.iter().map(|x| json!({ "slot": x.slot, "source": x.source, "state": x.state, "idle": x.last.elapsed().as_millis() as u64, "tool": x.tool, "events": x.events })).collect::<Vec<_>>() })
    }

    fn handle(&self, mut req: tiny_http::Request) {
        let url = req.url().to_string();
        let method = req.method().clone();
        if method == tiny_http::Method::Get && url.starts_with("/themes/") { return self.serve_themes(req, &url); }
        let source = if method != tiny_http::Method::Post { None } else if url == "/claude" { Some("claude".to_string()) }
            else { url.strip_prefix("/hook/").filter(|s| !s.is_empty() && s.bytes().all(|c| c.is_ascii_lowercase())).map(String::from) };
        let adapter: Option<fn(&Value) -> Option<Ev>> = match source.as_deref() { Some("claude") => Some(claude_adapter), Some("codex") => Some(codex_adapter), _ => None };
        let Some(adapter) = adapter else { let _ = req.respond(tiny_http::Response::empty(404)); return };
        let mut body = Vec::new();
        let ok = req.as_reader().take(64 * 1024 + 1).read_to_end(&mut body).is_ok() && body.len() <= 64 * 1024;
        let _ = req.respond(tiny_http::Response::empty(204));
        if !ok { return; }
        let Ok(j) = serde_json::from_slice::<Value>(&body) else { return };
        if !j.get("hook_event_name").map_or(false, |v| v.is_string()) { return; }
        if let Some(e) = adapter(&j) { self.on_event(source.as_deref().unwrap(), e); }
    }

    fn serve_themes(&self, req: tiny_http::Request, url: &str) {
        let path = url.split('?').next().unwrap_or("");
        let rel = percent_decode(&path["/themes/".len()..]);
        let rel = if rel.is_empty() { "demo.html".to_string() } else { rel };
        let file_name = rel.rsplit('/').next().unwrap_or("");
        let respond = |req: tiny_http::Request, code: u16, ctype: &str, body: Vec<u8>| {
            let mut r = tiny_http::Response::from_data(body).with_status_code(code);
            r.add_header(tiny_http::Header::from_bytes("Content-Type", ctype).unwrap());
            r.add_header(tiny_http::Header::from_bytes("Cache-Control", "no-store").unwrap());
            let _ = req.respond(r);
        };
        if rel == "list.json" { return respond(req, 200, "application/json", serde_json::to_vec(&self.themes()).unwrap()); }
        if file_name == "events.json" { return respond(req, 200, "application/json", serde_json::to_vec(&self.events_json()).unwrap()); }
        let file = if file_name == "state.json" { self.state_file.clone() } else {
            // no traversal: plain segments only
            if rel.split('/').any(|s| s.is_empty() || s == "." || s == ".." || s.contains('\\') || s.contains(':')) { let _ = req.respond(tiny_http::Response::empty(404)); return; }
            let root = if rel.contains('/') { self.root_for(rel.split('/').next().unwrap()) } else { &self.builtin };
            root.join(&rel)
        };
        match fs::read(&file) {
            Ok(buf) => respond(req, 200, content_type(&file), buf),
            Err(_) => { let _ = req.respond(tiny_http::Response::empty(404)); }
        }
    }
}

fn sky(i: &Inner) -> &'static str {
    let mut best = "clear";
    for x in i.sessions.values() { if prio(x.state) > prio(best) { best = x.state; } }
    best
}
fn slots(i: &Inner) -> (Vec<Option<&'static str>>, Vec<Option<String>>) {
    let mut a = vec![None; MAX_SESSIONS];
    let mut b = vec![None; MAX_SESSIONS];
    for x in i.sessions.values() { a[x.slot] = Some(x.state); b[x.slot] = Some(x.source.clone()); }
    (a, b)
}
fn add_session(i: &mut Inner, id: &str, source: &str) {
    if i.sessions.len() >= MAX_SESSIONS {
        // full: drop the one quiet the longest (a waiting one last)
        let out = i.sessions.iter().min_by(|(_, a), (_, b)| (a.state == "waiting").cmp(&(b.state == "waiting")).then(a.last.cmp(&b.last))).map(|(k, _)| k.clone());
        if let Some(k) = out { i.sessions.remove(&k); }
    }
    let used: Vec<usize> = i.sessions.values().map(|x| x.slot).collect();
    let slot = (0..).find(|s| !used.contains(s)).unwrap();
    i.sessions.insert(id.into(), Session { state: "clear", last: Instant::now(), slot, clear_at: None, source: source.into(), tool: None, events: 0 });
}
fn valid_preview(p: &str) -> bool {
    let l = p.to_ascii_lowercase();
    p.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-') && [".jpg", ".jpeg", ".png", ".webp"].iter().any(|e| l.ends_with(e))
}
fn content_type(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8", "json" => "application/json", "js" => "text/javascript", "css" => "text/css",
        "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "svg" => "image/svg+xml", "webp" => "image/webp",
        "glsl" => "text/plain; charset=utf-8", "md" => "text/markdown; charset=utf-8", "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Some(v) = std::str::from_utf8(&b[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok()) { out.push(v); i += 3; continue; }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
