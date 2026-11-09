// 主題庫: Rust port of tools/theme-store.js (2026-11-07). Theme packs published on GitHub Releases (tag "themes"),
// installed into <data>/themes/.
// Catalog: themes.json { format: 1, themes: [{ id, name, description, order, file, size, sha256, version, tags, preview }] }.
// Install = download → check size and sha256 → unzip with System32's tar into a temp folder → check <id>/theme.json
// → swap it in; .pack.json beside it remembers the installed version. Nothing downloaded is ever executed: themes
// are web pages served by the bridge. The source can also be a local folder (settings "themeStore", or
// VIBINGWRAPPER_THEME_STORE) holding the same files.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;

const RELEASE: &str = "https://github.com/youllook/VibingWrapper/releases/download/themes/";
const MAX_PACK: u64 = 400 * 1024 * 1024;

fn valid_id(id: &str) -> bool {
    let b = id.as_bytes();
    !b.is_empty() && b.len() <= 64 && (b[0].is_ascii_lowercase() || b[0].is_ascii_digit())
        && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'_' || *c == b'-')
}
fn valid_file(f: &str, exts: &[&str]) -> bool {
    !f.is_empty() && f.chars().all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c)) && !f.starts_with('.')
        && exts.iter().any(|e| f.to_ascii_lowercase().ends_with(e))
}

pub struct Store {
    dir: PathBuf,
    source: String,
    cache: Mutex<Option<(Instant, Vec<Value>)>>,
    pub busy: Mutex<HashMap<String, Value>>,   // id → { phase, got, total } while installing
}

impl Store {
    pub fn new(dir: PathBuf, source: Option<String>) -> Store {
        let _ = fs::create_dir_all(&dir);
        let source = source.filter(|s| !s.is_empty()).or_else(|| std::env::var("VIBINGWRAPPER_THEME_STORE").ok()).unwrap_or_else(|| RELEASE.into());
        Store { dir, source, cache: Mutex::new(None), busy: Mutex::new(HashMap::new()) }
    }
    fn is_local(&self) -> bool { !self.source.starts_with("http://") && !self.source.starts_with("https://") }
    pub fn source_label(&self) -> String { if self.is_local() { self.source.clone() } else { "GitHub Releases".into() } }
    fn preview_url(&self, f: &Value) -> Value {
        let Some(f) = f.as_str().filter(|f| valid_file(f, &[".jpg", ".jpeg", ".png", ".webp"])) else { return Value::Null };
        if self.is_local() { json!(format!("file:///{}", Path::new(&self.source).join(f).display().to_string().replace('\\', "/"))) }
        else { json!(format!("{}{}", self.source, f)) }
    }
    fn pack_info(&self, id: &str) -> Option<Value> {
        fs::read_to_string(self.dir.join(id).join(".pack.json")).ok().and_then(|s| serde_json::from_str(&s).ok())
    }

    pub fn catalog(&self, fresh: bool) -> Result<Vec<Value>, String> {
        if !fresh { if let Some((t, c)) = &*self.cache.lock().unwrap() { if t.elapsed().as_secs() < 300 { return Ok(c.clone()); } } }
        let j: Value = if self.is_local() {
            serde_json::from_str(&fs::read_to_string(Path::new(&self.source).join("themes.json")).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?
        } else {
            crate::net::get_json(&format!("{}themes.json", self.source), None).map_err(|e| format!("讀不到主題清單（{}）", e))?
        };
        let list: Vec<Value> = j["themes"].as_array().cloned().unwrap_or_default().into_iter()
            .filter(|t| t["id"].as_str().map_or(false, valid_id) && t["file"].as_str().map_or(false, |f| valid_file(f, &[".zip"]))).collect();
        *self.cache.lock().unwrap() = Some((Instant::now(), list.clone()));
        Ok(list)
    }

    // catalog × what is here. builtin = ships with the app ("bundled": false counts as not installed);
    // installed / update / available; plus the running install
    pub fn list(&self, here: &[Value], fresh: bool, en: bool) -> Result<Vec<Value>, String> {
        let cat = self.catalog(fresh)?;
        let busy = self.busy.lock().unwrap().clone();
        let mut out: Vec<Value> = cat.iter().map(|t| {
            let id = t["id"].as_str().unwrap_or("");
            let h = here.iter().find(|x| x["id"] == id);
            let status = match (self.pack_info(id), h) {
                (Some(p), _) => if p["version"] == t["version"] { "installed" } else { "update" },
                (None, Some(h)) if h["builtin"] == json!(true) && h["bundled"] != json!(false) => "builtin",
                _ => "available",
            };
            let s = |k: &str| t[k].as_str().filter(|v| !v.is_empty()).map(String::from);
            let name = (if en { s("name_en") } else { None }).or(s("name")).unwrap_or_else(|| id.to_string());
            let desc = (if en { s("description_en") } else { None }).or(s("description")).unwrap_or_default();
            let order = t["order"].as_f64().or_else(|| t["order"].as_str().and_then(|x| x.parse().ok())).unwrap_or(99.0);
            let tags: Vec<String> = t["tags"].as_array().map(|a| a.iter().take(6).map(|x| x.as_str().map(String::from).unwrap_or_else(|| x.to_string())).collect()).unwrap_or_default();
            json!({ "id": id, "name": name, "description": desc, "size": t["size"].as_f64().unwrap_or(0.0), "status": status,
                "tags": tags, "preview": self.preview_url(&t["preview"]), "order": order, "job": busy.get(id).cloned().unwrap_or(Value::Null) })
        }).collect();
        sort(&mut out);
        Ok(out)
    }

    // the library = the catalog plus every theme here that is not in it; without a network the installed ones
    // still show, with the error beside them
    pub fn library(&self, here: &[Value], fresh: bool, en: bool) -> Value {
        let (cat, error) = match self.list(here, fresh, en) { Ok(c) => (c, Value::Null), Err(e) => (vec![], json!(e)) };
        let mut items: Vec<Value> = cat.clone();
        for t in here.iter().filter(|t| !cat.iter().any(|c| c["id"] == t["id"])) {
            items.push(json!({ "id": t["id"], "name": t["name"], "description": t["description"], "size": 0,
                "status": if t["builtin"] == json!(true) { "builtin" } else { "installed" }, "order": t["order"], "job": null, "local": true }));
        }
        for it in items.iter_mut() {
            let h = here.iter().find(|x| x["id"] == it["id"]);
            if let Some(h) = h {
                if h["tags"].as_array().map_or(false, |a| !a.is_empty()) { it["tags"] = h["tags"].clone(); }
                if !h["preview"].is_null() { it["preview"] = h["preview"].clone(); }
            }
            if it["tags"].is_null() { it["tags"] = json!([]); }
            it["installed"] = json!(h.is_some());
        }
        sort(&mut items);
        json!({ "items": items, "error": error })
    }

    // on_progress({ id, phase: download | extract | done | error, got, total, msg })
    pub fn install(&self, id: &str, t: &dyn Fn(&str, &[&str]) -> String, on_progress: &dyn Fn(Value)) -> Value {
        if self.busy.lock().unwrap().contains_key(id) { return json!({ "ok": false, "msg": t("正在安裝", &[]) }); }
        let entry = match self.catalog(false) { Ok(c) => c.into_iter().find(|x| x["id"] == id), Err(e) => return json!({ "ok": false, "msg": e.chars().take(60).collect::<String>() }) };
        let Some(entry) = entry else { return json!({ "ok": false, "msg": t("清單裡沒有這個主題", &[]) }) };
        let size = entry["size"].as_u64().unwrap_or(0);
        let tell = |phase: &str, got: u64, total: u64| {
            let job = json!({ "phase": phase, "got": got, "total": total });
            self.busy.lock().unwrap().insert(id.to_string(), job.clone());
            let mut p = job; p["id"] = json!(id); on_progress(p);
        };
        tell("download", 0, size);
        let stamp = chrono::Local::now().timestamp_millis();
        let tmp = self.dir.join(format!(".tmp-{}-{}", id, stamp));
        let zip = self.dir.join(format!(".tmp-{}-{}.zip", id, stamp));
        let file = entry["file"].as_str().unwrap_or("");
        let res = (|| -> Result<u64, String> {
            let mut prog = |got: u64, total: u64| tell("download", got, if total > 0 { total } else { size });
            let (got, hash) = if self.is_local() {
                let f = Path::new(&self.source).join(file);
                let len = fs::metadata(&f).map_err(|e| e.to_string())?.len();
                crate::net::copy_hashed(fs::File::open(&f).map_err(|e| e.to_string())?, len, &zip, MAX_PACK, &mut prog)?
            } else {
                crate::net::download(&format!("{}{}", self.source, file), &zip, MAX_PACK, &mut prog)
                    .map_err(|e| if e == "too big" { t("檔案太大", &[]) } else { t("下載失敗 {0}", &[&e]) })?
            };
            tell("extract", got, got);
            if let Some(want) = entry["sha256"].as_str() { if !want.is_empty() && want != hash { return Err(t("檔案校驗不符，請重試", &[])); } }
            fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
            crate::net::unzip(&zip, &tmp)?;
            let inner = tmp.join(id);
            serde_json::from_str::<Value>(&fs::read_to_string(inner.join("theme.json")).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;   // must be a theme
            let _ = fs::write(inner.join(".pack.json"), json!({ "version": entry["version"], "sha256": entry["sha256"], "installed": chrono::Local::now().to_rfc3339() }).to_string());
            let dest = self.dir.join(id);
            let old = self.dir.join(format!("{}.old-{}", id, stamp));
            if dest.exists() { fs::rename(&dest, &old).map_err(|e| e.to_string())?; }
            fs::rename(&inner, &dest).map_err(|e| e.to_string())?;
            let _ = fs::remove_dir_all(&old);
            Ok(got)
        })();
        let _ = fs::remove_dir_all(&tmp);
        let _ = fs::remove_file(&zip);
        self.busy.lock().unwrap().remove(id);
        match res {
            Ok(got) => { on_progress(json!({ "id": id, "phase": "done", "got": got, "total": got })); json!({ "ok": true, "msg": t("已安裝", &[]) }) }
            Err(e) => { let msg: String = e.chars().take(60).collect(); on_progress(json!({ "id": id, "phase": "error", "msg": msg })); json!({ "ok": false, "msg": msg }) }
        }
    }

    // only downloaded ones can go; a built-in theme of the same id comes back
    pub fn remove(&self, id: &str, t: &dyn Fn(&str, &[&str]) -> String) -> Value {
        if !valid_id(id) || self.pack_info(id).is_none() { return json!({ "ok": false, "msg": t("不是下載的主題", &[]) }); }
        let _ = fs::remove_dir_all(self.dir.join(id));
        json!({ "ok": true, "msg": t("已移除", &[]) })
    }
}

fn sort(v: &mut [Value]) {
    v.sort_by(|a, b| a["order"].as_f64().unwrap_or(99.0).partial_cmp(&b["order"].as_f64().unwrap_or(99.0)).unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| a["id"].as_str().cmp(&b["id"].as_str())));
}
