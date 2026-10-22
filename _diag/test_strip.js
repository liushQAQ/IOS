const { chromium } = require('playwright');
const fs = require('fs');
const race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r('SENTINEL'), ms))]);

const STRIP = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/shim21_block.txt', 'utf8')
  .replace(/^[\s\S]*?var CSS = \[/, '')
  .split("].join('\\n');")[0]
  .split('\n')
  .map(l => l.trim().replace(/^'/, '').replace(/',$/, '').replace(/'$/, ''))
  .filter(l => l && !l.startsWith('//'))
  .join('\n');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    let best = null;
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.top < 80 && r.left < 80 && r.width > 0) { if (!best || r.left < best._l) { b._l = r.left; best = b; } }
    }
    if (best) best.click();
  }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('a,button,[role="button"],li,div')];
    for (const el of els) {
      const t = (el.innerText || '').trim();
      if (t.startsWith('Our Free Model 更新')) { el.click(); return; }
    }
  }).catch(() => {});
  await page.waitForTimeout(8000);

  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/strip_before.png', clip: { x: 0, y: 760, width: 430, height: 172 } });
  await page.addStyleTag({ content: STRIP });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/strip_after.png', clip: { x: 0, y: 726, width: 430, height: 206 } });
  const m = await race(page.evaluate(() => {
    const g = (s) => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
    return { capsule: g('.dcc-root'), stat: g('.cm-stat-entry'), bbox: g('.cm-bbox'), card: g('[class*="composerStack"] [class*="_card"]'), row: g('[class*="composerStack"] [class*="_row"]'), dock: g('[class*="composerStack"] [class*="_dock"]') };
  }), 15000);
  console.log('MEASURE', JSON.stringify(m));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
