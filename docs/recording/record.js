// Renders the shots in shots.json straight to MP4 (raw footage for demos / Shorts / Reels).
// The page runs on a virtual clock (virtual-clock.js), so the output is an exact frame rate whatever the GPU does.
// usage: electron docs/recording/record.js <repo> <outDir> [--shots file.json] [shot names...]   (no names = every shot)
// needs ffmpeg on PATH. Shot fields: docs/recording/README.md
const { app, BrowserWindow } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');

const args = process.argv.slice(process.argv.findIndex(a => a.endsWith('record.js')) + 1);
const flag = args.indexOf('--shots');
const shotsFile = flag >= 0 ? args.splice(flag, 2)[1] : path.join(__dirname, 'shots.json');
const [repo, out, ...only] = args;
const { defaults = {}, shots } = JSON.parse(fs.readFileSync(shotsFile, 'utf8'));
const THEMES = path.join(repo, 'themes');
const PORT = 47398;
const T = 'window.theme || window.weather || window.ocean';   // the theme's test interface (themes/README.md)

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  if (rel.endsWith('state.json')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"state":"clear","sessions":[null,null,null,null,null]}'); }
  const f = path.join(THEMES, rel);
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(b); });
}).listen(PORT, '127.0.0.1');

app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

async function record(name, shot) {
  const { size: [W, H], fps: FPS, preroll } = shot;
  const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, enableLargerThanScreen: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: false, preload: path.join(__dirname, 'virtual-clock.js') } });
  win.setContentSize(W, H);   // the constructor clamps to the screen
  await win.loadURL(`http://127.0.0.1:${PORT}/${shot.theme}/index.html${shot.query ? '?' + shot.query : ''}`);
  const js = s => win.webContents.executeJavaScript(s);
  const step = n => js(`for (let i = 0; i < ${n}; i++) __rec.step(${1 / FPS})`);
  const shot1 = () => js(`__rec.step(${1 / FPS}); __rec.grab(${W}, ${H})`).then(d => Buffer.from(d.buffer, d.byteOffset, d.byteLength));   // step one frame → its RGBA
  // one script entry: state + boats/jellies/camps, optional pinned params, CONFIG changes and a free-form expression
  const apply = s => js(`(() => { const T = ${T};
    if (${JSON.stringify(s.config || null)}) Object.assign(T.CONFIG, ${JSON.stringify(s.config || null)});
    if (${'params' in s}) T.setOverride(${JSON.stringify(s.params ?? null)});
    if (${'sessions' in s}) T.setSessions(${JSON.stringify(s.sessions ?? null)});
    if (${JSON.stringify(s.state || null)}) T.applyState(${JSON.stringify(s.state || null)});
    ${s.eval || ''}
  })()`);

  // let assets (GLB, textures) load in real time, then settle the scene on the virtual clock
  for (let i = 0; i < 40 && !(await js(`!!(${T})`)); i++) await new Promise(r => setTimeout(r, 250));
  await new Promise(r => setTimeout(r, 3000));
  await js(`(() => { const T = ${T}; T.CONFIG.polling = false; T.CONFIG.clockHours = ${shot.clock ?? null}; })()`);
  await apply(shot.script[0]);
  await step(Math.round(preroll * FPS));
  // the first paints come back black while the GPU warms up (shader compiles): keep stepping until five have content
  const lit = b => { for (let i = 0; i < b.length; i += 4 * 997) if (b[i] | b[i + 1] | b[i + 2]) return true; return false; };
  for (let i = 0, ok = 0; i < 600 && ok < 5; i++) ok = lit(await shot1()) ? ok + 1 : 0;

  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(out, `${name}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
  let n = 0, clock = shot.clock;
  for (const s of shot.script) {
    await apply(s);
    const k = Math.round(s.sec * FPS), from = clock;
    for (let i = 0; i < k; i++) {
      if (s.clockTo != null) await js(`(${T}).CONFIG.clockHours = ${from + (s.clockTo - from) * (i + 1) / k}`);
      if (!ff.stdin.write(await shot1())) await new Promise(r => ff.stdin.once('drain', r));
      n++;
    }
    if (s.clockTo != null) clock = s.clockTo;
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  win.destroy();
  console.log(`${name}: ${n} frames, ${W}x${H}, ${(n / FPS).toFixed(1)} s`);
}

app.on('window-all-closed', () => {});   // one window per shot: closing it must not quit
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const [name, shot] of Object.entries(shots)) {
    if (only.length && !only.includes(name)) continue;
    try { await record(name, { ...defaults, ...shot }); } catch (e) { console.error(name, e); }
  }
  app.exit(0);
});
