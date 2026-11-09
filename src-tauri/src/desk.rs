// Windows desktop helpers (2026-11-07), Rust port of tools/desktop-icons.ps1 and the registry / dialog bits of
// main.js + tools/uninstall.js. The Electron build kept a resident PowerShell for these; here they are plain
// Win32 calls.
//   icons_visible / toggle_icons: 收桌面, the same switch as desktop right-click → 檢視 → 顯示桌面圖示
//   covered: a real window covers the whole primary work area (maximized / full screen) → the wallpaper pauses
//   autostart: HKCU\…\Run\VibingWrapper;  register / unregister: the 已安裝的應用程式 entry
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
pub const NO_WINDOW: u32 = 0x0800_0000;

pub fn hidden(cmd: &str) -> Command {
    #[allow(unused_mut)]
    let mut c = Command::new(cmd);
    #[cfg(windows)] c.creation_flags(NO_WINDOW);
    c
}

#[cfg(windows)]
mod w {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
    use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    use std::ptr::null_mut;

    fn wz(s: &str) -> Vec<u16> { s.encode_utf16().chain(Some(0)).collect() }
    unsafe fn find_ex(parent: HWND, after: HWND, cls: &str) -> HWND { FindWindowExW(parent, after, wz(cls).as_ptr(), std::ptr::null()) }

    unsafe extern "system" fn find_defview(h: HWND, l: LPARAM) -> BOOL {
        let d = find_ex(h, null_mut(), "SHELLDLL_DefView");
        if !d.is_null() { *(l as *mut HWND) = d; return 0; }
        1
    }
    // the icon host: SHELLDLL_DefView lives under Progman, or under a WorkerW once a live wallpaper split them
    unsafe fn defview() -> HWND {
        let v = find_ex(FindWindowW(wz("Progman").as_ptr(), std::ptr::null()), null_mut(), "SHELLDLL_DefView");
        if !v.is_null() { return v; }
        let mut v: HWND = null_mut();
        EnumWindows(Some(find_defview), &mut v as *mut HWND as LPARAM);
        v
    }
    pub fn icons_visible() -> bool {
        unsafe { let l = find_ex(defview(), null_mut(), "SysListView32"); !l.is_null() && IsWindowVisible(l) != 0 }
    }
    pub fn toggle_icons() -> bool {
        unsafe { let v = defview(); if !v.is_null() { SendMessageW(v, WM_COMMAND, 0x7402, 0); } }
        icons_visible()
    }
    // Walk the top-level windows front to back until the desktop itself. Covered = one real window whose rectangle
    // holds the whole work area. Skipped: hidden, minimized, cloaked, tool windows, click-through overlays.
    pub fn covered() -> bool {
        unsafe {
            let mut wa = RECT { left: 0, top: 0, right: 0, bottom: 0 };
            SystemParametersInfoW(SPI_GETWORKAREA, 0, &mut wa as *mut RECT as _, 0);
            let mut h = GetTopWindow(null_mut());
            let mut buf = [0u16; 64];
            while !h.is_null() {
                if IsWindowVisible(h) != 0 && IsIconic(h) == 0 {
                    let n = GetClassNameW(h, buf.as_mut_ptr(), 64) as usize;
                    let c = String::from_utf16_lossy(&buf[..n]);
                    if c == "Progman" || c == "WorkerW" { return false; }
                    let ex = GetWindowLongW(h, GWL_EXSTYLE) as u32;
                    let overlay = ex & WS_EX_TRANSPARENT != 0 && ex & WS_EX_LAYERED != 0;
                    let mut cloaked: u32 = 0;
                    let is_cloaked = DwmGetWindowAttribute(h, DWMWA_CLOAKED as u32, &mut cloaked as *mut u32 as _, 4) == 0 && cloaked != 0;
                    if ex & WS_EX_TOOLWINDOW == 0 && !overlay && !is_cloaked {
                        let mut r = RECT { left: 0, top: 0, right: 0, bottom: 0 };
                        if GetWindowRect(h, &mut r) != 0 && r.left <= wa.left + 2 && r.top <= wa.top + 2 && r.right >= wa.right - 2 && r.bottom >= wa.bottom - 2 { return true; }
                    }
                }
                h = GetWindow(h, GW_HWNDNEXT);
            }
            false
        }
    }
    // a plain Yes/No (or OK) box; true = the first button
    pub fn ask(title: &str, text: &str, yes_no: bool, warn: bool) -> bool {
        let flags = (if yes_no { MB_YESNO | MB_DEFBUTTON2 } else { MB_OK }) | (if warn { MB_ICONWARNING } else { MB_ICONINFORMATION }) | MB_SETFOREGROUND | MB_TOPMOST;
        let r = unsafe { MessageBoxW(null_mut(), wz(text).as_ptr(), wz(title).as_ptr(), flags) };
        r == IDYES || r == IDOK
    }
}
#[cfg(windows)]
pub use w::{ask, covered, icons_visible, toggle_icons};
// restore + show without taking the focus
#[cfg(windows)]
pub fn show_noactivate(hwnd: isize) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, IsIconic, SW_SHOWNOACTIVATE, SW_SHOWNA};
    unsafe { let h = hwnd as _; ShowWindow(h, if IsIconic(h) != 0 { SW_SHOWNOACTIVATE } else { SW_SHOWNA }); }
}
#[cfg(not(windows))]
pub fn show_noactivate(_hwnd: isize) {}
// 顯示桌面 (Win+D, the taskbar corner) lifts the desktop's WorkerW above every normal window, the HUD included, until
// something else is activated. True while a top-level WorkerW sits above `hwnd` in the z-order.
#[cfg(windows)]
pub fn desktop_above(hwnd: isize) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetTopWindow, GetWindow, GetClassNameW, IsWindowVisible, GW_HWNDNEXT};
    unsafe {
        let me = hwnd as windows_sys::Win32::Foundation::HWND;
        let mut h = GetTopWindow(std::ptr::null_mut());
        let mut buf = [0u16; 16];
        while !h.is_null() && h != me {
            if IsWindowVisible(h) != 0 {
                let n = GetClassNameW(h, buf.as_mut_ptr(), 16) as usize;
                if String::from_utf16_lossy(&buf[..n]) == "WorkerW" { return true; }
            }
            h = GetWindow(h, GW_HWNDNEXT);
        }
        false
    }
}
// to the top of the non-topmost windows, without taking the focus (a second Win+D still brings the windows back)
#[cfg(windows)]
pub fn raise_noactivate(hwnd: isize) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_TOP, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE};
    unsafe { SetWindowPos(hwnd as _, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE); }
}
#[cfg(not(windows))]
pub fn desktop_above(_hwnd: isize) -> bool { false }
#[cfg(not(windows))]
pub fn raise_noactivate(_hwnd: isize) {}
#[cfg(not(windows))]
pub fn icons_visible() -> bool { true }
#[cfg(not(windows))]
pub fn toggle_icons() -> bool { true }
#[cfg(not(windows))]
pub fn covered() -> bool { false }
#[cfg(not(windows))]
pub fn ask(_t: &str, _x: &str, _y: bool, _w: bool) -> bool { false }

/* ---- registry, through reg.exe (a handful of calls, no need for the registry API) ---- */
// the Evergreen WebView2 runtime's version, from the keys its installer writes (machine-wide or per-user)
#[cfg(windows)]
pub fn webview2_version() -> Option<String> {
    const ID: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    for root in [r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients", r"HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients", r"HKCU\Software\Microsoft\EdgeUpdate\Clients"] {
        let Ok(o) = hidden("reg").args(["query", &format!(r"{}\{}", root, ID), "/v", "pv"]).output() else { continue };
        if !o.status.success() { continue; }
        let out = String::from_utf8_lossy(&o.stdout).to_string();
        if let Some(v) = out.lines().find(|l| l.trim_start().starts_with("pv")).and_then(|l| l.split_whitespace().last()) {
            if v != "0.0.0.0" && v.contains('.') { return Some(v.to_string()); }
        }
    }
    None
}
#[cfg(not(windows))]
pub fn webview2_version() -> Option<String> { Some("n/a".into()) }
pub fn open_url(url: &str) { let _ = Command::new("explorer").arg(url).spawn(); }
const RUN: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const UNINSTALL: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\VibingWrapper";
fn exe() -> String { std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default() }

pub fn autostart() -> bool {
    hidden("reg").args(["query", RUN, "/v", "VibingWrapper"]).output().map_or(false, |o| o.status.success())
}
pub fn set_autostart(on: bool) {
    if on { let _ = hidden("reg").args(["add", RUN, "/v", "VibingWrapper", "/t", "REG_SZ", "/d", &format!("\"{}\"", exe()), "/f"]).output(); }
    else {
        let _ = hidden("reg").args(["delete", RUN, "/v", "VibingWrapper", "/f"]).output();
        let _ = hidden("reg").args(["delete", RUN, "/v", "electron.app.VibingWrapper", "/f"]).output();   // the Electron build's entry
    }
}
// 已安裝的應用程式 entry, refreshed on every start (the folder may have moved); its 解除安裝 starts us with --uninstall
pub fn register(version: &str, dir: &str) {
    let e = exe();
    let values = [("DisplayName", "REG_SZ", "VibingWrapper".to_string()), ("DisplayVersion", "REG_SZ", version.to_string()),
        ("Publisher", "REG_SZ", "youllook".into()), ("DisplayIcon", "REG_SZ", e.clone()), ("InstallLocation", "REG_SZ", dir.to_string()),
        ("UninstallString", "REG_SZ", format!("\"{}\" --uninstall", e)), ("NoModify", "REG_DWORD", "1".into()), ("NoRepair", "REG_DWORD", "1".into())];
    std::thread::spawn(move || for (k, t, v) in values { let _ = hidden("reg").args(["add", UNINSTALL, "/v", k, "/t", t, "/d", &v, "/f"]).output(); });
}
pub fn unregister() { let _ = hidden("reg").args(["delete", UNINSTALL, "/f"]).output(); }

// runs a PowerShell script after we exit. Started through WMI (Win32_Process.Create), so it is not our child and
// outlives us; the command line travels in an environment variable, so nothing needs a second round of quoting.
pub fn run_detached_ps(script_text: &str, script_name: &str, args: &[(&str, String)]) -> Result<(), String> {
    let script = std::env::temp_dir().join(script_name);
    std::fs::write(&script, script_text).map_err(|e| e.to_string())?;
    let mut cmd = format!("powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"{}\"", script.display());
    for (k, v) in args { cmd += &format!(" -{} \"{}\"", k, v); }   // Windows paths cannot contain double quotes
    let o = hidden("powershell").args(["-NoProfile", "-Command",
        "$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $env:VW_DETACHED }; exit [int]$r.ReturnValue"])
        .env("VW_DETACHED", cmd).output().map_err(|e| e.to_string())?;
    if o.status.success() { Ok(()) } else { Err(format!("WMI create failed ({:?})", o.status.code())) }
}

// opens a folder (or shows a file in its folder) in Explorer
pub fn reveal(p: &std::path::Path) {
    if p.is_file() { let _ = Command::new("explorer").arg(format!("/select,{}", p.display())).spawn(); }
    else { let _ = Command::new("explorer").arg(p).spawn(); }
}
