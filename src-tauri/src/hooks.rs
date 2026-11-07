// 一鍵安裝 hook: Rust port of tools/agent-hooks.js + claude-hooks.js + codex-hooks.js (2026-11-07).
// Claude Code (~/.claude/settings.json) and Codex (~/.codex/hooks.json) both keep
// { hooks: { Event: [ { hooks: [handler] } ] } }, so one merger serves both: it only adds what is missing (one
// group per event), keeps everything else (other tools' hooks, key order), and backs the old file up once
// (<file>.vibing-backup). uninstall() takes ours back out. A group is "ours" when its command calls our URL.
use serde_json::{json, Map, Value};
use std::fs;
use std::path::PathBuf;

pub struct Agent {
    pub name: &'static str,
    pub file: PathBuf,
    url: &'static str,
    events: &'static [&'static str],
    handler: Value,
    need_dir: Option<PathBuf>,
    ok_msg: &'static str,
}

fn home() -> PathBuf { PathBuf::from(std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).unwrap_or_default()) }

pub fn claude() -> Agent {
    const URL: &str = "http://127.0.0.1:47321/claude";
    // Claude Code runs hook commands through bash (Git Bash on Windows), so one command serves every platform
    let cmd = format!("curl -s -m 1 -o /dev/null -X POST -H \"Content-Type: application/json\" --data-binary @- {} 2>/dev/null || true", URL);
    Agent { name: "Claude", file: home().join(".claude").join("settings.json"), url: URL,
        events: &["SessionStart", "UserPromptSubmit", "PreToolUse", "Notification", "Stop", "SubagentStop", "SessionEnd"],
        handler: json!({ "type": "command", "command": cmd, "timeout": 3, "async": true }), need_dir: None, ok_msg: "已安裝，重開 Claude Code" }
}

pub fn codex() -> Agent {
    const URL: &str = "http://127.0.0.1:47321/hook/codex";
    // Codex runs hook commands through PowerShell on Windows: curl.exe, NUL and the quoted "@-" keep PowerShell
    // from reading them as its own alias / path / splat
    let cmd = if cfg!(windows) { format!("curl.exe -s -m 1 -o NUL -X POST -H \"Content-Type: application/json\" --data-binary \"@-\" {}", URL) }
        else { format!("curl -s -m 1 -o /dev/null -X POST -H \"Content-Type: application/json\" --data-binary @- {} 2>/dev/null || true", URL) };
    let dir = home().join(".codex");
    Agent { name: "Codex", file: dir.join("hooks.json"), url: URL,
        events: &["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Stop", "SubagentStop", "SessionEnd"],
        handler: json!({ "type": "command", "command": cmd, "timeout": 3 }),   // Codex rejects unknown fields (no "async")
        need_dir: Some(dir), ok_msg: "已安裝，到 Codex 輸入 /hooks 信任" }
}

pub fn by_name(a: &str) -> Agent { if a == "codex" { codex() } else { claude() } }

impl Agent {
    fn ours(&self, groups: &Value) -> bool {
        groups.as_array().map_or(false, |gs| gs.iter().any(|g| g["hooks"].as_array().map_or(false, |hs|
            hs.iter().any(|h| h["command"].as_str().map_or(false, |c| c.contains(self.url))))))
    }
    // Err = the file is there but not valid JSON: we leave it alone
    fn read(&self) -> Result<Value, ()> {
        if !self.file.exists() { return Ok(json!({})); }
        let s = fs::read_to_string(&self.file).map_err(|_| ())?;
        let s = s.trim_start_matches('\u{feff}');
        serde_json::from_str::<Value>(s).ok().filter(|v| v.is_object()).ok_or(())
    }
    fn write(&self, v: &Value) -> bool {
        fs::write(&self.file, serde_json::to_string_pretty(v).unwrap_or_default() + "\n").is_ok()
    }
    fn missing(&self) -> bool { self.need_dir.as_ref().map_or(false, |d| !d.exists()) }
    fn file_name(&self) -> String { self.file.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default() }

    // 'on' = every event wired, 'partial', 'off', 'error' (file is not valid JSON), 'none' (agent not installed)
    pub fn status(&self) -> &'static str {
        if self.missing() { return "none"; }
        let Ok(s) = self.read() else { return "error" };
        let n = self.events.iter().filter(|e| self.ours(&s["hooks"][**e])).count();
        if n == self.events.len() { "on" } else if n > 0 { "partial" } else { "off" }
    }

    pub fn install(&self, t: &dyn Fn(&str, &[&str]) -> String) -> Value {
        if self.missing() { return json!({ "ok": false, "msg": t("找不到設定資料夾", &[]) }); }
        let Ok(mut s) = self.read() else { return json!({ "ok": false, "msg": t("{0} 格式有誤", &[&self.file_name()]) }) };
        if !s["hooks"].is_object() { s["hooks"] = Value::Object(Map::new()); }
        let mut added = 0;
        for e in self.events {
            if self.ours(&s["hooks"][*e]) { continue; }
            if !s["hooks"][*e].is_array() { s["hooks"][*e] = json!([]); }
            s["hooks"][*e].as_array_mut().unwrap().push(json!({ "hooks": [self.handler.clone()] }));
            added += 1;
        }
        if added == 0 { return json!({ "ok": true, "msg": t("已安裝", &[]) }); }
        if let Some(d) = self.file.parent() { let _ = fs::create_dir_all(d); }
        let bak = PathBuf::from(format!("{}.vibing-backup", self.file.display()));
        if self.file.exists() && !bak.exists() { let _ = fs::copy(&self.file, &bak); }
        if !self.write(&s) { return json!({ "ok": false, "msg": t("寫入失敗", &[]) }); }
        json!({ "ok": true, "msg": t(self.ok_msg, &[]) })
    }

    // takes out only the groups that call our URL; an event left with no groups is dropped, and so is an empty "hooks"
    pub fn uninstall(&self, t: &dyn Fn(&str, &[&str]) -> String) -> (bool, String) {
        if !self.file.exists() { return (true, t("沒有安裝", &[])); }
        let Ok(mut s) = self.read() else { return (false, t("{0} 格式有誤", &[&self.file_name()])) };
        let Some(hooks) = s.get_mut("hooks").and_then(|h| h.as_object_mut()) else { return (true, t("沒有安裝", &[])) };
        let mut removed = 0;
        let keys: Vec<String> = hooks.keys().cloned().collect();
        for e in keys {
            let Some(arr) = hooks[&e].as_array() else { continue };
            let keep: Vec<Value> = arr.iter().filter(|g| !self.ours(&json!([g]))).cloned().collect();
            removed += arr.len() - keep.len();
            if keep.is_empty() { hooks.shift_remove(&e); } else { hooks[&e] = Value::Array(keep); }
        }
        if hooks.is_empty() { s.as_object_mut().unwrap().shift_remove("hooks"); }
        if removed == 0 { return (true, t("沒有安裝", &[])); }
        if !self.write(&s) { return (false, t("寫入失敗", &[])); }
        (true, t("已移除", &[]))
    }
}
