// 体检插件条四 shim 在当前前端（mrdrr7）的存活状态
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
  // 注入 21~23 CSS + 语音按钮 + 引擎（复刻 App 环境前半）
  for (const f of ['shim21_block.txt', 'shim22_block.txt', 'shim23_block.txt']) await page.addStyleTag({ content: loadCSS(f) }).catch(e => console.log('css fail', f, e.message));
  await page.waitForTimeout(600);
  const probe1 = await page.evaluate(() => {
    const g = s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position, top: cs.top, left: cs.left, display: cs.display }; };
    const card = document.querySelector('[class*="composerStack"] [class*="_card"]');
    return {
      cardExists: !!card,
      cardCls: card ? card.className.toString().slice(0, 50) : null,
      cardPadTop: card ? getComputedStyle(card).paddingTop : null,
      beforeContent: card ? getComputedStyle(card, '::before').content : null,
      dcc: g('.dcc-root'),
      dccAny: [...document.querySelectorAll('[class*="dcc-"]')].slice(0, 3).map(e => e.className.toString().slice(0, 40)),
      po: g('.dsh-po-capsule'),
      stat: g('.cm-stat-entry'),
      composerStackCls: (document.querySelector('[class*="composerStack"]') || {}).className,
      stackClsSample: [...document.querySelectorAll('[class*="composerStack"] *')].slice(0, 1).map(e => e.className && e.className.toString().slice(0, 40)),
      cbaSample: [...document.querySelectorAll('[class*="VERcba_"]')].length,
      anyTools: !!document.querySelector('[class*="_tools"]'),
      toolsCls: (document.querySelector('[class*="_tools"]') || { className: null }).className && document.querySelector('[class*="_tools"]').className.toString().slice(0, 40),
    };
  }).catch(e => ({ evalFail: e.message }));
  console.log('PROBE1(after 21-23 css):', JSON.stringify(probe1, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
