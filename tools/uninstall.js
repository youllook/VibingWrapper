// 解除安裝 (2026-10-16): gear menu / tray. The build is a portable zip, so "uninstall" means:
//   1. take our hooks out of ~/.claude/settings.json (claude-hooks.uninstall, everything else stays)
//   2. turn off 開機自動啟動, and bring the desktop icons back if 收桌面 hid them
//   3. after we exit, a detached PowerShell waits for this process to end, then deletes %APPDATA%\vibing-wrapper
//      and the program files.
// The zip has no top-level folder: someone who extracted it straight into Downloads must not lose Downloads.
// So only the exact names the build ships are deleted (SHIPPED), and the folder itself only if that left it empty.
const { app, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// top level of dist/win-unpacked (electron-builder, Electron 44); check again after an Electron upgrade
const SHIPPED = ['VibingWrapper.exe', 'resources', 'locales', 'LICENSE.electron.txt', 'LICENSES.chromium.html',
  'chrome_100_percent.pak', 'chrome_200_percent.pak', 'resources.pak', 'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll',
  'ffmpeg.dll', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll', 'icudtl.dat', 'snapshot_blob.bin',
  'v8_context_snapshot.bin'];

// the folder holding VibingWrapper.exe, or null when running from source (npm start): then no files are touched
function programDir() {
  return app.isPackaged && path.basename(process.execPath) === 'VibingWrapper.exe' ? path.dirname(process.execPath) : null;
}

// PowerShell run after we exit; paths come in as arguments, never pasted into the script
const CLEANUP = `param([int]$Wait, [string]$Data, [string]$Dir, [string]$Names)
try { Wait-Process -Id $Wait -Timeout 30 -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Milliseconds 800
if ($Data -and (Test-Path -LiteralPath $Data)) { Remove-Item -LiteralPath $Data -Recurse -Force -ErrorAction SilentlyContinue }
if ($Dir) {
  foreach ($n in $Names.Split('|')) { $p = Join-Path $Dir $n; if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue } }
  if (-not (Get-ChildItem -LiteralPath $Dir -Force -ErrorAction SilentlyContinue)) { Remove-Item -LiteralPath $Dir -Force -ErrorAction SilentlyContinue }
}
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
`;

function scheduleCleanup(dataDir, dir) {
  const script = path.join(os.tmpdir(), `vibingwrapper-uninstall-${process.pid}.ps1`);
  fs.writeFileSync(script, CLEANUP);
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script,
    '-Wait', String(process.pid), '-Data', dataDir, '-Dir', dir || '', '-Names', SHIPPED.join('|')];
  spawn('powershell', args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

// deps: { claudeHooks, desktopIcons, loginItemArgs } from main.js
async function run({ claudeHooks, desktopIcons, loginItemArgs }) {
  const dir = programDir(), dataDir = app.getPath('userData');
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
  if (response !== 0) return;

  const hooks = claudeHooks.uninstall();
  if (!hooks.ok) {
    await dialog.showMessageBox({ type: 'error', title: '解除安裝 VibingWrapper', message: '沒辦法移除 Claude hook，已停止解除安裝。',
      detail: `${hooks.msg}：${claudeHooks.FILE}\n修好這個檔案後再試一次，或手動刪掉裡面含 127.0.0.1:47321 的 hook。`, buttons: ['好'], noLink: true });
    return;
  }
  app.setLoginItemSettings({ openAtLogin: false, ...loginItemArgs() });
  if (!desktopIcons.isVisible()) { try { await desktopIcons.toggle(); } catch {} }
  scheduleCleanup(dataDir, dir);
  app.exit(0);
}

module.exports = { run, SHIPPED, CLEANUP };
