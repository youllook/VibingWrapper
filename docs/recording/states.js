// Records the sea theme through idle → overcast → storm → clearing → waiting into PNG frames
// (docs/screenshots/states.gif). Steps and ffmpeg commands: docs/recording/README.md
// usage: electron docs/recording/states.js <repo> <outDir>
const { app, BrowserWindow } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path');
const [repo, out] = process.argv.slice(-2);
const THEMES = path.join(repo, 'themes');
const PORT = 47399, FPS = 12, W = 960, H = 540;
app.commandLine.appendSwitch('force_high_performance_gpu');

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  if (rel.endsWith('state.json')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"state":"clear","sessions":[null,null,null,null,null]}'); }
  const f = path.join(THEMES, rel);
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(b); });
}).listen(PORT, '127.0.0.1');

// [label, state, seconds held]
const SCRIPT = [
  ['待命 · Idle', 'clear', 1.6],
  ['思考中 · Thinking', 'overcast', 3.2],
  ['執行中 · Running tools', 'storm', 4.0],
  ['收尾 · Done', 'clearing', 3.4],
  ['等你 · Waiting for you', 'waiting', 3.6],
];

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ width: W, height: H, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadURL(`http://127.0.0.1:${PORT}/sea/index.html`);
  const js = s => win.webContents.executeJavaScript(s);
  await js(`(() => {
    weather.CONFIG.polling = false; weather.CONFIG.clockHours = 15.6; weather.CONFIG.fullTransition = 1.6;
    weather.setSessions(['clear','clear','clear']);
    weather.requestState('clear');
    const d = document.createElement('div'); d.id = 'cap';
    d.style.cssText = 'position:fixed;left:28px;bottom:24px;padding:6px 14px;border-radius:999px;background:rgba(10,20,35,.55);color:#eaf2ff;font:600 22px "Microsoft JhengHei UI","Segoe UI",sans-serif;letter-spacing:.5px;z-index:9;transition:opacity .3s';
    document.body.append(d);
  })()`);
  await new Promise(r => setTimeout(r, 2500));   // let the page settle at clear
  win.webContents.setFrameRate(FPS);
  let n = 0, rec = false;
  win.webContents.on('paint', (_e, _d, img) => { if (rec) fs.writeFileSync(path.join(out, `f${String(n++).padStart(4, '0')}.png`), img.toPNG()); });
  rec = true;
  for (const [label, st, sec] of SCRIPT) {
    await js(`document.getElementById('cap').textContent = ${JSON.stringify(label)};
      weather.setSessions(${JSON.stringify(st === 'waiting' ? ['clear', 'waiting', 'clear'] : [st, st, 'clear'])});
      weather.requestState(${JSON.stringify(st)});`);
    await new Promise(r => setTimeout(r, sec * 1000));
  }
  rec = false;
  console.log('frames', n);
  app.exit(0);
});
