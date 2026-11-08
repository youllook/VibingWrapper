// Weather wallpaper host: the chosen theme page (served by the bridge) in a full-screen window parented BEHIND
// the desktop icons. Rust port of tools/wallpaper.js + tools/attach-wallpaper.ps1 (2026-11-07): the Win32 calls
// are made directly, so no PowerShell is started any more.
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const LABEL: &str = "wallpaper";

#[derive(Default)]
pub struct Wallpaper { enabled: bool, url: Option<String>, paused: bool }
pub type State = Mutex<Wallpaper>;

pub fn set_enabled(app: &AppHandle, on: bool, url: Option<String>) {
    let st = app.state::<State>();
    let mut w = st.lock().unwrap();
    w.enabled = on;
    if url.is_some() { w.url = url.clone(); }
    let win = app.get_webview_window(LABEL);
    match (on, win) {
        (true, Some(win)) => {   // style change: swap the page in place
            if let Some(u) = url.and_then(|u| u.parse().ok()) { if win.url().ok().as_ref() != Some(&u) { let _ = win.navigate(u); } }
        }
        (true, None) => { if let Some(u) = w.url.clone() { drop(w); create(app, &u); } }
        (false, Some(win)) => { let _ = win.destroy(); }
        (false, None) => {}
    }
}

fn create(app: &AppHandle, url: &str) {
    let Ok(parsed) = url.parse() else { return };
    let Some(mon) = app.primary_monitor().ok().flatten() else { crate::core(app).log("[wallpaper] no primary monitor yet: skipped"); return };
    let (pos, size) = (*mon.position(), *mon.size());   // full screen, behind the taskbar too
    let app2 = app.clone();
    let built = crate::with_args(WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(parsed)))
        .title("VibingWrapper wallpaper").decorations(false).resizable(false).skip_taskbar(true).focused(false)
        .shadow(false).visible(false).background_color(tauri::window::Color(0x1b, 0x22, 0x30, 255))
        .on_page_load(move |_w, p| { if p.event() == tauri::webview::PageLoadEvent::Finished { apply_pause(&app2); } })
        .build();
    let win = match built { Ok(w) => w, Err(e) => { give_up(app, &format!("window: {}", e)); return; } };
    let _ = win.set_ignore_cursor_events(true);
    if let Err(diag) = attach(&win, pos.x, pos.y, size.width as i32, size.height as i32) { let _ = win.destroy(); give_up(app, &diag); return; }
    let _ = win.show();
    // Explorer restarts destroy the WorkerW (and our window with it): come back after a moment
    let app3 = app.clone();
    win.on_window_event(move |e| if let WindowEvent::Destroyed = e {
        let app4 = app3.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(3));
            let st = app4.state::<State>();
            let (on, url) = { let w = st.lock().unwrap(); (w.enabled, w.url.clone()) };
            if on && app4.get_webview_window(LABEL).is_none() { if let Some(u) = url { let a = app4.clone(); let _ = app4.run_on_main_thread(move || create(&a, &u)); } }
        });
    });
}

// pause while a window covers the whole desktop; each theme page exposes window.wpPause(on)
fn apply_pause(app: &AppHandle) {
    let paused = app.state::<State>().lock().unwrap().paused;
    if let Some(w) = app.get_webview_window(LABEL) { let _ = w.eval(&format!("window.wpPause && window.wpPause({})", paused)); }
}
#[allow(dead_code)]
pub fn set_paused(app: &AppHandle, on: bool) {
    { let st = app.state::<State>(); let mut w = st.lock().unwrap(); if w.paused == on { return; } w.paused = on; }
    apply_pause(app);
}
// screen size changed → re-attach with the new rectangle
#[allow(dead_code)]
pub fn reattach(app: &AppHandle) {
    let (Some(win), Some(mon)) = (app.get_webview_window(LABEL), app.primary_monitor().ok().flatten()) else { return };
    if let Err(diag) = attach(&win, mon.position().x, mon.position().y, mon.size().width as i32, mon.size().height as i32) {
        app.state::<State>().lock().unwrap().enabled = false;   // before destroy, so the Destroyed handler does not rebuild it
        let _ = win.destroy();
        give_up(app, &diag);
    }
}

// The window could not be put behind the desktop icons (e.g. a Windows build whose desktop is laid out differently).
// A full-screen window left on top would cover everything, so the wallpaper is switched off for this run, the
// reason goes to debug.log, and the user is told once. The HUD keeps working.
fn give_up(app: &AppHandle, diag: &str) {
    static TOLD: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    app.state::<State>().lock().unwrap().enabled = false;
    let c = crate::core(app);
    c.log(&format!("[wallpaper] FAILED, wallpaper off for this run | {}", diag));
    if TOLD.swap(true, std::sync::atomic::Ordering::Relaxed) { return; }
    let log = c.data_dir.join("debug.log");
    let text = if c.is_en() {
        format!("The wallpaper could not be placed behind the desktop icons on this Windows, so it is off for now. The HUD still works.
Please send debug.log to the developer:
{}", log.display())
    } else {
        format!("桌布沒辦法放到這台 Windows 的桌面圖示後面，這次先關閉桌布；HUD 照常可用。
請把 debug.log 傳給開發者：
{}", log.display())
    };
    std::thread::spawn(move || { crate::desk::ask("VibingWrapper", &text, false, true); });
}

// Ok = behind the icons (logged with the layout found, so a new Windows build can be read off debug.log)
#[cfg(windows)]
fn attach(win: &tauri::WebviewWindow, x: i32, y: i32, w: i32, h: i32) -> Result<(), String> {
    let hwnd = win.hwnd().map_err(|e| format!("no hwnd: {}", e))?;
    match desk::attach(hwnd.0 as _, x, y, w, h) {
        (0, diag) => Err(diag),
        (p, diag) => { crate::core(win.app_handle()).log(&format!("[wallpaper] attached under {} ({}x{} at {},{}) | {}", p, w, h, x, y, diag)); Ok(()) }
    }
}
#[cfg(not(windows))]
fn attach(_win: &tauri::WebviewWindow, _x: i32, _y: i32, _w: i32, _h: i32) -> Result<(), String> { Err("desktop wallpaper is Windows only".into()) }

#[cfg(windows)]
mod desk {
    // The "WorkerW" trick used by live-wallpaper apps; see tools/attach-wallpaper.ps1 for the two layouts:
    //   classic (Win10, Win11 ≤ 23H2): our window goes inside the empty top-level WorkerW behind the icons
    //   raised  (Win11 24H2+): a layered child of Progman, directly below SHELLDLL_DefView
    use windows_sys::Win32::Foundation::{HWND, LPARAM, WPARAM, BOOL};
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    use std::ptr::null_mut;

    fn w(s: &str) -> Vec<u16> { s.encode_utf16().chain(Some(0)).collect() }
    unsafe fn find_ex(parent: HWND, after: HWND, cls: &str) -> HWND { FindWindowExW(parent, after, w(cls).as_ptr(), std::ptr::null()) }
    unsafe fn raised(progman: HWND) -> bool {
        !find_ex(progman, null_mut(), "SHELLDLL_DefView").is_null() && !find_ex(progman, null_mut(), "WorkerW").is_null()
    }
    unsafe extern "system" fn enum_proc(h: HWND, l: LPARAM) -> BOOL {
        if !find_ex(h, null_mut(), "SHELLDLL_DefView").is_null() {
            let next = find_ex(null_mut(), h, "WorkerW");
            if !next.is_null() { *(l as *mut HWND) = next; return 0; }
        }
        1
    }
    unsafe fn classic_worker() -> HWND {
        let mut worker: HWND = null_mut();
        EnumWindows(Some(enum_proc), &mut worker as *mut HWND as LPARAM);
        worker
    }
    unsafe fn split(progman: HWND, wp: WPARAM, lp: LPARAM) {
        let mut r = 0usize;
        SendMessageTimeoutW(progman, 0x052C, wp, lp, SMTO_NORMAL, 1000, &mut r);
    }

    pub fn attach(win: HWND, x: i32, y: i32, cx: i32, cy: i32) -> (isize, String) {
        let mut info: Vec<String> = vec![];
        unsafe {
            let progman = FindWindowW(w("Progman").as_ptr(), std::ptr::null());
            if progman.is_null() { return (0, "no Progman window (is Explorer running?)".into()); }
            info.push(format!("progman={} raised-before={} classic-before={}", progman as isize, raised(progman), !classic_worker().is_null()));
            // send once; Explorer reference-counts the split, so only fall back to the legacy (0, 0) form when nothing came of it
            if !raised(progman) && classic_worker().is_null() { split(progman, 0xD, 1); info.push("sent 0x052C(0xD,1)".into()); }
            if !raised(progman) && classic_worker().is_null() { split(progman, 0, 0); info.push("sent 0x052C(0,0)".into()); }
            let (parent, after) = if raised(progman) {
                info.push("layout=raised".into());
                (progman, find_ex(progman, null_mut(), "SHELLDLL_DefView"))
            } else {
                let p = classic_worker();
                if p.is_null() { info.push("layout=none: no WorkerW behind the icons after the split".into()); return (0, info.join("; ")); }
                info.push(format!("layout=classic worker={}", p as isize));
                (p, null_mut())
            };
            // a plain child window: drop POPUP / CAPTION / THICKFRAME / SYSMENU / MIN-MAXBOX / MAXIMIZE, add CHILD
            let style = GetWindowLongW(win, GWL_STYLE) as u32;
            let style = (style & !(WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_MAXIMIZE)) | WS_CHILD;
            SetWindowLongW(win, GWL_STYLE, style as i32);
            if parent == progman {
                // Progman has no redirection surface on the raised desktop: children only show if they are layered
                SetWindowLongW(win, GWL_EXSTYLE, GetWindowLongW(win, GWL_EXSTYLE) | WS_EX_LAYERED as i32);
                SetLayeredWindowAttributes(win, 0, 255, LWA_ALPHA);
            }
            SetParent(win, parent);
            if GetParent(win) != parent { info.push(format!("SetParent did not take (parent now {})", GetParent(win) as isize)); return (0, info.join("; ")); }
            let flags = SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW | if after.is_null() { SWP_NOZORDER } else { 0 };
            SetWindowPos(win, after, x, y, cx, cy, flags);
            (parent as isize, info.join("; "))
        }
    }
}
