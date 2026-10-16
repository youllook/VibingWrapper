// 解除安裝 (2026-10-16): gear menu / tray / Windows 設定 →「已安裝的應用程式」. The build is a portable zip, so
// "uninstall" means:
//   1. take our hooks out of ~/.claude/settings.json (claude-hooks.uninstall, everything else stays)
//   2. turn off 開機自動啟動, bring the desktop icons back if 收桌面 hid them, drop our 已安裝的應用程式 entry
//   3. after we exit, a PowerShell waits for this process to end, then deletes %APPDATA%\vibing-wrapper and the
//      program files. It is started through WMI (Win32_Process.Create), so it is not our child: a plain detached
//      spawn was killed together with the app when it exited (seen in the 2026-10-16 test).
// Older zips had no top-level folder: someone who extracted one straight into Downloads must not lose Downloads.
// So only the exact names the build ships are deleted (SHIPPED), and the folder itself only if that left it empty.
//
// register() (packaged builds, every start) writes HKCU\…\Uninstall\VibingWrapper, so the app shows up in
// 已安裝的應用程式 like an installed one (a friend looked for it there); its 解除安裝 button starts
// VibingWrapper.exe --uninstall, which runs the same flow.
const { app, dialog } = require('electron');
const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// top level of dist/win-unpacked (electron-builder, Electron 44); check again after an Electron upgrade
const SHIPPED = ['VibingWrapper.exe', 'resources', 'locales', 'LICENSE.electron.txt', 'LICENSES.chromium.html',
  'chrome_100_percent.pak', 'chrome_200_percent.pak', 'resources.pak', 'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll',
  'ffmpeg.dll', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll', 'icudtl.dat', 'snapshot_blob.bin',
  'v8_context_snapshot.bin'];
const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\VibingWrapper';

// the folder holding VibingWrapper.exe, or null when running from source (npm start): then no files are touched
function programDir() {
  return app.isPackaged && path.basename(process.execPath) === 'VibingWrapper.exe' ? path.dirname(process.execPath) : null;
}

// PowerShell run after we exit; paths come in as arguments, never pasted into the script. Deleting is retried:
// right after exit a file can still be held for a moment. What it did goes to %TEMP%\vibingwrapper-uninstall.log.
const CLEANUP = `param([int]$Wait, [string]$Exe, [string]$Data, [string]$Dir, [string]$Names)
$log = Join-Path $env:TEMP 'vibingwrapper-uninstall.log'
function Log([string]$m) { Add-Content -LiteralPath $log -Value ((Get-Date -Format 'HH:mm:ss') + ' ' + $m) -Encoding UTF8 }
Log "start wait=$Wait data=$Data dir=$Dir"
try { Wait-Process -Id $Wait -Timeout 30 -ErrorAction Stop } catch {}
# the GPU / network helpers outlive the main process by a moment and write their caches on the way out
# (that recreated the data folder right after it was deleted): wait for every process of this exe
for ($i = 0; $i -lt 60; $i++) {
  $left = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Exe })
  if (-not $left.Count) { break }
  Start-Sleep -Milliseconds 500
}
Log "processes ended after $i checks"
Start-Sleep -Seconds 1
function Gone([string]$p) {
  for ($i = 0; $i -lt 15 -and (Test-Path -LiteralPath $p); $i++) {
    try { Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction Stop } catch { Log ("try $i " + $p + ': ' + $_.Exception.Message); Start-Sleep -Seconds 1 }
  }
  Log ($p + ' gone=' + -not (Test-Path -LiteralPath $p))
}
if ($Data) { Gone $Data; Start-Sleep -Seconds 3; if (Test-Path -LiteralPath $Data) { Log 'data came back'; Gone $Data } }
if ($Dir -and $Dir -ne '-') {
  foreach ($n in $Names.Split('|')) { $q = Join-Path $Dir $n; if (Test-Path -LiteralPath $q) { Gone $q } }
  if (-not (Get-ChildItem -LiteralPath $Dir -Force -ErrorAction SilentlyContinue)) { Remove-Item -LiteralPath $Dir -Force -ErrorAction SilentlyContinue }
  Log ($Dir + ' gone=' + -not (Test-Path -LiteralPath $Dir))
}
Log 'done'
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
`;

function scheduleCleanup(dataDir, dir) {
  const script = path.join(os.tmpdir(), `vibingwrapper-uninstall-${process.pid}.ps1`);
  fs.writeFileSync(script, CLEANUP);
  const q = s => `"${s}"`;                                   // Windows paths cannot contain double quotes
  const cmd = ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', q(script),
    '-Wait', String(process.pid), '-Exe', q(process.execPath), '-Data', q(dataDir), '-Dir', q(dir || '-'), '-Names', q(SHIPPED.join('|'))].join(' ');
  // the command line travels in an environment variable, so nothing needs a second round of quoting
  execFileSync('powershell', ['-NoProfile', '-Command',
    '$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $env:VW_CLEANUP }; exit [int]$r.ReturnValue'],
    { env: { ...process.env, VW_CLEANUP: cmd }, windowsHide: true, timeout: 20000 });
}

// each step goes to the same log the cleanup script writes, so a report of leftovers can be traced
const LOG = path.join(os.tmpdir(), 'vibingwrapper-uninstall.log');
const log = m => { try { fs.appendFileSync(LOG, `${new Date().toTimeString().slice(0, 8)} [app] ${m}
`); } catch {} };

// 已安裝的應用程式 entry, refreshed on every start (the folder may have moved). Packaged builds only.
function register() {
  const dir = programDir();
  if (!dir) return;
  const exe = process.execPath;
  const values = [
    ['DisplayName', 'REG_SZ', 'VibingWrapper'], ['DisplayVersion', 'REG_SZ', app.getVersion()], ['Publisher', 'REG_SZ', 'youllook'],
    ['DisplayIcon', 'REG_SZ', exe], ['InstallLocation', 'REG_SZ', dir], ['UninstallString', 'REG_SZ', `"${exe}" --uninstall`],
    ['NoModify', 'REG_DWORD', '1'], ['NoRepair', 'REG_DWORD', '1'],
  ];
  const next = i => i < values.length && execFile('reg', ['add', REG_KEY, '/v', values[i][0], '/t', values[i][1], '/d', values[i][2], '/f'],
    { windowsHide: true }, () => next(i + 1));
  next(0);
}
function unregister() {
  try { execFileSync('reg', ['delete', REG_KEY, '/f'], { windowsHide: true, stdio: 'ignore' }); } catch {}
}

// deps: { claudeHooks, desktopIcons, loginItemArgs } from main.js. Resolves false when the user cancels or it stops.
async function run({ claudeHooks, desktopIcons, loginItemArgs }) {
  const dir = programDir(), dataDir = app.getPath('userData');
  log(`uninstall asked (${app.getVersion()}, ${dir || 'from source'})`);
  const { response } = await dialog.showMessageBox({
    type: 'warning', title: '解除安裝 VibingWrapper', message: '要解除安裝 VibingWrapper 嗎？',
    detail: ['會做這些事：',
      '・從 Claude Code 設定移除 VibingWrapper 的 hook（其他設定不動）',
      '・關閉開機自動啟動',
      `・刪除設定與紀錄（${dataDir}）`,
      dir ? `・刪除程式檔案（${dir}）` : '・開發模式：不刪程式檔案',
      '', '完成後程式會關閉。'].join('\n'),
    buttons: ['解除安裝', '取消'], defaultId: 1, cancelId: 1, noLink: true,
  });
  log(`dialog response ${response}`);
  if (response !== 0) return false;

  const hooks = claudeHooks.uninstall();
  log(`hooks: ${hooks.msg}`);
  if (!hooks.ok) {
    await dialog.showMessageBox({ type: 'error', title: '解除安裝 VibingWrapper', message: '沒辦法移除 Claude hook，已停止解除安裝。',
      detail: `${hooks.msg}：${claudeHooks.FILE}\n修好這個檔案後再試一次，或手動刪掉裡面含 127.0.0.1:47321 的 hook。`, buttons: ['好'], noLink: true });
    return false;
  }
  app.setLoginItemSettings({ openAtLogin: false, ...loginItemArgs() });
  log('login item off');
  // icons back if 收桌面 hid them; never wait more than 3 s on the icon helper
  if (!desktopIcons.isVisible()) { try { await Promise.race([desktopIcons.toggle(), new Promise(r => setTimeout(r, 3000))]); } catch {} }
  log('icons checked');
  unregister();
  log('unregistered');
  try { scheduleCleanup(dataDir, dir); log('cleanup launched'); }
  catch (e) {
    log(`cleanup launch failed: ${e.message}`);
    await dialog.showMessageBox({ type: 'warning', title: '解除安裝 VibingWrapper', message: 'hook 已移除，但沒辦法自動刪除檔案。',
      detail: `程式關閉後，請手動刪除：\n${dataDir}${dir ? '\n' + dir : ''}`, buttons: ['好'], noLink: true });
  }
  app.exit(0);
  return true;
}

module.exports = { run, register, SHIPPED, CLEANUP };
