// 完整版 zip: npm run dist → dist/VibingWrapper-<version>-win-x64.zip, everything inside VibingWrapper-<version>/
const pkg = require('../package.json');
const { pack } = require('./pack');

pack({ config: pkg.build, folder: `${pkg.build.productName}-${pkg.version}` })
  .catch(e => { console.error(e); process.exit(1); });
