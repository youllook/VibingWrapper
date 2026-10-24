// Zip with an outer folder (2026-10-16). electron-builder's zip target puts the files at the root of the zip,
// so "extract here" into Downloads scattered 18 files and folders there. Instead: build the unpacked app
// (target "dir"), rename it to <folder>, and zip that folder with Windows' own tar.exe (bsdtar writes zip).
// Used by scripts/dist.js (完整版) and scripts/dist-lite.js (精簡版).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const builder = require('electron-builder');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
// System32's bsdtar, not a Git-for-Windows GNU tar that may come first on PATH (that one cannot write zip)
const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');

// extraFiles are copied here rather than by electron-builder (2026-10-24): its copy of 除錯啟動.cmd failed with
// EBUSY every time (the virus scanner holds a fresh .cmd for a moment), so retry for a few seconds instead
function copyExtra(extra, dir) {
  for (const { from, to } of extra || []) {
    for (let i = 0; ; i++) {
      try { fs.copyFileSync(path.join(ROOT, from), path.join(dir, to)); break; }
      catch (e) { if (e.code !== 'EBUSY' || i >= 20) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500); }
    }
  }
}

async function pack({ config, folder }) {
  const { extraFiles, ...rest } = config;
  await builder.build({ targets: builder.Platform.WINDOWS.createTarget('dir', builder.Arch.x64), config: rest });
  const unpacked = path.join(OUT, 'win-unpacked'), staged = path.join(OUT, folder), zip = path.join(OUT, `${folder}-win-x64.zip`);
  fs.rmSync(staged, { recursive: true, force: true });
  fs.rmSync(zip, { force: true });
  fs.renameSync(unpacked, staged);
  copyExtra(extraFiles, staged);
  // hdrcharset=UTF-8: otherwise non-ASCII names (themes/jellyfish/素材.md) are written in the local code page, unflagged
  execFileSync(TAR, ['--options', 'zip:hdrcharset=UTF-8', '-a', '-c', '-f', zip, '-C', OUT, folder], { stdio: 'inherit' });
  fs.rmSync(staged, { recursive: true, force: true });
  console.log('done:', zip);
  return zip;
}

module.exports = { pack };
