// WebKit 对照实验：html,body{overflow-x:clip} 是否会让 9009 在 WebKit 里滚不动
const { webkit } = require('playwright');

const TARGET = 'http://127.0.0.1:9009/';
const UNLOCK = 'html, body { overflow: auto !important; overscroll-behavior: auto !important; position: static !important; inset: auto !important; width: auto !important; height: auto !important; min-height: 100% !important; }';
const CLIP = 'html,body{max-width:100% !important;overflow-x:clip !important}';

const scenarios = [
  { name: 'A 仅 UNLOCK（无 clip）', extra: null },
  { name: 'B UNLOCK + overflow-x:clip（当前线上）', extra: CLIP },
  { name: 'C 仅 clip（模拟旧版）', extra: CLIP, skipUnlock: true },
];

(async () => {
  const browser = await webkit.launch();
  for (const sc of scenarios) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.addInitScript(`(function(){
      var css = ${sc.skipUnlock ? '""' : JSON.stringify(UNLOCK)} + ${JSON.stringify(sc.extra || '')};
      function put(){ if(!document.head) return; var s=document.getElementById('t'); if(!s){s=document.createElement('style');s.id='t';document.head.appendChild(s);} s.textContent=css; }
      put(); document.addEventListener('DOMContentLoaded', put);
    })()`);
    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    const r = await page.evaluate(() => {
      const se = document.scrollingElement || document.documentElement;
      const cs = getComputedStyle(document.documentElement);
      const bs = getComputedStyle(document.body);
      const before = window.scrollY;
      window.scrollTo(0, 500);
      const after = window.scrollY;
      return {
        htmlOvX: cs.overflowX, htmlOvY: cs.overflowY, htmlPos: cs.position,
        bodyOvX: bs.overflowX, bodyOvY: bs.overflowY,
        scrollH: se.scrollHeight, clientH: se.clientHeight,
        before, after, scrollable: after > before,
      };
    });
    console.log(sc.name);
    console.log('   ', JSON.stringify(r));
    await ctx.close();
  }
  await browser.close();
})();
