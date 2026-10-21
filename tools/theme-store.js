// 下載主題 (2026-10-21): theme packs published on GitHub Releases, installed into userData/themes/.
// The app ships with only a few themes (the lite build: just `basic`); the rest come from here.
//
// Catalog: themes.json on the release tagged "themes" (built by scripts/pack-themes.js):
//   { format: 1, themes: [{ id, name, description, order, file, size, sha256, version }] }
// Each pack is a zip holding one folder <id>/ with its theme.json. Install = download → check size and
// sha256 → unzip with the system tar (bsdtar reads zip; it refuses absolute paths and "..") into a temp
// folder → check <id>/theme.json → swap it in. .pack.json beside it remembers the installed version.
// Nothing downloaded is ever executed by the app: themes are web pages served by tools/claude-bridge.js.
// The source can also be a local folder (settings.json "themeStore", or VIBINGWRAPPER_THEME_STORE) holding
// the same files, to try packs before they are published.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const RELEASE = 'https://github.com/youllook/VibingWrapper/releases/download/themes/';
const MAX_PACK = 400 * 1024 * 1024;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
// System32's bsdtar on Windows (a Git-for-Windows GNU tar earlier on PATH cannot read zip); tar elsewhere
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

let DIR = null, SOURCE = RELEASE;
const busy = new Map();                                   // id → { phase, got, total } while installing
function init(userData, source) {
  DIR = path.join(userData, 'themes'); fs.mkdirSync(DIR, { recursive: true });
  SOURCE = source || process.env.VIBINGWRAPPER_THEME_STORE || RELEASE;
  return DIR;
}
const isLocal = () => !/^https?:\/\//.test(SOURCE);
const sourceLabel = () => isLocal() ? SOURCE : 'GitHub Releases';

// a readable byte stream + its length, from the web or the local folder
async function open(file) {
  if (isLocal()) {
    const f = path.join(SOURCE, path.basename(file));
    return { size: fs.statSync(f).size, body: fs.createReadStream(f, { highWaterMark: 256 * 1024 }) };
  }
  const r = await fetch(SOURCE + file, { cache: 'no-store' });
  if (!r.ok || !r.body) throw new Error('下載失敗 ' + r.status);
  return { size: Number(r.headers.get('content-length')) || 0, body: r.body };
}
const packInfo = id => { try { return JSON.parse(fs.readFileSync(path.join(DIR, id, '.pack.json'), 'utf8')); } catch { return null; } };

let cache = null, cacheT = 0;
async function fetchCatalog(fresh) {
  if (!fresh && cache && Date.now() - cacheT < 5 * 60000) return cache;
  let j;
  if (isLocal()) j = JSON.parse(fs.readFileSync(path.join(SOURCE, 'themes.json'), 'utf8'));
  else { const r = await fetch(SOURCE + 'themes.json', { cache: 'no-store' }); if (!r.ok) throw new Error('讀不到主題清單（' + r.status + '）'); j = await r.json(); }
  cache = (Array.isArray(j.themes) ? j.themes : []).filter(t => t && ID_RE.test(t.id) && typeof t.file === 'string' && /^[\w.-]+\.zip$/.test(t.file));
  cacheT = Date.now();
  return cache;
}

// catalog × what is here. builtin = ships with the app (a "bundled": false folder in the app counts as not
// installed: it is meant to be downloaded); installed / update / available; plus the running install
async function list(installedThemes, fresh) {
  const here = new Map(installedThemes.map(t => [t.id, t]));
  const cat = await fetchCatalog(fresh);
  return cat.map(t => {
    const h = here.get(t.id), p = packInfo(t.id);
    let status = 'available';
    if (p) status = p.version === t.version ? 'installed' : 'update';
    else if (h && h.builtin && h.bundled !== false) status = 'builtin';
    return { id: t.id, name: String(t.name || t.id), description: String(t.description || ''), size: Number(t.size) || 0, status,
      order: Number(t.order) || 99, job: busy.get(t.id) || null };
  }).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { windowsHide: true }, (e, _o, se) => e ? rej(new Error(se || e.message)) : res()));

// onProgress({ id, phase: download | extract | done | error, got, total, msg })
async function install(id, onProgress = () => {}) {
  if (busy.has(id)) return { ok: false, msg: '正在安裝' };
  let t;
  try { t = (await fetchCatalog()).find(x => x.id === id); } catch (e) { return { ok: false, msg: String(e.message).slice(0, 60) }; }
  if (!t) return { ok: false, msg: '清單裡沒有這個主題' };
  const job = { phase: 'download', got: 0, total: t.size || 0 };
  const tell = extra => { Object.assign(job, extra); busy.set(id, job); onProgress({ id, ...job }); };
  tell({});
  const tmp = path.join(DIR, `.tmp-${id}-${Date.now()}`), zip = tmp + '.zip';
  try {
    const src = await open(t.file);
    const total = src.size || t.size || 0;
    if (total > MAX_PACK) throw new Error('檔案太大');
    const hash = crypto.createHash('sha256'), out = fs.createWriteStream(zip);
    let got = 0, lastT = 0;
    for await (const chunk of src.body) {
      got += chunk.length; if (got > MAX_PACK) throw new Error('檔案太大');
      hash.update(chunk); if (!out.write(chunk)) await new Promise(ok => out.once('drain', ok));
      if (Date.now() - lastT > 120) { lastT = Date.now(); tell({ got, total }); }
    }
    await new Promise((ok, no) => out.end(e => e ? no(e) : ok()));
    tell({ got, total, phase: 'extract' });
    if (t.sha256 && hash.digest('hex') !== t.sha256) throw new Error('檔案校驗不符，請重試');
    fs.mkdirSync(tmp);
    await run(TAR, ['-x', '-f', zip, '-C', tmp]);
    const inner = path.join(tmp, id);
    JSON.parse(fs.readFileSync(path.join(inner, 'theme.json'), 'utf8'));        // must be a theme
    fs.writeFileSync(path.join(inner, '.pack.json'), JSON.stringify({ version: t.version, sha256: t.sha256, installed: new Date().toISOString() }));
    const dest = path.join(DIR, id), old = dest + '.old-' + Date.now();
    if (fs.existsSync(dest)) fs.renameSync(dest, old);
    fs.renameSync(inner, dest);
    fs.rmSync(old, { recursive: true, force: true });
    busy.delete(id); onProgress({ id, phase: 'done', got, total });
    return { ok: true, msg: '已安裝' };
  } catch (e) {
    const msg = String(e.message || e).slice(0, 60);
    busy.delete(id); onProgress({ id, phase: 'error', msg });
    return { ok: false, msg };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(zip, { force: true });
  }
}

// only downloaded ones can go; a built-in theme of the same id comes back
function remove(id) {
  if (!ID_RE.test(id) || !packInfo(id)) return { ok: false, msg: '不是下載的主題' };
  fs.rmSync(path.join(DIR, id), { recursive: true, force: true });
  return { ok: true, msg: '已移除' };
}

module.exports = { init, list, install, remove, sourceLabel, RELEASE };
