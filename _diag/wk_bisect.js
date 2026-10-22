// 二分定位：哪个 shim 把 9009 的页面高度压塌（8909 -> 956）
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const SHIM_DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_shims';
const TARGET = 'http://127.0.0.1:9009/';

function shimFiles() {
  return fs.readdirSync(SHIM_DIR).filter((f) => /^shim_\d+\.js$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
}

async function measure(browser, files) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  for (const f of files) await page.addInitScript({ content: fs.readFileSync(path.join(SHIM_DIR, f), 'utf8') });
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const se = document.scrollingElement || document.documentElement;
    const c = document.querySelector('body > .container');
    const b = window.scrollY; window.scrollTo(0, 600); const a = window.scrollY;
    return { scrollH: se.scrollHeight, contH: c ? Math.round(c.getBoundingClientRect().height) : -1, contOv: c ? getComputedStyle(c).overflowY : '-', moved: a - b };
  });
  await ctx.close();
  return r;
}

(async () => {
  const browser = await webkit.launch();
  const files = shimFiles();
  console.log('基线（零 shim）:', JSON.stringify(await measure(browser, [])));
  for (const f of files) {
    const r = await measure(browser, [f]);
    console.log(f.padEnd(12), JSON.stringify(r));
  }
  await browser.close();
})();
