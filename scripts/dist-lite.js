// 精簡版 zip（2026-10-15）：只帶 天氣／天氣＋海／海月 三個主題，預設桌布是海月。
// 給不用 Claude Code 的朋友試玩；完整版照舊用 npm run dist。
// 用法：npm run dist:lite → dist/VibingWrapper-<version>-lite-win-x64.zip（裡面一層 VibingWrapper-<version>-lite/）
const fs = require('fs');
const path = require('path');
const { pack } = require('./pack');
const pkg = require('../package.json');

const THEMES = ['weather', 'sea', 'jellyfish'];
const DEFAULT_THEME = 'jellyfish';

const config = {
  ...pkg.build,
  // electron-builder merges this with package.json's own list, so leave the rest out by exclusion
  files: [
    ...pkg.build.files,
    ...fs.readdirSync(path.join(__dirname, '../themes'), { withFileTypes: true })
      .filter(d => d.isDirectory() && !THEMES.includes(d.name)).map(d => `!themes/${d.name}/**`),
    '!themes/demo.html',
    '!themes/jellyfish/{素材.md,gemini-prompt.md}',
  ],
  // read by main.js as the first-run wallpaper (package.json → vibingwrapper.defaultTheme)
  extraMetadata: { vibingwrapper: { defaultTheme: DEFAULT_THEME } },
};

pack({ config, folder: `${pkg.build.productName}-${pkg.version}-lite` })
  .catch(e => { console.error(e); process.exit(1); });
