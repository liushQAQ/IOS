const { chromium } = require('playwright');
const fs = require('fs');
function loadCSS(f) {
  return fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/' + f, 'utf8')
    .replace(/^[\s\S]*?var CSS = \[/, '').split("].join('\\n');")[0].split('\n')
    .map(l => l.trim().replace(/^'/, '').replace(/',$/, '').replace(/'$/, ''))
    .filter(l => l && !l.startsWith('//')).join('\n');
}
const NEW = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/shim23_draft.css', 'utf8');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    let best = null;
    for (const b of btns) { const r = b.getBoundingClientRect(); if (r.top < 80 && r.left < 80 && r.width > 0) { if (!best || r.left < best._l) { b._l = r.left; best = b; } } }
    if (best) best.click();
  }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    for (const el of [...document.querySelectorAll('a,button,[role="button"],li,div')]) {
      const t = (el.innerText || '').trim();
      if (t.startsWith('Our Free Model 更新')) { el.click(); return; }
    }
  }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.addStyleTag({ content: loadCSS('shim21_block.txt') });
  await page.addStyleTag({ content: loadCSS('shim22_block.txt') });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/row_before.png', clip: { x: 0, y: 726, width: 430, height: 206 } });
  await page.addStyleTag({ content: NEW });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/row_after.png', clip: { x: 0, y: 726, width: 430, height: 206 } });

  const m = await page.evaluate(() => {
    const g = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], cy: Math.round(r.y + r.height / 2), ov: cs.overflow }; };
    return { dcc: g('.dcc-root'), stat: g('.cm-stat-entry'), bbox: g('.cm-bbox'), po: g('.dsh-po-capsule'),
      card: g('[class*="composerStack"] [class*="_card"]'),
      sc: g('[class*="standardControls"]'), scOverflow: g('[class*="standardControls"]') ? getComputedStyle(document.querySelector('[class*="standardControls"]')).overflow : null,
      primary: g('[class*="composerStack"] button[class*="primary"]') };
  });
  console.log(JSON.stringify(m));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
