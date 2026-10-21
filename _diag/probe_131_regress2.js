// 二探：composer 各层 rect + dcc/po/stat 包含块链 + cm-* 新类名
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => { const bs=[...document.querySelectorAll('button')]; let best=null; for(const x of bs){const r=x.getBoundingClientRect(); if(r.top<80&&r.left<80&&r.width>0){if(!best||r.left<best._l){x._l=r.left;best=x;}}} if(best)best.click(); }).catch(()=>{});
  await page.waitForTimeout(2000);
  await page.evaluate(() => { for(const el of [...document.querySelectorAll('a,button,[role="button"],li,div')]){const t=(el.innerText||'').trim(); if(t.startsWith('Our Free Model 更新')){el.click();return;}} }).catch(()=>{});
  await page.waitForTimeout(8000);
  const m = await page.evaluate(() => {
    const info = el => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { cls: (el.className || '').toString().slice(0, 46), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position, sticky: cs.position === 'sticky' }; };
    const stack = document.querySelector('[class*="composerStack"]');
    const seat = document.querySelector('[class*="composerSeat"]');
    const card = document.querySelector('[class*="composerStack"] [class*="_card"]');
    // dcc 祖先链：找 positioned 祖先
    const dcc = document.querySelector('.dcc-root');
    let chain = [];
    if (dcc) { let p = dcc.parentElement;
      while (p && p !== document.body) { const cs = getComputedStyle(p);
        if (cs.position !== 'static') chain.push({ cls: (p.className || '').toString().slice(0, 44), pos: cs.position, y: Math.round(p.getBoundingClientRect().y) });
        p = p.parentElement; } }
    // cm-* 全家福
    const cms = [...document.querySelectorAll('[class*="cm-"]')].slice(0, 8).map(e => ({ cls: e.className.toString().slice(0, 40), y: Math.round(e.getBoundingClientRect().y) }));
    // WB INTL / 费用明细 文本所在元素
    const findTxt = t => { const els = [...document.querySelectorAll('button,div,span')].filter(e => (e.innerText || '').trim().startsWith(t) && (e.innerText || '').length < 40);
      return els.slice(0, 2).map(e => ({ cls: (e.className || '').toString().slice(0, 44), y: Math.round(e.getBoundingClientRect().y), x: Math.round(e.getBoundingClientRect().x) })); };
    return {
      stack: info(stack), seat: info(seat), card: info(card),
      dccChain: chain,
      cms,
      wb: findTxt('WB INTL'),
      fee: findTxt('费用明细'),
      hero: info(document.querySelector('[class*="composerHero"]')),
      dockRow: info(document.querySelector('[class*="_dock"]')),
      tools: info(document.querySelector('[class*="_tools"]')),
    };
  }).catch(e => ({ evalFail: e.message }));
  console.log(JSON.stringify(m, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
