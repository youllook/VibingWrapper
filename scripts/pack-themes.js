// 主題發布包（2026-10-21）：每個主題一個 zip（裡面一層 <id>/），加一份型錄 themes.json，
// 上傳到 GitHub Release「themes」後，齒輪 →「下載主題」就看得到（tools/theme-store.js）。
// 用法：npm run themes:pack [-- <id> …]   （不給 id = themes/ 底下全部，basic 除外：它跟著程式走）
//   → dist/themes/theme-<id>.zip + themes.json，最後印出上傳指令
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..'), THEMES = path.join(ROOT, 'themes'), OUT = path.join(ROOT, 'dist', 'themes');
const TAR = path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'tar.exe');   // bsdtar writes zip
const SKIP = new Set(['basic']);
const EXCLUDE = ['state.json', 'state.json.tmp', '素材.md', 'gemini-prompt.md', '.pack.json'];

const ids = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(THEMES, { withFileTypes: true }).filter(d => d.isDirectory() && !/^[_.]/.test(d.name) && !SKIP.has(d.name)).map(d => d.name);
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const list = [];
for (const id of ids) {
  let t; try { t = JSON.parse(fs.readFileSync(path.join(THEMES, id, 'theme.json'), 'utf8')); } catch { console.warn('skip (no theme.json):', id); continue; }
  if (t.enabled === false) { console.warn('skip (disabled):', id); continue; }
  const file = `theme-${id}.zip`, zip = path.join(OUT, file);
  execFileSync(TAR, ['--options', 'zip:hdrcharset=UTF-8', '-a', '-c', '-f', zip, ...EXCLUDE.flatMap(e => ['--exclude', e]), '-C', THEMES, id]);
  const buf = fs.readFileSync(zip), sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  list.push({ id, name: t.name || id, description: t.description || '', order: (Number.isFinite(+t.order) ? +t.order : 99), file, size: buf.length, sha256, version: sha256.slice(0, 12) });
  console.log(`${file}  ${buf.length < 1048576 ? Math.ceil(buf.length / 1024) + ' KB' : (buf.length / 1048576).toFixed(1) + ' MB'}`);
}
fs.writeFileSync(path.join(OUT, 'themes.json'), JSON.stringify({ format: 1, generated: new Date().toISOString(), themes: list }, null, 1));
console.log(`\n${list.length} packs → ${OUT}\n上傳（第一次）：gh release create themes dist/themes/* --title "主題包" --notes "齒輪 → 下載主題"`);
console.log('之後更新：gh release upload themes dist/themes/* --clobber');
