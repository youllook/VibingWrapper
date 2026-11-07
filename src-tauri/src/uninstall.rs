// 解除安裝: Rust port of tools/uninstall.js (2026-11-07). The build is a portable zip, so "uninstall" means:
//   1. take our hooks out of ~/.claude/settings.json and ~/.codex/hooks.json (everything else stays)
//   2. turn off 開機自動啟動, bring the desktop icons back if 收桌面 hid them, drop our 已安裝的應用程式 entry
//   3. after we exit, a PowerShell (started through WMI, so not our child) waits for this process to end, then
//      deletes the settings folder, the WebView2 cache folder and the program files.
// Only the exact names the build ships are deleted (SHIPPED), and the program folder itself only if that left it
// empty: someone who extracted the zip straight into Downloads must not lose Downloads.
pub const SHIPPED: [&str; 4] = ["VibingWrapper.exe", "themes", "README.txt", "VibingWrapper.exe.WebView2"];

pub const CLEANUP: &str = r#"param([int]$Wait, [string]$Exe, [string]$Data, [string]$Data2, [string]$Dir, [string]$Names)
$log = Join-Path $env:TEMP 'vibingwrapper-uninstall.log'
function Log([string]$m) { Add-Content -LiteralPath $log -Value ((Get-Date -Format 'HH:mm:ss') + ' ' + $m) -Encoding UTF8 }
Log "start wait=$Wait data=$Data data2=$Data2 dir=$Dir"
try { Wait-Process -Id $Wait -Timeout 30 -ErrorAction Stop } catch {}
# WebView2 helpers outlive the main process by a moment and write their caches on the way out
for ($i = 0; $i -lt 60; $i++) {
  $left = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Exe })
  if (-not $left.Count) { break }
  Start-Sleep -Milliseconds 500
}
Start-Sleep -Seconds 2
function Gone([string]$p) {
  for ($i = 0; $i -lt 15 -and (Test-Path -LiteralPath $p); $i++) {
    try { Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction Stop } catch { Log ("try $i " + $p + ': ' + $_.Exception.Message); Start-Sleep -Seconds 1 }
  }
  Log ($p + ' gone=' + -not (Test-Path -LiteralPath $p))
}
foreach ($d in @($Data, $Data2)) { if ($d -and $d -ne '-') { Gone $d } }
if ($Dir -and $Dir -ne '-') {
  foreach ($n in $Names.Split('|')) { $q = Join-Path $Dir $n; if (Test-Path -LiteralPath $q) { Gone $q } }
  if (-not (Get-ChildItem -LiteralPath $Dir -Force -ErrorAction SilentlyContinue)) { Remove-Item -LiteralPath $Dir -Force -ErrorAction SilentlyContinue }
  Log ($Dir + ' gone=' + -not (Test-Path -LiteralPath $Dir))
}
Log 'done'
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
"#;

pub fn log(m: &str) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(std::env::temp_dir().join("vibingwrapper-uninstall.log")) {
        let _ = writeln!(f, "{} [app] {}", chrono::Local::now().format("%H:%M:%S"), m);
    }
}
