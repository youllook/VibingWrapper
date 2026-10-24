// 自動更新 (2026-10-24, user: 請朋友測試總不能每次都叫對方解除安裝再重裝).
// The zip build has no installer, so this does it by hand:
//   check   → GitHub Releases (pre-releases count: every test build is one), highest vX.Y.Z above ours
//   install → download the zip for our flavour (完整版 / -lite) → check size and sha256 (the API's asset digest)
//             → unzip with System32's bsdtar into %TEMP% → a PowerShell script started outside our process waits
//             for us to exit, mirrors the new files over the program folder, and starts VibingWrapper.exe again.
// Settings, logs and downloaded themes live in %APPDATA%\vibing-wrapper, so they survive. Running from source
// (npm start) only reports that a newer version exists: git pull is the update there.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, execFileSync } = require('child_process');
const { app } = require('electron');

const API = 'https://api.github.com/repos/youllook/VibingWrapper/releases?per_page=15';
const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const LOG = path.join(os.tmpdir(), 'vibingwrapper-update.log');
const log = m => { try { fs.appendFileSync(LOG, `${new Date().toTimeString().slice(0, 8)} [app] ${m}\n`); } catch {} };

const ver = s => (String(s).match(/^v?(\d+)\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
const newer = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

// the folder holding VibingWrapper.exe, or null when running from source
const programDir = () => app.isPackaged && path.basename(process.execPath) === 'VibingWrapper.exe' ? path.dirname(process.execPath) : null;
// 精簡版: its folder is VibingWrapper-x.y.z-lite (the name stays across updates); otherwise, it has no `weather` theme
function isLite() {
  const dir = programDir(); if (!dir) return false;
  if (/-lite$/i.test(dir)) return true;
  return !fs.existsSync(path.join(app.getAppPath(), 'themes', 'weather'));
}

let state = { phase: 'idle', current: app.getVersion() };   // idle | checking | latest | available | downloading | installing | error
let listener = () => {}, release = null;
const set = s => { state = { ...state, ...s, current: app.getVersion() }; listener(state); };

async function check() {
  if (['downloading', 'installing'].includes(state.phase)) return state;
  set({ phase: 'checking', msg: '' });
  try {
    const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    const lite = isLite();
    const best = (await r.json()).filter(x => !x.draft && ver(x.tag_name).length === 3)
      .map(x => ({ x, asset: (x.assets || []).find(a => /-win-x64\.zip$/.test(a.name) && /-lite-/.test(a.name) === lite) }))
      .filter(c => c.asset).sort((a, b) => newer(a.x.tag_name, b.x.tag_name) ? -1 : 1)[0];
    if (!best || !newer(best.x.tag_name, app.getVersion())) { release = null; set({ phase: 'latest', checkedAt: Date.now() }); return state; }
    const a = best.asset;
    release = { version: best.x.tag_name.replace(/^v/, ''), name: a.name, url: a.browser_download_url, size: a.size,
      sha256: /^sha256:/.test(a.digest || '') ? a.digest.slice(7) : null, notes: String(best.x.body || '') };
    set({ phase: 'available', version: release.version, size: release.size, canInstall: !!programDir(), checkedAt: Date.now() });
  } catch (e) { set({ phase: 'error', msg: '檢查失敗：' + String(e.message || e).slice(0, 40) }); }
  return state;
}

const run = (cmd, args) => new Promise((ok, no) => execFile(cmd, args, { windowsHide: true }, (e, _o, se) => e ? no(new Error(se || e.message)) : ok()));

// PowerShell run after we exit; paths come in as arguments. The new build is copied over the program folder;
// only resources\ and locales\ (always ours) are mirrored, so files the new version dropped go there, while
// anything else a user keeps beside the exe is never deleted. robocopy exit codes below 8 mean success.
const SWAP = `param([int]$Wait, [string]$Exe, [string]$Src, [string]$Dir, [string]$Tmp)
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
  foreach ($sub in 'resources', 'locales') {
    if (Test-Path -LiteralPath (Join-Path $Src $sub)) {
      robocopy (Join-Path $Src $sub) (Join-Path $Dir $sub) /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
      $ok = $ok -and $LASTEXITCODE -lt 8
    }
  }
  Log "robocopy try $t ok=$ok"
  if (-not $ok) { Start-Sleep -Seconds 2 }
}
Start-Process -FilePath $Exe -WorkingDirectory $Dir
Log ('restarted ok=' + $ok)
Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
`;

async function install() {
  const dir = programDir();
  if (!release || !dir || ['downloading', 'installing'].includes(state.phase)) return state;
  const tmp = path.join(os.tmpdir(), `vibingwrapper-update-${release.version}-${Date.now()}`), zip = tmp + '.zip';
  try {
    set({ phase: 'downloading', got: 0, total: release.size });
    const r = await fetch(release.url, { cache: 'no-store' });
    if (!r.ok || !r.body) throw new Error('下載失敗 ' + r.status);
    const hash = crypto.createHash('sha256'), out = fs.createWriteStream(zip);
    let got = 0, lastT = 0;
    for await (const chunk of r.body) {
      got += chunk.length; hash.update(chunk);
      if (!out.write(chunk)) await new Promise(ok => out.once('drain', ok));
      if (Date.now() - lastT > 200) { lastT = Date.now(); set({ got }); }
    }
    await new Promise((ok, no) => out.end(e => e ? no(e) : ok()));
    if (release.size && got !== release.size) throw new Error('檔案大小不符，請重試');
    if (release.sha256 && hash.digest('hex') !== release.sha256) throw new Error('檔案校驗不符，請重試');
    set({ phase: 'installing', got });
    fs.mkdirSync(tmp);
    await run(TAR, ['-x', '-f', zip, '-C', tmp]);
    // the zip holds one folder VibingWrapper-x.y.z[-lite]/ with the exe in it
    const inner = fs.readdirSync(tmp).map(n => path.join(tmp, n)).find(p => fs.existsSync(path.join(p, 'VibingWrapper.exe')));
    if (!inner) throw new Error('壓縮檔裡找不到 VibingWrapper.exe');
    const script = path.join(os.tmpdir(), `vibingwrapper-update-${process.pid}.ps1`);
    fs.writeFileSync(script, SWAP);
    const q = s => `"${s}"`;                                   // Windows paths cannot contain double quotes
    const cmd = ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', q(script),
      '-Wait', String(process.pid), '-Exe', q(process.execPath), '-Src', q(inner), '-Dir', q(dir), '-Tmp', q(tmp)].join(' ');
    // started through WMI so it is not our child (and not inside a packaged shell's sandbox), like uninstall.js
    execFileSync('powershell', ['-NoProfile', '-Command',
      '$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $env:VW_UPDATE }; exit [int]$r.ReturnValue'],
      { env: { ...process.env, VW_UPDATE: cmd }, windowsHide: true, timeout: 20000 });
    log(`update ${app.getVersion()} → ${release.version}, swap scheduled`);
    fs.rmSync(zip, { force: true });
    setTimeout(() => app.exit(0), 300);
  } catch (e) {
    log('update failed: ' + (e.message || e));
    fs.rmSync(zip, { force: true }); fs.rmSync(tmp, { recursive: true, force: true });
    set({ phase: 'error', msg: String(e.message || e).slice(0, 40) });
  }
  return state;
}

// checks a little after start, then every 6 hours. 自動 (user: 更新可切換手動／自動): a newer build installs itself,
// but only while idle() says nothing is going on, since installing restarts the app; 手動 only shows it in the menu.
function init({ onChange, auto = () => true, idle = () => true } = {}) {
  listener = onChange || listener;
  const tick = async () => {
    if (state.phase !== 'available') await check();
    if (state.phase === 'available' && state.canInstall && auto() && idle()) install();
  };
  setTimeout(tick, 15000);
  setInterval(() => check(), 6 * 3600 * 1000);
  setInterval(() => { if (state.phase === 'available') tick(); }, 60000);   // waiting for an idle moment
}

module.exports = { init, check, install, status: () => state };
