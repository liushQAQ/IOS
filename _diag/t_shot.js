// 快测：哪些时点截图能成
const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const ALL = fs.readFileSync(DIR + '/app_inject.js', 'utf8').split('\n;\n');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(5000);
  try {
    await p.screenshot({ path: DIR + '/t_home.png', timeout: 8000 });
    console.log('home shot OK');
  } catch (e) { console.log('home shot FAIL', e.message.slice(0, 60)); }
  // 字体状态
  const fst = await p.evaluate(() => ({ size: document.fonts.size, status: [...document.fonts].map(f => f.family + ':' + f.status).slice(0, 10) }));
  console.log(JSON.stringify(fst));
  await b.close();
})();
