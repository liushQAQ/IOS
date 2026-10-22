const { chromium } = require('playwright');
const fs = require('fs');
const race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r('SENTINEL'), ms))]);

function loadCSS(f) {
  return fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/' + f, 'utf8')
    .replace(/^[\s\S]*?var CSS = \[/, '')
    .split("].join('\\n');")[0]
    .split('\n')
    .map(l => l.trim().replace(/^'/, '').replace(/',$/, '').replace(/'$/, ''))
    .filter(l => l && !l.startsWith('//'))
    .join('\n');
}
const CSS21 = loadCSS('shim21_block.txt');
const CSS22 = loadCSS('shim22_block.txt');

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

  // 修前（只有 shim_21）
  await page.addStyleTag({ content: CSS21 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/merge_before.png', clip: { x: 0, y: 726, width: 430, height: 206 } });

  // 修后（shim_21 + 22）
  await page.addStyleTag({ content: CSS22 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/merge_after.png', clip: { x: 0, y: 726, width: 430, height: 206 } });

  const m = await race(page.evaluate(() => {
    const g = (s) => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { rect: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)], bg: cs.backgroundColor }; };
    const sc = document.querySelector('[class*="composerStack"] [class*="standardControls"]');
    let trig = null;
    if (sc) { for (const b of sc.querySelectorAll('button')) { if ((b.className || '').toString().includes('_trigger')) { const r = b.getBoundingClientRect(); trig = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; } } }
    return { stat: g('.cm-stat-entry'), capsule: g('.dcc-root'), trigger: trig,
      primary: g('[class*="composerStack"] button[class*="primary"]') };
  }), 15000);
  console.log('MEASURE', JSON.stringify(m));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
