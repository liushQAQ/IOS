const { chromium } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag/';
function loadCSS(f) {
  return fs.readFileSync(DIR + f, 'utf8')
    .replace(/^[\s\S]*?var CSS = \[/, '').split("].join('\\n');")[0].split('\n')
    .map(l => l.trim().replace(/^'/, '').replace(/,$/, '').replace(/'$/, ''))
    .filter(l => l && !l.startsWith('//')).join('\n');
}
const ENGINE = fs.readFileSync(DIR + 'shim24_block.txt', 'utf8');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => { const bs=[...document.querySelectorAll('button')]; let best=null; for(const x of bs){const r=x.getBoundingClientRect(); if(r.top<80&&r.left<80&&r.width>0){if(!best||r.left<best._l){x._l=r.left;best=x;}}} if(best)best.click(); }).catch(()=>{});
  await page.waitForTimeout(2000);
  await page.evaluate(() => { for(const el of [...document.querySelectorAll('a,button,[role="button"],li,div')]){const t=(el.innerText||'').trim(); if(t.startsWith('Our Free Model 更新')){el.click();return;}} }).catch(()=>{});
  await page.waitForTimeout(8000);
  for (const f of ['shim21_block.txt', 'shim22_block.txt', 'shim23_block.txt']) await page.addStyleTag({ content: loadCSS(f) });
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
  // 模拟「其他玩家装了一个未知插件」：往卡片顶部塞一个第三方元素
  await page.evaluate(() => {
    const card = document.querySelector('[class*="composerStack"] [class*="_card"]');
    const fake = document.createElement('button');
    fake.className = 'thirdparty-badge-x9';
    fake.textContent = '某插件';
    fake.style.cssText = 'height:22px;padding:0 8px;border-radius:11px;border:1px solid #ddd;background:#fff;font-size:11px;';
    const dcc = document.querySelector('.dcc-root');
    if (dcc && dcc.parentElement) { dcc.parentElement.insertBefore(fake, dcc.nextSibling); } else { card.appendChild(fake); }
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: DIR + 'engine_before.png', clip: { x: 0, y: 726, width: 430, height: 206 } });

  await page.addScriptTag({ content: ENGINE });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: DIR + 'engine_after.png', clip: { x: 0, y: 726, width: 430, height: 206 } });

  const m = await page.evaluate(() => {
    const g = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), cy: Math.round(r.y + r.height / 2) }; };
    const items = { dcc: g('.dcc-root'), po: g('.dsh-po-capsule'), stat: g('.cm-stat-entry'), fake: g('.thirdparty-badge-x9'),
      model: g('[class*="standardControls"] [class*="_trigger"]'), primary: g('[class*="composerStack"] button[class*="_primary"]'),
      sc: g('[class*="standardControls"]') };
    const ov = [];
    const nm = { dcc: items.dcc, po: items.po, stat: items.stat, fake: items.fake, model: items.model, primary: items.primary };
    const ks = Object.keys(nm).filter(k => nm[k]);
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = nm[ks[i]], b = nm[ks[j]];
      const ix = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix > 1 && iy > 1) ov.push(ks[i] + '×' + ks[j] + ' ' + ix + 'x' + iy);
    }
    return { items, ov };
  });
  console.log(JSON.stringify(m, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
