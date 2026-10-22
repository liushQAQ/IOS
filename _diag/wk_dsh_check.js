// 验证守卫不误伤 DSH：WebKit + 全部 shim 打开 3083，检查布局补丁是否仍生效
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const SHIM_DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_shims';
const TARGET = process.argv[2] || 'http://127.0.0.1:3083/';

function shimFiles() {
  return fs.readdirSync(SHIM_DIR).filter((f) => /^shim_\d+\.js$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
}

(async () => {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  for (const f of shimFiles()) await page.addInitScript({ content: fs.readFileSync(path.join(SHIM_DIR, f), 'utf8') });

  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(9000);

  const r = await page.evaluate(() => {
    const root = document.getElementById('root');
    const frame = document.querySelector('[data-mobile-nav="frame"]');
    const header = document.querySelector('[data-phase] header, header');
    const lock = document.getElementById('dsh-ios-page-lock');
    const unlock = document.getElementById('dsh-ios-page-unlock');
    const cs = getComputedStyle(document.documentElement);
    return {
      hasRoot: !!root,
      rootTextLen: root ? (root.innerText || '').trim().length : -1,
      lock: !!lock, unlock: !!unlock,
      htmlPos: cs.position, htmlOvY: cs.overflowY,
      framePadTop: frame ? getComputedStyle(frame).paddingTop : '-',
      headerPos: header ? getComputedStyle(header).position : '-',
      layoutFixInstalled: typeof window.__dshLayoutFix,
      topShift: window.__dshTopShift,
    };
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('pageerror:', errs.length, errs.slice(0, 3));
  await browser.close();
})();
