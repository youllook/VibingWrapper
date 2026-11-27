// 效能實測：用 Electron 開主題頁，量 draw()（含動態模糊）＋同步的毫秒數（取中位數）。
// 用法：RS_URL=<url> electron gpucheck.js [low|high]   —— low＝強制內顯（force_low_power_gpu）；結果附加到 shots/gpucheck.txt
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'shots', 'gpucheck.txt');
const log = (s) => fs.appendFileSync(OUT, s + '\n');
log('# start ' + process.argv.slice(1).join(' '));
const args = process.argv.slice(process.defaultApp ? 2 : 1).filter((a) => !a.endsWith('.js'));
// 網址用環境變數 RS_URL 傳（放在命令列，Electron 啟動時會把它當成要開的東西而直接掛掉）
const url = process.env.RS_URL, mode = args.includes('high') ? 'high' : 'low';
app.commandLine.appendSwitch(mode === 'low' ? 'force_low_power_gpu' : 'force_high_performance_gpu');
process.on('uncaughtException', (e) => { log(mode + ' ERROR ' + e.stack); app.quit(); });
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: 1920, height: 1080, show: false, webPreferences: { backgroundThrottling: false } });
    await win.loadURL(url);
    const js = (s) => win.webContents.executeJavaScript(s);
    for (let i = 0; i < 60 && !(await js('!!window.theme')); i++) await new Promise((r) => setTimeout(r, 250));
    await js('window.theme.cityReady.then(() => 1)');
    await new Promise((r) => setTimeout(r, 3000));
    const res = await js(`(() => {
      const T = window.theme, r = T.renderer, gl = r.getContext(), px = new Uint8Array(4);
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const run = (w, h) => { r.setPixelRatio(1); r.setSize(w, h, false); if (T.resizePost) T.resizePost();
        const t = []; for (let i = 0; i < 30; i++) { const t0 = performance.now(); T.draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - t0); }
        t.sort((a, b) => a - b); return +t[15].toFixed(1); };
      return { gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?', ms_1152x648: run(1152, 648), ms_1920x1080: run(1920, 1080), tris: r.info.render.triangles };
    })()`);
    log(mode + ' ' + JSON.stringify(res));
  } catch (e) { log(mode + ' ERROR ' + (e && e.stack || e)); }
  app.quit();
});
