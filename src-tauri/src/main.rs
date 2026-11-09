// VibingWrapper shell on Tauri 2 (2026-11-07): Rust port of main.js. A small transparent HUD in the top-right
// corner, the weather wallpaper behind the desktop icons, the hook bridge on 127.0.0.1:47321, the tray, the theme
// library and help windows, 收桌面 (Ctrl+Alt+D), 老闆鍵, one-click hook install, auto update and uninstall.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;
mod desk;
mod hooks;
mod net;
mod store;
mod uninstall;
mod updater;
mod wallpaper;

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const HUD_W: f64 = 280.0;
const HUD_H: f64 = 520.0;   // room for the settings menu to open downwards
const TIME_MODES: [&str; 3] = ["auto", "day", "night"];
const LANGS: [&str; 3] = ["auto", "zh", "en"];
const ICONS_KEY: &str = "Control+Alt+D";
const BOSS_DEFAULT: &str = "Control+Alt+B";

#[derive(Default)]
struct Boss { key: String, registered: bool, hidden: bool, shown: Vec<String>, icons_were_hidden: bool }

struct Core {
    data_dir: PathBuf,
    settings: Mutex<Value>,
    bridge: Mutex<Option<Arc<bridge::Bridge>>>,
    store: store::Store,
    updater: updater::Updater,
    en: Arc<AtomicBool>,
    en_table: HashMap<String, String>,
    interactive: AtomicBool,
    menu_open: AtomicBool,
    icons_hotkey: AtomicBool,
    boss: Mutex<Boss>,
    version: String,
}

impl Core {
    fn get(&self, k: &str) -> Value { self.settings.lock().unwrap().get(k).cloned().unwrap_or(Value::Null) }
    fn set(&self, k: &str, v: Value) {
        let mut s = self.settings.lock().unwrap();
        s[k] = v;
        let _ = std::fs::write(self.data_dir.join("settings.json"), serde_json::to_string_pretty(&*s).unwrap());
    }
    fn bridge(&self) -> Arc<bridge::Bridge> { self.bridge.lock().unwrap().clone().expect("bridge started") }
    // T('中文原文', args): English from tools/i18n.js's table when the language is English
    fn t(&self, s: &str, args: &[&str]) -> String {
        let base = if self.en.load(Ordering::Relaxed) { self.en_table.get(s).map(String::as_str).unwrap_or(s) } else { s };
        let mut out = base.to_string();
        for (i, a) in args.iter().enumerate() { out = out.replace(&format!("{{{}}}", i), a); }
        out
    }
    fn lang_setting(&self) -> String { self.get("lang").as_str().filter(|l| LANGS.contains(l)).unwrap_or("auto").to_string() }
    fn apply_lang(&self) {
        let l = self.lang_setting();
        let zh = if l == "auto" { sys_locale::get_locales().next().map_or(false, |x| x.to_lowercase().starts_with("zh")) } else { l == "zh" };
        self.en.store(!zh, Ordering::Relaxed);
    }
    fn is_en(&self) -> bool { self.en.load(Ordering::Relaxed) }
    fn lang(&self) -> &'static str { if self.is_en() { "en" } else { "zh" } }
    fn time_mode(&self) -> String {
        match self.get("timeMode").as_str() { Some(m) if TIME_MODES.contains(&m) => m.into(), _ => if self.get("dayMode") == json!(true) { "day".into() } else { "auto".into() } }
    }
    fn style(&self) -> String { self.get("wallpaperStyle").as_str().unwrap_or("").to_string() }
    fn recent(&self) -> Vec<String> {
        let b = self.bridge();
        self.get("recentThemes").as_array().map(|a| a.iter().filter_map(|v| v.as_str()).filter(|id| b.theme_url(id).is_some()).map(String::from).collect()).unwrap_or_default()
    }
    fn wallpaper_url(&self) -> Option<String> {
        let b = self.bridge();
        let u = b.theme_url(&self.style()).or_else(|| b.themes().first().and_then(|t| t["url"].as_str().map(String::from)))?;
        let m = self.time_mode();
        Some(if m != "auto" { format!("{}{}{}=1", u, if u.contains('?') { "&" } else { "?" }, m) } else { u })
    }
    fn update_mode(&self) -> &'static str { if self.get("updateMode") == json!("manual") { "manual" } else { "auto" } }
    fn boss_status(&self) -> Value { let b = self.boss.lock().unwrap(); json!({ "key": b.key, "registered": b.registered, "hidden": b.hidden }) }
    // 除錯紀錄 → <data>/debug.log (send this file when something won't work); restarted above 1 MB
    fn log(&self, m: &str) { log_to(&self.data_dir, m); }
}

fn log_to(dir: &std::path::Path, m: &str) {
    let f = dir.join("debug.log");
    if std::fs::metadata(&f).map_or(false, |x| x.len() > 1 << 20) { let _ = std::fs::rename(&f, dir.join("debug.old.log")); }
    if let Ok(mut h) = std::fs::OpenOptions::new().create(true).append(true).open(&f) {
        let _ = writeln!(h, "{} {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), m);
    }
}

// Something we cannot run without: write it down, say so in a box (both languages: the settings may not be read
// yet), and stop. Nothing should ever just vanish without a word.
fn fatal(dir: &std::path::Path, what: &str, zh: &str, en: &str) -> ! {
    log_to(dir, &format!("[fatal] {}", what));
    let log = dir.join("debug.log");
    desk::ask("VibingWrapper", &format!("{}\n\n{}\n\n{}\n{}", zh, en, what.chars().take(300).collect::<String>(), log.display()), false, true);
    desk::reveal(&log);
    std::process::exit(1);
}

fn core(app: &AppHandle) -> tauri::State<'_, Arc<Core>> { app.state::<Arc<Core>>() }
fn tr(app: &AppHandle) -> impl Fn(&str, &[&str]) -> String + '_ { move |s, a| core(app).t(s, a) }

/* ---------------- wallpaper ---------------- */
fn refresh_wallpaper(app: &AppHandle) {
    let c = core(app);
    wallpaper::set_enabled(app, c.get("weatherWallpaper") != json!(false), c.wallpaper_url());
}
fn set_wallpaper_style(app: &AppHandle, style: &str) -> String {
    let c = core(app);
    if c.bridge().theme_url(style).is_none() { return c.style(); }
    let mut recent: Vec<String> = vec![style.to_string()];
    recent.extend(c.recent().into_iter().filter(|x| x != style));
    recent.truncate(4);
    c.set("wallpaperStyle", json!(style));
    c.set("recentThemes", json!(recent));
    refresh_wallpaper(app);
    rebuild_tray(app);
    style.to_string()
}

/* ---------------- HUD ---------------- */
fn set_interactive(app: &AppHandle, on: bool) {
    core(app).interactive.store(on, Ordering::Relaxed);
    if let Some(w) = app.get_webview_window("hud") { let _ = w.set_ignore_cursor_events(!on); }
}
// the gear menu opens downwards over other windows: lift the HUD above them while it is open
fn menu_on_top(app: &AppHandle, open: bool) {
    let Some(w) = app.get_webview_window("hud") else { return };
    let _ = w.set_always_on_top(open || core(app).get("alwaysOnTop") == json!(true));
}
fn page_vars(c: &Core) -> String { format!("window.__VW_LANG={:?};window.__VW_VERSION={:?};\n{}\n", c.lang(), c.version, include_str!("lang.js")) }
// every webview keeps its WebView2 cache in <data>/webview (else it lands beside the exe); every webview of one
// process must be built with the same options, so each builder goes through here
static WEBVIEW_DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
pub fn with_args<'a, R: tauri::Runtime, M: Manager<R>>(b: WebviewWindowBuilder<'a, R, M>) -> WebviewWindowBuilder<'a, R, M> {
    // Tauri's own default flags, plus: keep painting when Chromium thinks a window is covered. The HUD is a small
    // transparent click-through window; native occlusion tracking can mark it hidden and leave it blank
    let b = b.additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows");
    match WEBVIEW_DIR.get() { Some(d) => b.data_directory(d.clone()), None => b }
}
fn only_app_pages(u: &tauri::Url) -> bool { u.scheme() == "tauri" || u.host_str() == Some("tauri.localhost") }

fn create_hud(app: &AppHandle) -> tauri::Result<()> {
    let c = core(app);
    let win = with_args(WebviewWindowBuilder::new(app, "hud", WebviewUrl::App("prototype/hud.html".into())))
        // not minimizable (as in the Electron build): Win+D / 顯示桌面 would minimize it, and with no taskbar button
        // there is no way to bring it back
        .title("VibingWrapper").transparent(true).decorations(false).shadow(false).resizable(false).skip_taskbar(true)
        .minimizable(false).maximizable(false)
        .always_on_top(c.get("alwaysOnTop") == json!(true)).focused(false).visible(false)
        .inner_size(HUD_W, HUD_H).initialization_script(&(page_vars(&c) + include_str!("shim.js")))
        .on_navigation(only_app_pages)   // keep links out of the HUD
        .build()?;
    place_hud(app);
    c.interactive.store(false, Ordering::Relaxed);
    let _ = win.set_ignore_cursor_events(true);
    let _ = win.show();
    Ok(())
}
// top-right corner of the primary screen's work area
fn place_hud(app: &AppHandle) {
    let (Some(w), Some(m)) = (app.get_webview_window("hud"), app.primary_monitor().ok().flatten()) else { return };
    let wa = m.work_area();
    let width = (HUD_W * m.scale_factor()).round() as i32;
    let _ = w.set_position(tauri::PhysicalPosition::new(wa.position.x + wa.size.width as i32 - width, wa.position.y));
}

// Electron forwarded mouse moves to the click-through HUD; here the cursor is polled while the HUD ignores the
// mouse and handed to the page (shim.js) whenever it is over the window
#[cfg(windows)]
fn cursor_pump(app: AppHandle) {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
    std::thread::spawn(move || {
        let mut last = (i32::MIN, i32::MIN);
        loop {
            std::thread::sleep(Duration::from_millis(40));
            if core(&app).interactive.load(Ordering::Relaxed) { last = (i32::MIN, i32::MIN); continue; }
            let Some(w) = app.get_webview_window("hud") else { continue };
            let mut p = POINT { x: 0, y: 0 };
            if unsafe { GetCursorPos(&mut p) } == 0 { continue; }
            let (Ok(pos), Ok(size), Ok(scale)) = (w.outer_position(), w.outer_size(), w.scale_factor()) else { continue };
            let inside = p.x >= pos.x && p.y >= pos.y && p.x < pos.x + size.width as i32 && p.y < pos.y + size.height as i32;
            if !inside || (p.x, p.y) == last { continue; }
            last = (p.x, p.y);
            let _ = app.emit_to("hud", "vw:cursor", json!({ "x": (p.x - pos.x) as f64 / scale, "y": (p.y - pos.y) as f64 / scale }));
        }
    });
}
#[cfg(not(windows))]
fn cursor_pump(_app: AppHandle) {}

/* ---------------- windows: theme library, help ---------------- */
fn open_store(app: &AppHandle, focus: Option<String>) {
    if let Some(w) = app.get_webview_window("store") {
        let _ = w.unminimize(); let _ = w.show(); let _ = w.set_focus();
        let _ = app.emit_to("store", "store:focus", focus);
        return;
    }
    let c = core(app);
    let init = format!("{}window.__VW_FOCUS={};\n{}", page_vars(&c), serde_json::to_string(&focus).unwrap(), include_str!("store-shim.js"));
    let r = with_args(WebviewWindowBuilder::new(app, "store", WebviewUrl::App("tools/store.html".into())))
        .title(c.t("主題庫 · VibingWrapper", &[])).inner_size(820.0, 680.0).min_inner_size(460.0, 400.0)
        .background_color(tauri::window::Color(0xee, 0xf3, 0xf8, 255)).initialization_script(&init).on_navigation(only_app_pages).build();
    if let Err(e) = r { c.log(&format!("store window: {}", e)); }
}
fn open_help(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("help") { let _ = w.unminimize(); let _ = w.show(); let _ = w.set_focus(); return; }
    let c = core(app);
    let r = with_args(WebviewWindowBuilder::new(app, "help", WebviewUrl::App("tools/help.html".into())))
        .title(c.t("說明 · VibingWrapper", &[])).inner_size(520.0, 640.0).min_inner_size(380.0, 360.0)
        .background_color(tauri::window::Color(0xee, 0xf3, 0xf8, 255)).initialization_script(&page_vars(&c)).on_navigation(only_app_pages).build();
    if let Err(e) = r { c.log(&format!("help window: {}", e)); }
}

fn set_lang(app: &AppHandle, l: &str) -> String {
    let c = core(app);
    let before = c.lang();
    c.set("lang", json!(if LANGS.contains(&l) { l } else { "auto" }));
    c.apply_lang();
    if c.lang() != before {   // the pages read their language once: rebuild the HUD, close the other windows
        for l in ["hud", "store", "help"] { if let Some(w) = app.get_webview_window(l) { let _ = w.destroy(); } }
        let a = app.clone();
        let _ = app.run_on_main_thread(move || { let _ = create_hud(&a); });
        rebuild_tray(app);
    }
    c.lang_setting()
}

// started outside our process a moment later, so the single-instance lock is free by then
fn relaunch(app: &AppHandle) {
    if let Ok(exe) = std::env::current_exe() {
        let _ = desk::hidden("powershell").args(["-NoProfile", "-WindowStyle", "Hidden", "-Command",
            "Start-Sleep -Milliseconds 900; Start-Process -FilePath $env:VW_EXE"]).env("VW_EXE", exe).spawn();
    }
    app.exit(0);
}

/* ---------------- 收桌面 / 老闆鍵 ---------------- */
fn toggle_icons(app: &AppHandle) -> bool { let v = desk::toggle_icons(); rebuild_tray(app); v }

fn parse_key(k: &str) -> Option<Shortcut> { k.parse::<Shortcut>().ok() }
fn register_key(app: &AppHandle, k: &str) -> bool { parse_key(k).map_or(false, |s| app.global_shortcut().register(s).is_ok()) }
fn unregister_key(app: &AppHandle, k: &str) { if let Some(s) = parse_key(k) { let _ = app.global_shortcut().unregister(s); } }

// everything goes except the HUD, which shrinks to its gear (the way back); the tray icon goes too; desktop icons
// hidden by 收桌面 come back. The same key restores exactly what was showing.
fn boss_toggle(app: &AppHandle) {
    let c = core(app);
    let hide = !c.boss.lock().unwrap().hidden;
    if hide {
        let shown: Vec<String> = app.webview_windows().into_iter()
            .filter(|(l, w)| l != "hud" && w.is_visible().unwrap_or(false))
            .map(|(l, w)| { let _ = w.hide(); l }).collect();
        let iw = !desk::icons_visible();
        if iw { desk::toggle_icons(); }
        { let mut b = c.boss.lock().unwrap(); b.hidden = true; b.shown = shown; b.icons_were_hidden = iw; }
        let _ = app.remove_tray_by_id("main");
    } else {
        let (shown, iw) = { let mut b = c.boss.lock().unwrap(); b.hidden = false; (std::mem::take(&mut b.shown), b.icons_were_hidden) };
        for l in shown { if let Some(w) = app.get_webview_window(&l) { let _ = w.show(); } }
        if iw && desk::icons_visible() { desk::toggle_icons(); }
        c.boss.lock().unwrap().icons_were_hidden = false;
        if app.tray_by_id("main").is_none() { let _ = make_tray(app); }
    }
    let _ = app.emit_to("hud", "pet:boss-state", c.boss_status());
}
// try a new key; on failure (taken / invalid) the old one keeps working
fn set_boss_key(app: &AppHandle, acc: &str) -> Value {
    let c = core(app);
    let (old, reg) = { let b = c.boss.lock().unwrap(); (b.key.clone(), b.registered) };
    if acc.is_empty() || parse_key(acc).is_none() { let mut s = c.boss_status(); s["ok"] = json!(false); return s; }
    if acc == old && reg { let mut s = c.boss_status(); s["ok"] = json!(true); return s; }
    if reg { unregister_key(app, &old); }
    let ok = register_key(app, acc);
    { let mut b = c.boss.lock().unwrap(); if ok { b.key = acc.into(); b.registered = true; } else { b.registered = register_key(app, &old); } }
    if ok { c.set("bossKey", json!(acc)); }
    rebuild_tray(app);
    let mut s = c.boss_status(); s["ok"] = json!(ok); s
}
// while the gear menu records a new key, the current one must not fire
fn boss_capture(app: &AppHandle, on: bool) {
    let c = core(app);
    let (key, reg) = { let b = c.boss.lock().unwrap(); (b.key.clone(), b.registered) };
    if on && reg { unregister_key(app, &key); c.boss.lock().unwrap().registered = false; }
    else if !on && !reg { let r = register_key(app, &key); c.boss.lock().unwrap().registered = r; }
}
fn pretty_key(k: &str) -> String { k.replace("Control", "Ctrl").replace("Super", "Win") }

/* ---------------- update / uninstall ---------------- */
fn update_changed(app: &AppHandle, st: Value) {
    let mut st = st;
    st["mode"] = json!(core(app).update_mode());
    let _ = app.emit_to("hud", "pet:update-state", st);
    rebuild_tray(app);
}
fn update_install(app: &AppHandle) {
    let c = core(app);
    let a = app.clone();
    if c.updater.install(&tr(app), &move |s| update_changed(&a, s)).is_ok() {
        c.log("update downloaded, swap scheduled → exit");
        std::thread::sleep(Duration::from_millis(300));
        app.exit(0);
    }
}
// checks a little after start, then every 6 hours. 自動: a newer build installs itself, but only while Claude is
// idle and the gear menu is closed, since installing restarts the app; 手動 only shows it in the menu
fn updater_loop(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(15));
        let mut since_check = Duration::from_secs(6 * 3600);
        loop {
            let c = core(&app);
            if since_check >= Duration::from_secs(6 * 3600) || c.updater.status()["phase"] == "error" && since_check >= Duration::from_secs(3600) {
                let a = app.clone();
                c.updater.check(&tr(&app), &move |s| update_changed(&a, s));
                since_check = Duration::ZERO;
            }
            let st = c.updater.status();
            if st["phase"] == "available" && st["canInstall"] == json!(true) && c.update_mode() == "auto"
                && c.bridge().current() == "clear" && !c.menu_open.load(Ordering::Relaxed) && !c.boss.lock().unwrap().hidden {
                update_install(&app);
            }
            std::thread::sleep(Duration::from_secs(60));
            since_check += Duration::from_secs(60);
        }
    });
}

fn run_uninstall(app: &AppHandle) -> bool {
    let c = core(app);
    let t = tr(app);
    let program_dir = c.updater.program_dir.clone();
    let web_data = app.path().app_local_data_dir().ok();
    uninstall::log(&format!("uninstall asked ({}, {:?})", c.version, program_dir));
    let title = t("解除安裝 VibingWrapper", &[]);
    let detail = [t("要解除安裝 VibingWrapper 嗎？", &[]), String::new(), t("會做這些事：", &[]),
        t("・從 Claude Code／Codex 設定移除 VibingWrapper 的 hook（其他設定不動）", &[]), t("・關閉開機自動啟動", &[]),
        t("・刪除設定與紀錄（{0}）", &[&c.data_dir.display().to_string()]),
        match &program_dir { Some(d) => t("・刪除程式檔案（{0}）", &[&d.display().to_string()]), None => t("・開發模式：不刪程式檔案", &[]) },
        String::new(), t("完成後程式會關閉。", &[])].join("\n");
    if !desk::ask(&title, &detail, true, true) { uninstall::log("cancelled"); return false; }
    for a in [hooks::claude(), hooks::codex()] {
        let (ok, msg) = a.uninstall(&t);
        uninstall::log(&format!("{} hooks: {}", a.name, msg));
        if !ok {
            desk::ask(&title, &format!("{}\n\n{}", t("沒辦法移除 {0} hook，已停止解除安裝。", &[a.name]),
                t("{0}：{1}\n修好這個檔案後再試一次，或手動刪掉裡面含 127.0.0.1:47321 的 hook。", &[&msg, &a.file.display().to_string()])), false, true);
            return false;
        }
    }
    desk::set_autostart(false);
    if !desk::icons_visible() { desk::toggle_icons(); }
    desk::unregister();
    uninstall::log("hooks out, login item off, icons checked, unregistered");
    let exe = std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default();
    let dash = |p: Option<&PathBuf>| p.map(|p| p.display().to_string()).unwrap_or_else(|| "-".into());
    let r = desk::run_detached_ps(uninstall::CLEANUP, &format!("vibingwrapper-uninstall-{}.ps1", std::process::id()), &[
        ("Wait", std::process::id().to_string()), ("Exe", exe), ("Data", c.data_dir.display().to_string()),
        ("Data2", dash(web_data.as_ref())), ("Dir", dash(program_dir.as_ref())), ("Names", uninstall::SHIPPED.join("|"))]);
    if let Err(e) = r {
        uninstall::log(&format!("cleanup launch failed: {}", e));
        desk::ask(&title, &format!("{}\n\n{}", t("hook 已移除，但沒辦法自動刪除檔案。", &[]),
            t("程式關閉後，請手動刪除：\n{0}", &[&format!("{}{}", c.data_dir.display(), program_dir.map(|d| format!("\n{}", d.display())).unwrap_or_default())])), false, true);
    } else { uninstall::log("cleanup launched"); }
    app.exit(0);
    true
}
fn uninstall_async(app: &AppHandle) { let a = app.clone(); std::thread::spawn(move || { run_uninstall(&a); }); }

/* ---------------- tray ---------------- */
fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let c = core(app);
    let t = |s: &str| c.t(s, &[]);
    let sep = || PredefinedMenuItem::separator(app);
    let menu = Menu::new(app)?;
    let hk = c.icons_hotkey.load(Ordering::Relaxed);
    menu.append(&MenuItem::with_id(app, "icons", t("桌面圖示") + &if hk { "\tCtrl+Alt+D".to_string() } else { c.t("（{0} 被占用）", &["Ctrl+Alt+D"]) }, true, None::<&str>)?)?;
    let (bk, breg, bhid) = { let b = c.boss.lock().unwrap(); (pretty_key(&b.key), b.registered, b.hidden) };
    menu.append(&MenuItem::with_id(app, "boss", t(if bhid { "取消隱藏" } else { "還原桌面" }) + &if breg { format!("\t{}", bk) } else { c.t("（{0} 被占用）", &[&bk]) }, true, None::<&str>)?)?;
    menu.append(&sep()?)?;
    menu.append(&CheckMenuItem::with_id(app, "wallpaper", t("動態桌布"), true, c.get("weatherWallpaper") != json!(false), None::<&str>)?)?;
    // 桌布: the recent picks plus the current one, then 主題庫… for the rest
    let style = c.style();
    let recent = c.recent();
    let themes = Submenu::with_id(app, "themes", t("桌布"), true)?;
    for th in c.bridge().themes().iter().filter(|th| th["id"] == style.as_str() || recent.iter().any(|r| th["id"] == r.as_str())) {
        let id = th["id"].as_str().unwrap_or("");
        themes.append(&CheckMenuItem::with_id(app, format!("theme:{}", id), th["name"].as_str().unwrap_or(id), true, id == style, None::<&str>)?)?;
    }
    themes.append(&sep()?)?;
    themes.append(&MenuItem::with_id(app, "store2", t("主題庫…"), true, None::<&str>)?)?;
    menu.append(&themes)?;
    menu.append(&CheckMenuItem::with_id(app, "ontop", t("永遠在最上層"), true, c.get("alwaysOnTop") == json!(true), None::<&str>)?)?;
    menu.append(&CheckMenuItem::with_id(app, "autostart", t("開機自動啟動"), true, desk::autostart(), None::<&str>)?)?;
    let cs = hooks::claude().status();
    menu.append(&MenuItem::with_id(app, "hook:claude", t(if cs == "on" { "Claude hook 已安裝" } else { "安裝 Claude hook" }), cs != "on", None::<&str>)?)?;
    let xs = hooks::codex().status();
    if xs != "none" { menu.append(&MenuItem::with_id(app, "hook:codex", t(if xs == "on" { "Codex hook 已安裝" } else { "安裝 Codex hook" }), xs != "on", None::<&str>)?)?; }
    let langs = Submenu::with_id(app, "langs", if c.is_en() { "Language".to_string() } else { "語言 · Language".to_string() }, true)?;
    let ls = c.lang_setting();
    for (k, label) in [("auto", t("自動")), ("zh", "中文".into()), ("en", "English".into())] {
        langs.append(&CheckMenuItem::with_id(app, format!("lang:{}", k), label, true, ls == k, None::<&str>)?)?;
    }
    menu.append(&langs)?;
    menu.append(&sep()?)?;
    menu.append(&MenuItem::with_id(app, "store", t("主題庫…"), true, None::<&str>)?)?;
    let up = c.updater.status();
    if up["phase"] == "available" {
        menu.append(&MenuItem::with_id(app, "update", c.t("更新到 {0}", &[up["version"].as_str().unwrap_or("")]), up["canInstall"] == json!(true), None::<&str>)?)?;
    }
    menu.append(&MenuItem::with_id(app, "help", t("說明"), true, None::<&str>)?)?;
    menu.append(&sep()?)?;
    menu.append(&MenuItem::with_id(app, "log", t("開啟除錯紀錄"), true, None::<&str>)?)?;
    if cfg!(debug_assertions) { menu.append(&MenuItem::with_id(app, "devtools", t("開發者工具"), true, None::<&str>)?)?; }
    menu.append(&MenuItem::with_id(app, "reload", t("重新載入"), true, None::<&str>)?)?;
    menu.append(&sep()?)?;
    menu.append(&MenuItem::with_id(app, "restart", t("重新啟動"), true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "uninstall", t("解除安裝…"), true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "quit", t("結束"), true, None::<&str>)?)?;
    Ok(menu)
}
// menus belong to the main thread; callers may be on any thread
fn rebuild_tray(app: &AppHandle) {
    let a = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let (Some(t), Ok(m)) = (a.tray_by_id("main"), build_tray_menu(&a)) { let _ = t.set_menu(Some(m)); }
    });
}
fn make_tray(app: &AppHandle) -> tauri::Result<()> {
    TrayIconBuilder::with_id("main").icon(app.default_window_icon().unwrap().clone()).tooltip("VibingWrapper")
        .menu(&build_tray_menu(app)?)
        .on_menu_event(|app, e| on_tray(app, e.id().as_ref()))
        .build(app)?;
    Ok(())
}
fn on_tray(app: &AppHandle, id: &str) {
    let c = core(app);
    match id {
        "icons" => { toggle_icons(app); }
        "boss" => boss_toggle(app),
        "wallpaper" => { c.set("weatherWallpaper", json!(c.get("weatherWallpaper") == json!(false))); refresh_wallpaper(app); }
        "ontop" => { c.set("alwaysOnTop", json!(c.get("alwaysOnTop") != json!(true))); menu_on_top(app, c.menu_open.load(Ordering::Relaxed)); }
        "autostart" => desk::set_autostart(!desk::autostart()),
        "hook:claude" | "hook:codex" => { hooks::by_name(&id[5..]).install(&tr(app)); }
        "store" | "store2" => open_store(app, None),
        "help" => open_help(app),
        "update" => { let a = app.clone(); std::thread::spawn(move || update_install(&a)); }
        "log" => desk::reveal(&c.data_dir.join("debug.log")),
        "devtools" => { #[cfg(debug_assertions)] if let Some(w) = app.get_webview_window("hud") { w.open_devtools(); } }
        "reload" => { if let Some(w) = app.get_webview_window("hud") { let _ = w.eval("location.reload()"); } set_interactive(app, false); }
        "restart" => relaunch(app),
        "uninstall" => uninstall_async(app),
        "quit" => app.exit(0),
        _ => {
            if let Some(s) = id.strip_prefix("theme:") { set_wallpaper_style(app, s); }
            else if let Some(l) = id.strip_prefix("lang:") { set_lang(app, l); }
        }
    }
    rebuild_tray(app);
}

/* ---------------- the HUD / library pages → shell ---------------- */
// one command for every channel, on a worker thread: some of them download or wait on dialogs
#[tauri::command]
async fn pet(app: AppHandle, name: String, arg: Value) -> Value {
    tauri::async_runtime::spawn_blocking(move || dispatch(&app, &name, arg)).await.unwrap_or(Value::Null)
}

fn dispatch(app: &AppHandle, name: &str, arg: Value) -> Value {
    let c = core(app);
    let s = arg.as_str().unwrap_or("").to_string();
    #[cfg(debug_assertions)] eprintln!("[pet] {} {}", name, arg);
    let here = || c.bridge().themes();
    match name {
        "pet:interactive" => { set_interactive(app, arg == json!(true)); Value::Null }
        "pet:menu-open" => { let o = arg == json!(true); c.menu_open.store(o, Ordering::Relaxed); menu_on_top(app, o); Value::Null }
        "pet:wallpaper-style" => json!(c.style()),
        "pet:wallpaper-styles" => json!(here().iter().map(|t| json!({ "id": t["id"], "name": t["name"] })).collect::<Vec<_>>()),
        "pet:set-wallpaper-style" | "store:use" => json!(set_wallpaper_style(app, &s)),
        "pet:recent-themes" => json!(c.recent()),
        "pet:theme-catalog" => match c.store.list(&here(), false, c.is_en()) { Ok(l) => json!(l), Err(e) => json!({ "error": e }) },
        "pet:open-store" => { open_store(app, arg.as_str().map(String::from)); Value::Null }
        "pet:open-help" => { open_help(app); Value::Null }
        "store:catalog" => {
            let mut r = c.store.library(&here(), arg == json!(true), c.is_en());
            r["source"] = json!(c.store.source_label()); r["current"] = json!(c.style()); r["recent"] = json!(c.recent());
            r
        }
        "store:install" => {
            let a = app.clone();
            let r = c.store.install(&s, &tr(app), &move |p| { let _ = a.emit_to("store", "store:progress", p); });
            if r["ok"] == json!(true) { rebuild_tray(app); }
            r
        }
        "store:remove" => {
            let r = c.store.remove(&s, &tr(app));
            if r["ok"] == json!(true) && c.style() == s { refresh_wallpaper(app); }   // falls back if it is gone
            rebuild_tray(app);
            r
        }
        "pet:version" => json!(c.version),
        "pet:lang" => json!(c.lang_setting()),
        "pet:set-lang" => json!(set_lang(app, &s)),
        "pet:time-mode" => json!(c.time_mode()),
        "pet:set-time-mode" => {
            if !TIME_MODES.contains(&s.as_str()) { return json!(c.time_mode()); }
            c.settings.lock().unwrap().as_object_mut().map(|o| o.remove("dayMode"));
            c.set("timeMode", json!(s));
            refresh_wallpaper(app);
            json!(s)
        }
        "pet:update-state" => { let mut st = c.updater.status(); st["mode"] = json!(c.update_mode()); st }
        "pet:set-update-mode" => { c.set("updateMode", json!(if s == "manual" { "manual" } else { "auto" })); json!(c.update_mode()) }
        "pet:update-check" => { let a = app.clone(); c.updater.check(&tr(app), &move |st| update_changed(&a, st)) }
        "pet:update-install" => { update_install(app); let mut st = c.updater.status(); st["mode"] = json!(c.update_mode()); st }
        "pet:debug-mode" => json!(c.get("debugMode") == json!(true)),
        "pet:set-debug-mode" => { c.set("debugMode", json!(arg == json!(true))); json!(arg == json!(true)) }
        "pet:debug-hook" => json!(c.get("debugMode") == json!(true) && c.bridge().inject(&s)),
        "pet:ai-state" => json!(c.bridge().current()),
        "pet:hooks-status" => json!(hooks::by_name(&s).status()),
        "pet:install-hooks" => { let r = hooks::by_name(&s).install(&tr(app)); rebuild_tray(app); r }
        "pet:icons-hotkey" => json!(c.icons_hotkey.load(Ordering::Relaxed)),
        "pet:icons-visible" => json!(desk::icons_visible()),
        "pet:toggle-icons" => json!(toggle_icons(app)),
        "pet:boss" => { let a = app.clone(); let _ = app.run_on_main_thread(move || boss_toggle(&a)); Value::Null }
        "pet:boss-key" => c.boss_status(),
        "pet:boss-capture" => { boss_capture(app, arg == json!(true)); Value::Null }
        "pet:set-boss-key" => set_boss_key(app, &s),
        "pet:restart" => { relaunch(app); Value::Null }
        "pet:uninstall" => { uninstall_async(app); Value::Null }
        _ => Value::Null,
    }
}

// testing aid (2026-11-07): VIBINGWRAPPER_TEST_PORT=<port> answers POST {"name", "arg"} on 127.0.0.1 with what the
// HUD would get for that call, so every channel can be exercised without clicking. Off unless the variable is set.
fn test_endpoint(app: AppHandle) {
    let Some(port) = std::env::var("VIBINGWRAPPER_TEST_PORT").ok().and_then(|p| p.parse::<u16>().ok()) else { return };
    let Ok(server) = tiny_http::Server::http(("127.0.0.1", port)) else { return };
    std::thread::spawn(move || for mut req in server.incoming_requests() {
        let mut body = String::new();
        let _ = std::io::Read::read_to_string(req.as_reader(), &mut body);
        let v: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
        let out = dispatch(&app, v["name"].as_str().unwrap_or(""), v["arg"].clone());
        let _ = req.respond(tiny_http::Response::from_string(out.to_string()));
    });
}

/* ---------------- background watchers ---------------- */
// pause the wallpaper while a maximized / full-screen window hides the whole desktop; follow screen changes
fn watchers(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_screen = None;
        let mut n = 0u32;
        let mut hud_lost = false;
        let mut desk_up = false;
        loop {
            std::thread::sleep(Duration::from_millis(700));
            let c = core(&app);
            if c.get("weatherWallpaper") != json!(false) { wallpaper::set_paused(&app, desk::covered()); }
            // the HUD is never hidden on purpose (the boss key only shrinks it): if something minimized or hid it, bring it back
            // (straight ShowWindow: tao's show() trusts its own idea of the state and skips a window hidden from outside)
            if let Some(w) = app.get_webview_window("hud") {
                let (min, vis) = (w.is_minimized().unwrap_or(false), w.is_visible().unwrap_or(true));
                if min || !vis {
                    if !hud_lost { c.log(&format!("[hud] found minimized={} visible={}: restoring", min, vis)); }
                    hud_lost = true;
                    let a = app.clone();
                    let _ = app.run_on_main_thread(move || if let Some(w) = a.get_webview_window("hud") {
                        if let Ok(h) = w.hwnd() { desk::show_noactivate(h.0 as isize); }
                        place_hud(&a);
                    });
                } else if hud_lost { hud_lost = false; c.log("[hud] back"); }
                // 顯示桌面 puts the desktop above it: the gear stays reachable, so lift it back over the desktop
                else if let Ok(h) = w.hwnd() {
                    let h = h.0 as isize;
                    if desk::desktop_above(h) {
                        if !desk_up { c.log("[hud] under the desktop (顯示桌面): lifting"); }
                        desk_up = true;
                        let _ = app.run_on_main_thread(move || desk::raise_noactivate(h));
                    } else { desk_up = false; }
                }
            }
            n += 1;
            if n % 3 == 0 {
                let now = app.primary_monitor().ok().flatten().map(|m| (*m.position(), *m.size(), m.work_area().size.clone(), m.scale_factor().to_bits()));
                if last_screen.is_some() && now != last_screen {
                    c.log("screen changed: reposition HUD, reattach wallpaper");
                    let a = app.clone();
                    let _ = app.run_on_main_thread(move || { place_hud(&a); wallpaper::reattach(&a); });
                }
                last_screen = now;
            }
        }
    });
}

fn main() {
    // a dev copy can run beside the installed app: its own profile, and VIBINGWRAPPER_PORT for the bridge
    let data_dir = std::env::var_os("VIBINGWRAPPER_PROFILE").map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(std::env::var_os("APPDATA").unwrap_or_default()).join("vibing-wrapper"));
    let _ = std::fs::create_dir_all(&data_dir);
    let port: u16 = std::env::var("VIBINGWRAPPER_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(47321);
    let uninstall_only = std::env::args().any(|a| a == "--uninstall");
    let _ = WEBVIEW_DIR.set(data_dir.join("webview"));

    // preflight: any panic is reported instead of the process quietly disappearing (panic = "abort" in release)
    let pdir = data_dir.clone();
    std::panic::set_hook(Box::new(move |p| {
        let loc = p.location().map(|l| format!(" at {}:{}", l.file(), l.line())).unwrap_or_default();
        let msg = p.payload().downcast_ref::<&str>().map(|s| s.to_string()).or_else(|| p.payload().downcast_ref::<String>().cloned()).unwrap_or_default();
        log_to(&pdir, &format!("[panic] {}{}", msg, loc));
        desk::ask("VibingWrapper", &format!("VibingWrapper 發生錯誤，已停止。\n請把 debug.log 傳給開發者。\n\nVibingWrapper hit an error and stopped.\nPlease send debug.log to the developer.\n\n{}{}\n{}",
            msg.chars().take(300).collect::<String>(), loc, pdir.join("debug.log").display()), false, true);
    }));
    // preflight: the HUD and the wallpaper are WebView2 windows; without the runtime nothing can open
    match desk::webview2_version() {
        Some(v) => log_to(&data_dir, &format!("preflight webview2={}", v)),
        None => {
            log_to(&data_dir, "[fatal] WebView2 runtime not installed");
            if desk::ask("VibingWrapper",
                "這台電腦沒有安裝 Microsoft Edge WebView2 執行階段，VibingWrapper 無法啟動。\n要開啟微軟的下載頁嗎？（選「Evergreen Bootstrapper」，裝完再開一次 VibingWrapper）\n\n\
                 Microsoft Edge WebView2 Runtime is not installed, so VibingWrapper cannot start.\nOpen Microsoft's download page? (pick \"Evergreen Bootstrapper\", then start VibingWrapper again)", true, true) {
                desk::open_url("https://developer.microsoft.com/microsoft-edge/webview2/");
            }
            std::process::exit(1);
        }
    }

    let fdir = data_dir.clone();
    let app = tauri::Builder::default()
        // a second copy only hands its arguments to the first and leaves (Windows 設定 → 解除安裝 starts one with --uninstall)
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if argv.iter().any(|a| a == "--uninstall") { uninstall_async(app); }
            else if let Some(w) = app.get_webview_window("hud") { let _ = w.show(); }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, sc, ev| {
            if ev.state() != ShortcutState::Pressed { return; }
            if parse_key(ICONS_KEY).map_or(false, |k| k.id() == sc.id()) { toggle_icons(app); return; }
            let boss = core(app).boss.lock().unwrap().key.clone();
            if parse_key(&boss).map_or(false, |k| k.id() == sc.id()) { boss_toggle(app); }
        }).build())
        .invoke_handler(tauri::generate_handler![pet])
        .setup(move |app| {
            let h = app.handle().clone();
            let en_table: HashMap<String, String> = app.asset_resolver().get("i18n-en.json".into())
                .and_then(|a| serde_json::from_slice(&a.bytes).ok()).unwrap_or_default();
            // the theme folders that ship with the app sit next to the exe (an unpacked build); in a dev build, the repo's
            let exe_dir = std::env::current_exe()?.parent().map(PathBuf::from).unwrap_or_default();
            let packaged = exe_dir.join("themes").is_dir();
            let builtin = if packaged { exe_dir.join("themes") } else { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("themes") };
            let downloaded = data_dir.join("themes");
            let _ = std::fs::create_dir_all(&downloaded);
            let default_style = if builtin.join("basic").is_dir() { "basic" } else { "weather" };
            let mut settings = json!({ "alwaysOnTop": false, "weatherWallpaper": true, "wallpaperStyle": default_style });
            if let Some(Value::Object(saved)) = std::fs::read_to_string(data_dir.join("settings.json")).ok().and_then(|s| serde_json::from_str(&s).ok()) {
                settings.as_object_mut().unwrap().extend(saved);
            }
            let source = settings["themeStore"].as_str().map(String::from);
            let version = app.package_info().version.to_string();
            let en = Arc::new(AtomicBool::new(false));
            let c = Arc::new(Core { data_dir: data_dir.clone(), settings: Mutex::new(settings), bridge: Mutex::new(None),
                store: store::Store::new(downloaded.clone(), source),
                updater: updater::Updater::new(version.clone(), if packaged && !cfg!(debug_assertions) { Some(exe_dir.clone()) } else { None }),
                en: en.clone(), en_table, interactive: AtomicBool::new(false), menu_open: AtomicBool::new(false),
                icons_hotkey: AtomicBool::new(false), boss: Mutex::new(Boss::default()), version: version.clone() });
            c.apply_lang();
            app.manage(c.clone());
            app.manage(wallpaper::State::default());
            c.log(&format!("start {} pid={} exe={} packaged={} port={} lang={}", version, std::process::id(), exe_dir.display(), packaged, port, c.lang()));

            // Windows 設定 → 已安裝的應用程式 → 解除安裝: only the uninstall dialog
            if uninstall_only {
                let a = h.clone();
                std::thread::spawn(move || { if !run_uninstall(&a) { a.exit(0); } });
                return Ok(());
            }
            if packaged && !cfg!(debug_assertions) { desk::register(&version, &exe_dir.display().to_string()); }

            let h2 = h.clone();
            let b = bridge::Bridge::start(bridge::Opts {
                port, builtin, downloaded, data_dir: data_dir.clone(), version: version.clone(),
                lang_en: Box::new(move || en.load(Ordering::Relaxed)),
                on_state: Box::new(move |s| { let _ = h2.emit_to("hud", "pet:ai-state", s); }),
            });
            *c.bridge.lock().unwrap() = Some(b);

            // hotkeys before the tray, so its labels know whether they are ours
            c.icons_hotkey.store(register_key(&h, ICONS_KEY), Ordering::Relaxed);
            let bk = c.get("bossKey").as_str().filter(|k| parse_key(k).is_some()).unwrap_or(BOSS_DEFAULT).to_string();
            let breg = register_key(&h, &bk);
            { let mut b = c.boss.lock().unwrap(); b.key = bk; b.registered = breg; }

            create_hud(&h)?;
            make_tray(&h)?;
            refresh_wallpaper(&h);
            cursor_pump(h.clone());
            watchers(h.clone());
            updater_loop(h.clone());
            test_endpoint(h.clone());
            Ok(())
        })
        .build(tauri::generate_context!());
    let app = match app {
        Ok(a) => a,
        Err(e) => fatal(&fdir, &format!("startup failed: {}", e), "VibingWrapper 啟動失敗，已停止。請把 debug.log 傳給開發者。", "VibingWrapper failed to start. Please send debug.log to the developer."),
    };
    // the HUD is rebuilt on a language change and the wallpaper comes and goes: only 結束 quits
    app.run(|_app, e| if let tauri::RunEvent::ExitRequested { code: None, api, .. } = e { api.prevent_exit(); });
}
