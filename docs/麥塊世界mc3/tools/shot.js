// 離屏截圖：把 themes/ 底下的頁面拍成 PNG（子代理自己驗收用，不必開瀏覽器）
// 用法（在 repo 根目錄）：npx electron "docs/麥塊世界mc3/tools/shot.js" "<themes 底下的網址>" <out.png> [寬 高]
// 例：npx electron "docs/麥塊世界mc3/tools/shot.js" "creeper-end/assets.html?m=creeper" E:/tmp/a.png 1280 720
// 頁面設 window.__ready = true 就拍；20 秒沒好也拍。頁面的 console 錯誤會印出來。
// 環境變數 PERF=1：另外量平均每格毫秒（需要 window.theme.renderer、render）。
const { app, BrowserWindow } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path');

const args = process.argv.slice(process.argv.findIndex(a => a.endsWith('shot.js')) + 1);
const [url, out, W = '1280', H = '720'] = args;
const THEMES = path.resolve(__dirname, '../../../themes');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  if (rel.endsWith('state.json')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"state":"clear","sessions":[null,null,null,null,null]}'); }
  const f = path.join(THEMES, rel);
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(b); });
}).listen(0, '127.0.0.1');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: +W, height: +H, show: false, useContentSize: true, enableLargerThanScreen: true,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.setContentSize(+W, +H);
  win.webContents.on('console-message', (e, level, msg) => { if (level >= 2) console.log('[page]', msg); });
  await win.loadURL(`http://127.0.0.1:${server.address().port}/${url}`);
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(await win.webContents.executeJavaScript('!!window.__ready').catch(() => false))) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, +(process.env.WAIT || 300)));   // WAIT=毫秒：多等一會再拍（看漸入的動態）
  const info = await win.webContents.executeJavaScript('JSON.stringify(window.theme ? { tris: window.theme.tris, calls: window.theme.calls } : null)').catch(() => null);
  if (info && info !== 'null') console.log('theme', info);
  if (process.env.EVAL) console.log('eval', await win.webContents.executeJavaScript(process.env.EVAL).catch(e => 'err ' + e));   // EVAL='運算式'：印頁面裡的值（除錯）
  if (process.env.PERF) {   // PERF=1：連畫 60 格、每格 gl.finish()，印平均毫秒（含 CPU 送指令＋GPU 完成）
    const ms = await win.webContents.executeJavaScript(`(() => { const r = window.theme.renderer, gl = r.getContext(); window.theme.render(); gl.finish();
      const t0 = performance.now(); for (let i = 0; i < 60; i++) { window.theme.render(); gl.finish(); } return (performance.now() - t0) / 60; })()`).catch(e => 'err ' + e);
    console.log('perf ms/frame', typeof ms === 'number' ? ms.toFixed(2) : ms);
  }
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG());
  console.log('saved', out, Date.now() - t0, 'ms');
  app.exit(0);
});
