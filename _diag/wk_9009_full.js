// 真机等价复现：WebKit + 全部 17 个 shim 注入 9009，彻底查清锁在哪
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const SHIM_DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_shims';
const TARGET = process.argv[2] || 'http://127.0.0.1:9009/';

function shimFiles() {
  return fs.readdirSync(SHIM_DIR).filter((f) => /^shim_\d+\.js$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
}

(async () => {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  const files = shimFiles();
  for (const f of files) {
    await page.addInitScript({ content: fs.readFileSync(path.join(SHIM_DIR, f), 'utf8') });
  }
  console.log('注入 shim =', files.length);

  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(4000);

  const r = await page.evaluate(() => {
    const se = document.scrollingElement || document.documentElement;
    const cs = getComputedStyle(document.documentElement);
    const bs = getComputedStyle(document.body);
    const lock = document.getElementById('dsh-ios-page-lock');
    const unlock = document.getElementById('dsh-ios-page-unlock');
    const before = window.scrollY;
    window.scrollTo(0, 500);
    const after = window.scrollY;

    // body 直接子级几何：找 position:fixed 的全屏容器
    const kids = [];
    for (const c of document.body.children) {
      const s = getComputedStyle(c);
      const b = c.getBoundingClientRect();
      kids.push({ tag: c.tagName, id: c.id || '', cls: (c.className || '').toString().slice(0, 24), pos: s.position, ovY: s.overflowY, h: Math.round(b.height), w: Math.round(b.width) });
    }
    return {
      hasRoot: !!document.getElementById('root'),
      lock: !!lock, unlock: !!unlock,
      htmlPos: cs.position, htmlOvX: cs.overflowX, htmlOvY: cs.overflowY, htmlH: cs.height,
      bodyPos: bs.position, bodyOvY: bs.overflowY, bodyH: bs.height,
      scrollH: se.scrollHeight, clientH: se.clientHeight, innerH: window.innerHeight,
      before, after, scrollable: after > before,
      bodyKids: kids.slice(0, 8),
    };
  });
  console.log(JSON.stringify(r, null, 1));

  await browser.close();
})();
