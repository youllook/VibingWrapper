// HTTPS for the theme store and the updater (2026-11-07): ureq over Windows' own TLS (schannel), so no TLS
// library is compiled into the exe. Downloads stream to a file while hashing (sha256) and reporting progress.
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

fn agent() -> &'static ureq::Agent {
    static A: OnceLock<ureq::Agent> = OnceLock::new();
    A.get_or_init(|| {
        let mut b = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(15)).timeout_read(Duration::from_secs(60))
            .user_agent(concat!("VibingWrapper/", env!("CARGO_PKG_VERSION")));
        if let Ok(tls) = native_tls::TlsConnector::new() { b = b.tls_connector(Arc::new(tls)); }
        b.build()
    })
}

pub fn get_json(url: &str, accept: Option<&str>) -> Result<serde_json::Value, String> {
    let mut r = agent().get(url);
    if let Some(a) = accept { r = r.set("Accept", a); }
    let resp = r.call().map_err(|e| match e { ureq::Error::Status(c, _) => format!("{}", c), e => e.to_string() })?;
    let mut s = String::new();
    resp.into_reader().take(16 * 1024 * 1024).read_to_string(&mut s).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

// → (bytes written, sha256 hex). on_progress(got, total) at most every ~150 ms. Fails above `max` bytes.
pub fn download(url: &str, to: &Path, max: u64, on_progress: &mut dyn FnMut(u64, u64)) -> Result<(u64, String), String> {
    let resp = agent().get(url).call().map_err(|e| match e { ureq::Error::Status(c, _) => format!("HTTP {}", c), e => e.to_string() })?;
    let total: u64 = resp.header("Content-Length").and_then(|v| v.parse().ok()).unwrap_or(0);
    if total > max { return Err("too big".into()); }
    copy_hashed(resp.into_reader(), total, to, max, on_progress)
}

pub fn copy_hashed(mut src: impl Read, total: u64, to: &Path, max: u64, on_progress: &mut dyn FnMut(u64, u64)) -> Result<(u64, String), String> {
    let mut out = std::fs::File::create(to).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    let (mut got, mut last) = (0u64, Instant::now());
    loop {
        let n = src.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        got += n as u64;
        if got > max { return Err("too big".into()); }
        h.update(&buf[..n]);
        out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        if last.elapsed() > Duration::from_millis(150) { last = Instant::now(); on_progress(got, total); }
    }
    out.flush().map_err(|e| e.to_string())?;
    on_progress(got, total);
    Ok((got, h.finalize().iter().map(|b| format!("{:02x}", b)).collect()))
}

// System32's bsdtar reads zip and refuses absolute paths and ".." (a Git-for-Windows GNU tar on PATH cannot read zip)
pub fn unzip(zip: &Path, into: &Path) -> Result<(), String> {
    let tar = std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into())).join("System32").join("tar.exe");
    let o = crate::desk::hidden(&tar.display().to_string()).arg("-x").arg("-f").arg(zip).arg("-C").arg(into).output().map_err(|e| e.to_string())?;
    if o.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&o.stderr).chars().take(60).collect()) }
}
