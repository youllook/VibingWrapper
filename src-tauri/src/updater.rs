// 自動更新: Rust port of tools/updater.js (2026-11-07). The zip build has no installer, so this does it by hand:
//   check   → GitHub Releases (pre-releases count), highest vX.Y.Z above ours that carries a Tauri zip
//             (*-tauri-win-x64.zip, so an Electron zip is never swapped over a Tauri folder)
//   install → download → check size and sha256 (the API's asset digest) → unzip with System32's tar into %TEMP% →
//             a PowerShell started outside our process waits for us to exit, copies the new files over the program
//             folder and starts VibingWrapper.exe again.
// Settings, logs and downloaded themes live in %APPDATA%\vibing-wrapper, so they survive.
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Mutex;

const API: &str = "https://api.github.com/repos/youllook/VibingWrapper/releases?per_page=15";
const ASSET_END: &str = "-tauri-win-x64.zip";

fn ver(s: &str) -> Option<[u64; 3]> {
    let p: Vec<u64> = s.trim_start_matches('v').split('.').map(|x| x.parse().ok()).collect::<Option<_>>()?;
    if p.len() == 3 { Some([p[0], p[1], p[2]]) } else { None }
}
fn newer(a: &str, b: &str) -> bool { match (ver(a), ver(b)) { (Some(x), Some(y)) => x > y, _ => false } }

pub struct Updater {
    pub current: String,
    pub program_dir: Option<PathBuf>,   // None when not running from an unpacked build (dev / target\release)
    state: Mutex<Value>,
    release: Mutex<Option<Value>>,
}

const SWAP: &str = r#"param([int]$Wait, [string]$Exe, [string]$Src, [string]$Dir, [string]$Tmp)
$log = Join-Path $env:TEMP 'vibingwrapper-update.log'
function Log([string]$m) { Add-Content -LiteralPath $log -Value ((Get-Date -Format 'HH:mm:ss') + ' ' + $m) -Encoding UTF8 }
Log "swap wait=$Wait src=$Src dir=$Dir"
try { Wait-Process -Id $Wait -Timeout 30 -ErrorAction Stop } catch {}
for ($i = 0; $i -lt 60; $i++) {
  if (-not @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Exe }).Count) { break }
  Start-Sleep -Milliseconds 500
}
Start-Sleep -Seconds 1
$ok = $false
for ($t = 0; $t -lt 5 -and -not $ok; $t++) {
  robocopy $Src $Dir /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  $ok = $LASTEXITCODE -lt 8
  if (Test-Path -LiteralPath (Join-Path $Src 'themes')) {
    robocopy (Join-Path $Src 'themes') (Join-Path $Dir 'themes') /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    $ok = $ok -and $LASTEXITCODE -lt 8
  }
  Log "robocopy try $t ok=$ok"
  if (-not $ok) { Start-Sleep -Seconds 2 }
}
Start-Process -FilePath $Exe -WorkingDirectory $Dir
Log ('restarted ok=' + $ok)
Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
"#;

impl Updater {
    pub fn new(current: String, program_dir: Option<PathBuf>) -> Updater {
        Updater { state: Mutex::new(json!({ "phase": "idle", "current": current })), current, program_dir, release: Mutex::new(None) }
    }
    pub fn status(&self) -> Value { self.state.lock().unwrap().clone() }
    fn set(&self, v: Value, on_change: &dyn Fn(Value)) {
        let s = { let mut s = self.state.lock().unwrap(); for (k, x) in v.as_object().unwrap() { s[k] = x.clone(); } s["current"] = json!(self.current); s.clone() };
        on_change(s);
    }
    fn phase(&self) -> String { self.state.lock().unwrap()["phase"].as_str().unwrap_or("").to_string() }

    pub fn check(&self, t: &dyn Fn(&str, &[&str]) -> String, on_change: &dyn Fn(Value)) -> Value {
        if ["downloading", "installing"].contains(&self.phase().as_str()) { return self.status(); }
        self.set(json!({ "phase": "checking", "msg": "" }), on_change);
        let now = chrono::Local::now().timestamp_millis();
        match crate::net::get_json(API, Some("application/vnd.github+json")) {
            Err(e) => self.set(json!({ "phase": "error", "msg": t("檢查失敗：{0}", &[&e.chars().take(40).collect::<String>()]) }), on_change),
            Ok(list) => {
                let best = list.as_array().cloned().unwrap_or_default().into_iter()
                    .filter(|x| x["draft"] != json!(true) && x["tag_name"].as_str().and_then(ver).is_some())
                    .filter_map(|x| x["assets"].as_array().and_then(|a| a.iter().find(|a| a["name"].as_str().map_or(false, |n| n.ends_with(ASSET_END))).cloned()).map(|a| (x, a)))
                    .max_by(|a, b| ver(a.0["tag_name"].as_str().unwrap()).cmp(&ver(b.0["tag_name"].as_str().unwrap())));
                match best {
                    Some((x, a)) if newer(x["tag_name"].as_str().unwrap_or(""), &self.current) => {
                        let version = x["tag_name"].as_str().unwrap_or("").trim_start_matches('v').to_string();
                        let sha = a["digest"].as_str().and_then(|d| d.strip_prefix("sha256:")).map(String::from);
                        *self.release.lock().unwrap() = Some(json!({ "version": version, "url": a["browser_download_url"], "size": a["size"], "sha256": sha }));
                        self.set(json!({ "phase": "available", "version": version, "size": a["size"], "canInstall": self.program_dir.is_some(), "checkedAt": now }), on_change);
                    }
                    _ => { *self.release.lock().unwrap() = None; self.set(json!({ "phase": "latest", "checkedAt": now }), on_change); }
                }
            }
        }
        self.status()
    }

    // Ok(()) = the swap script is scheduled: the caller exits the app
    pub fn install(&self, t: &dyn Fn(&str, &[&str]) -> String, on_change: &dyn Fn(Value)) -> Result<(), ()> {
        let rel = self.release.lock().unwrap().clone();
        let (Some(rel), Some(dir)) = (rel, self.program_dir.clone()) else { return Err(()) };
        if ["downloading", "installing"].contains(&self.phase().as_str()) { return Err(()); }
        let version = rel["version"].as_str().unwrap_or("").to_string();
        let tmp = std::env::temp_dir().join(format!("vibingwrapper-update-{}-{}", version, chrono::Local::now().timestamp_millis()));
        let zip = tmp.with_extension("zip");
        let size = rel["size"].as_u64().unwrap_or(0);
        self.set(json!({ "phase": "downloading", "got": 0, "total": size }), on_change);
        let r = (|| -> Result<(), String> {
            let (got, hash) = crate::net::download(rel["url"].as_str().unwrap_or(""), &zip, 500 * 1024 * 1024,
                &mut |got, _| self.set(json!({ "got": got }), on_change)).map_err(|e| t("下載失敗 {0}", &[&e]))?;
            if size > 0 && got != size { return Err(t("檔案大小不符，請重試", &[])); }
            if let Some(want) = rel["sha256"].as_str() { if want != hash { return Err(t("檔案校驗不符，請重試", &[])); } }
            self.set(json!({ "phase": "installing", "got": got }), on_change);
            std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
            crate::net::unzip(&zip, &tmp)?;
            // the zip holds one folder VibingWrapper-x.y.z-tauri/ with the exe in it
            let inner = std::fs::read_dir(&tmp).map_err(|e| e.to_string())?.flatten().map(|d| d.path())
                .find(|p| p.join("VibingWrapper.exe").is_file()).ok_or_else(|| t("壓縮檔裡找不到 VibingWrapper.exe", &[]))?;
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            crate::desk::run_detached_ps(SWAP, &format!("vibingwrapper-update-{}.ps1", std::process::id()), &[
                ("Wait", std::process::id().to_string()), ("Exe", exe.display().to_string()), ("Src", inner.display().to_string()),
                ("Dir", dir.display().to_string()), ("Tmp", tmp.display().to_string())])?;
            Ok(())
        })();
        let _ = std::fs::remove_file(&zip);
        match r {
            Ok(()) => Ok(()),
            Err(e) => { let _ = std::fs::remove_dir_all(&tmp); self.set(json!({ "phase": "error", "msg": e.chars().take(40).collect::<String>() }), on_change); Err(()) }
        }
    }
}
