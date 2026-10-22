const { chromium } = require('playwright');
const fs = require('fs');
function loadCSS(f) {
  return fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/' + f, 'utf8')
    .replace(/^[\s\S]*?var CSS = \[/, '').split("].join('\\n');")[0].split('\n')
    .map(l => l.trim().replace(/^'/, '').replace(/',$/, '').replace(/'$/, ''))
    .filter(l => l && !l.startsWith('//')).join('\n');
}
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
  await page.waitForTimeout(900);

  const m = await page.evaluate(() => {
    const posAnc = (el) => {
      let n = el.parentElement, hops = [];
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        hops.push(((n.className || '').toString().split(/\s+/)[0] || n.tagName) + ':' + cs.position);
        if (cs.position !== 'static') break;
        n = n.parentElement;
      }
      return hops.join(' > ');
    };
    const g = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { txt: (el.innerText || '').trim().slice(0, 20), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        disp: cs.display, h: cs.height, anc: posAnc(el) }; };
    const out = { po: [], misc: [], card: null };
    const card = document.querySelector('[class*="composerStack"] [class*="_card"]');
    out.card = g(card);
    document.querySelectorAll('[class*="dsh-po-"]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 6) return;
      out.po.push({ cls: (el.className || '').toString().slice(0, 40), tag: el.tagName, ...g(el) });
    });
    // standardControls 结构树（前两层）
    const sc = document.querySelector('[class*="standardControls"]');
    if (sc) {
      out.scTree = Array.from(sc.children).map(c => {
        const r = c.getBoundingClientRect();
        return { cls: (c.className || '').toString().slice(0, 36), tag: c.tagName, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          kids: Array.from(c.children).map(k => { const kr = k.getBoundingClientRect(); return { cls: (k.className || '').toString().slice(0, 30), tag: k.tagName, rect: [Math.round(kr.x), Math.round(kr.y), Math.round(kr.width), Math.round(kr.height)] }; }) };
      });
      out.scAnc = posAnc(sc);
      out.sc = g(sc);
    }
    // 输入行/卡片行容器
    out.row = g(document.querySelector('[class*="composerStack"] [class*="_row"]'));
    out.seat = g(document.querySelector('[class*="composerSeat"]'));
    return out;
  });
  console.log(JSON.stringify(m, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
