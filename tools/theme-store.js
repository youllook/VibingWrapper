// 下載主題 (2026-10-21): theme packs published on GitHub Releases, installed into userData/themes/.
// The app ships with only a few themes (the lite build: just `basic`); the rest come from here.
//
// Catalog: themes.json on the release tagged "themes" (built by scripts/pack-themes.js):
//   { format: 1, themes: [{ id, name, description, order, file, size, sha256, version }] }
// Each pack is a zip holding one folder <id>/ with its theme.json. Install = download → check size and
// sha256 → unzip with the system tar (bsdtar reads zip; it refuses absolute paths and "..") into a temp
// folder → check <id>/theme.json → swap it in. .pack.json beside it remembers the installed version.
// Nothing downloaded is ever executed by the app: themes are web pages served by tools/claude-bridge.js.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const REPO = 'youllook/VibingWrapper';
const RELEASE = process.env.VIBINGWRAPPER_THEME_STORE || `https://github.com/${REPO}/releases/download/themes/`;   // env: local test server
const MAX_PACK = 400 * 1024 * 1024;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
// System32's bsdtar on Windows (a Git-for-Windows GNU tar earlier on PATH cannot read zip); tar elsewhere
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

let DIR = null;
const busy = new Map();                                   // id → progress 0..1 while downloading
function init(userData) { DIR = path.join(userData, 'themes'); fs.mkdirSync(DIR, { recursive: true }); return DIR; }

const packInfo = id => { try { return JSON.parse(fs.readFileSync(path.join(DIR, id, '.pack.json'), 'utf8')); } catch { return null; } };

let cache = null, cacheT = 0;
async function fetchCatalog() {
  if (cache && Date.now() - cacheT < 5 * 60000) return cache;
  const r = await fetch(RELEASE + 'themes.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('型錄 ' + r.status);
  const j = await r.json();
  cache = (Array.isArray(j.themes) ? j.themes : []).filter(t => t && ID_RE.test(t.id) && typeof t.file === 'string' && /^[\w.-]+\.zip$/.test(t.file));
  cacheT = Date.now();
  return cache;
}

// catalog × what is here: builtin (ships with the app) / installed / update / available, plus progress
async function list(installedThemes) {
  const here = new Map(installedThemes.map(t => [t.id, t]));
  const cat = await fetchCatalog();
  return cat.map(t => {
    const h = here.get(t.id), p = packInfo(t.id);
    let status = 'available';
    if (p) status = p.version === t.version ? 'installed' : 'update';
    else if (h && h.builtin) status = 'builtin';
    return { id: t.id, name: String(t.name || t.id), description: String(t.description || ''), size: Number(t.size) || 0, status,
      order: Number(t.order) || 99, progress: busy.has(t.id) ? busy.get(t.id) : null };
  }).sort((a, b) => (a.status === 'builtin') - (b.status === 'builtin') || a.order - b.order || a.id.localeCompare(b.id));
}

const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { windowsHide: true }, (e, _o, se) => e ? rej(new Error(se || e.message)) : res()));

async function install(id, onProgress = () => {}) {
  if (busy.has(id)) return { ok: false, msg: '下載中' };
  let t;
  try { t = (await fetchCatalog()).find(x => x.id === id); } catch (e) { return { ok: false, msg: String(e.message).slice(0, 40) }; }
  if (!t) return { ok: false, msg: '型錄裡沒有' };
  busy.set(id, 0); onProgress(id, 0);
  const tmp = path.join(DIR, `.tmp-${id}-${Date.now()}`), zip = tmp + '.zip';
  try {
    const r = await fetch(RELEASE + t.file);
    if (!r.ok || !r.body) throw new Error('下載 ' + r.status);
    const total = Number(r.headers.get('content-length')) || t.size || 0;
    if (total > MAX_PACK) throw new Error('檔案太大');
    const hash = crypto.createHash('sha256'), out = fs.createWriteStream(zip);
    let got = 0, lastSent = 0;
    for await (const chunk of r.body) {
      got += chunk.length; if (got > MAX_PACK) throw new Error('檔案太大');
      hash.update(chunk); if (!out.write(chunk)) await new Promise(ok => out.once('drain', ok));
      const p = total ? Math.min(0.99, got / total) : 0; busy.set(id, p);
      if (p - lastSent >= 0.02) { lastSent = p; onProgress(id, p); }
    }
    await new Promise((ok, no) => out.end(e => e ? no(e) : ok()));
    if (t.sha256 && hash.digest('hex') !== t.sha256) throw new Error('檔案校驗不符');
    fs.mkdirSync(tmp);
    await run(TAR, ['-x', '-f', zip, '-C', tmp]);
    const inner = path.join(tmp, id);
    JSON.parse(fs.readFileSync(path.join(inner, 'theme.json'), 'utf8'));        // must be a theme
    fs.writeFileSync(path.join(inner, '.pack.json'), JSON.stringify({ version: t.version, sha256: t.sha256, installed: new Date().toISOString() }));
    const dest = path.join(DIR, id), old = dest + '.old-' + Date.now();
    if (fs.existsSync(dest)) fs.renameSync(dest, old);
    fs.renameSync(inner, dest);
    fs.rmSync(old, { recursive: true, force: true });
    return { ok: true, msg: '已安裝' };
  } catch (e) {
    return { ok: false, msg: String(e.message || e).slice(0, 40) };
  } finally {
    busy.delete(id); onProgress(id, null);
    fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(zip, { force: true });
  }
}

// only downloaded ones can go; a built-in theme of the same id comes back
function remove(id) {
  if (!ID_RE.test(id) || !packInfo(id)) return { ok: false, msg: '不是下載的主題' };
  fs.rmSync(path.join(DIR, id), { recursive: true, force: true });
  return { ok: true, msg: '已移除' };
}

module.exports = { init, list, install, remove, RELEASE };
