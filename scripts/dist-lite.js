// 精簡版 zip（2026-10-15；2026-10-21 起只帶「基礎版」）：其他主題從齒輪 →「下載主題」裝（scripts/pack-themes.js）。
// 給想先快速試玩的人；完整版照舊用 npm run dist。
// 用法：npm run dist:lite → dist/VibingWrapper-<version>-lite-win-x64.zip（裡面一層 VibingWrapper-<version>-lite/）
const fs = require('fs');
const path = require('path');
const { pack } = require('./pack');
const pkg = require('../package.json');

const THEMES = ['basic'];
const DEFAULT_THEME = 'basic';

const config = {
  ...pkg.build,
  // electron-builder merges this with package.json's own list, so leave the rest out by exclusion
  files: [
    ...pkg.build.files,
    ...fs.readdirSync(path.join(__dirname, '../themes'), { withFileTypes: true })
      .filter(d => d.isDirectory() && !THEMES.includes(d.name)).map(d => `!themes/${d.name}/**`),
    '!themes/demo.html',
  ],
  // read by main.js as the first-run wallpaper (package.json → vibingwrapper.defaultTheme)
  extraMetadata: { vibingwrapper: { defaultTheme: DEFAULT_THEME } },
};

pack({ config, folder: `${pkg.build.productName}-${pkg.version}-lite` })
  .catch(e => { console.error(e); process.exit(1); });
