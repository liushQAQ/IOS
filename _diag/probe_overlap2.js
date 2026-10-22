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
  await page.addStyleTag({ content: STRIP });
  await page.waitForTimeout(1200);

  const m = await race(page.evaluate(() => {
    const g = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { rect: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)],
        bg: cs.backgroundColor, border: cs.borderColor + ' ' + cs.borderWidth, radius: cs.borderRadius }; };
    const q = (s) => g(document.querySelector(s));
    // 模型选择器: 在 standardControls 里找含箭头 svg 的按钮
    const sc = document.querySelector('[class*="composerStack"] [class*="standardControls"]');
    const btns = sc ? [...sc.querySelectorAll('button')].map(b => ({ t: (b.innerText || '').trim().slice(0, 30), cls: (b.className || '').toString().slice(0, 60), ...g(b) })) : [];
    const primary = q('[class*="composerStack"] button[class*="primary"]') || q('[class*="composerStack"] [class*="_primary"]');
    return { card: q('[class*="composerStack"] [class*="_card"]'),
      capsule: q('.dcc-root'), stat: q('.cm-stat-entry'), bbox: q('.cm-bbox'),
      standardControls: q('[class*="composerStack"] [class*="standardControls"]'),
      primary, scBtns: btns };
  }), 15000);
  console.log('MEASURE', JSON.stringify(m, null, 1));
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/probe2_after.png', clip: { x: 0, y: 726, width: 430, height: 206 } });
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
