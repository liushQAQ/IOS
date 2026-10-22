const { chromium } = require('playwright');
const fs = require('fs');
function loadCSS(f) {
  return fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/' + f, 'utf8')
    .replace(/^[\s\S]*?var CSS = \[/, '').split("].join('\\n');")[0].split('\n')
    .map(l => l.trim().replace(/^'/, '').replace(/,$/, '').replace(/'$/, ''))
    .filter(l => l && !l.startsWith('//')).join('\n');
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => {
    const bs = [...document.querySelectorAll('button')];
    let best = null;
    for (const x of bs) { const r = x.getBoundingClientRect(); if (r.top < 80 && r.left < 80 && r.width > 0) { if (!best || r.left < best._l) { x._l = r.left; best = x; } } }
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
  for (const f of ['shim21_block.txt', 'shim22_block.txt', 'shim23_block.txt']) await page.addStyleTag({ content: loadCSS(f) });
  // 模拟语音按钮注入（含 App 样式）
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = '.dsh-mobile-voice-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;flex:0 0 auto;border:none;background:transparent;color:#61666b;padding:0;margin:0 2px;}';
    document.head.appendChild(st);
    const tools = document.querySelector('[class*="composerStack"] [class*="_tools"]');
    if (!tools || tools.querySelector('.dsh-mobile-voice-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'dsh-mobile-voice-btn';
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path></svg>';
    const add = tools.querySelector('[class*="_add"]');
    if (add && add.nextSibling) tools.insertBefore(btn, add.nextSibling); else tools.appendChild(btn);
  });
  await page.waitForTimeout(800);

  const m = await page.evaluate(() => {
    const items = [];
    const add = (name, el) => { if (!el) return; const r = el.getBoundingClientRect(); if (r.width < 4) return;
      items.push({ name, cls: (el.className || '').toString().slice(0, 34), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }); };
    add('add', document.querySelector('[class*="composerStack"] [class*="_add"]'));
    add('voice', document.querySelector('.dsh-mobile-voice-btn'));
    add('shield', document.querySelector('[class*="composerStack"] [class*="_trigger"]'));
    add('model', document.querySelector('[class*="standardControls"] [class*="_trigger"]'));
    add('poCapsule', document.querySelector('.dsh-po-capsule'));
    add('dcc', document.querySelector('.dcc-root'));
    add('cmStat', document.querySelector('.cm-stat-entry'));
    add('cmBbox', document.querySelector('.cm-bbox'));
    add('primary', document.querySelector('[class*="composerStack"] button[class*="_primary"]'));
    add('sc', document.querySelector('[class*="standardControls"]'));
    add('tools', document.querySelector('[class*="composerStack"] [class*="_tools"]'));
    add('trailing', document.querySelector('[class*="composerStack"] [class*="_trailing"]'));
    add('card', document.querySelector('[class*="composerStack"] [class*="_card"]'));
    // 两两重叠
    const ov = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      const ix = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      const iy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      if (ix > 1 && iy > 1) ov.push(a.name + '×' + b.name + ' ' + ix + 'x' + iy);
    }
    return { items, ov };
  });
  console.log(JSON.stringify(m, null, 1));
  await page.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/overlap_now.png', clip: { x: 0, y: 730, width: 430, height: 200 } });
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
