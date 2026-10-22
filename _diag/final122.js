const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const SIZES = [{ w: 430, h: 932, n: 'iPhone 16 Pro Max' }, { w: 393, h: 852, n: 'iPhone 15 Pro' }, { w: 375, h: 667, n: 'iPhone SE2' }];

// v1.0.122 App 注入（与 Swift 逻辑逐字一致）
const APP_FIX = () => {
  const hd = document.querySelector('header');
  if (hd) {
    hd.style.setProperty('position', 'sticky', 'important');
    hd.style.setProperty('top', '0', 'important');
    hd.style.setProperty('z-index', '999', 'important');
    hd.style.setProperty('display', 'flex', 'important');
    hd.style.setProperty('flex-direction', 'column', 'important');
    hd.style.setProperty('max-width', '100vw', 'important');
    hd.style.setProperty('box-sizing', 'border-box', 'important');
  }
  if (!document.getElementById('__dsh-xclip')) {
    const s = document.createElement('style');
    s.id = '__dsh-xclip';
    s.textContent = 'html, body { overflow-x: clip !important; max-width: 100vw !important; }';
    document.head.appendChild(s);
  }
};

const CORNER_FIX = () => {
  const hcs = document.querySelectorAll('[class*="headerCorner"]');
  const log = [];
  for (const hc of hcs) {
    const q = hc.getBoundingClientRect();
    if (q.width < 4 || q.height < 4) continue;
    const ov = Math.round(q.right - window.innerWidth);
    if (ov > 0) {
      let tx = 0;
      const mt = getComputedStyle(hc).transform;
      if (mt && mt !== 'none') { const mp = mt.replace(/^matrix\(|\)$/g, '').split(','); tx = parseFloat(mp[4]) || 0; }
      hc.style.setProperty('transform', 'translateX(' + (tx - ov) + 'px)', 'important');
      log.push('right=' + Math.round(q.right) + ' ov=' + ov + ' -> tx=' + (tx - ov));
    } else log.push('right=' + Math.round(q.right) + ' ov=' + ov);
  }
  return log;
};

const SCAN = () => {
  const vw = window.innerWidth;
  const bad = [];
  document.querySelectorAll('*').forEach(el => {
    const q = el.getBoundingClientRect();
    if (q.width < 6 || q.height < 6) return;
    const over = Math.round(q.right - vw);
    if (over > 0) bad.push((el.tagName + '.' + String(el.className || '').slice(0, 26)) + ' +' + over);
  });
  window.scrollTo(9999, 0); const sx = window.scrollX; window.scrollTo(0, 0);
  return { vw, docSW: document.documentElement.scrollWidth, canScrollX: sx, over: bad.slice(0, 6), overCount: bad.length };
};

async function openSettings(p) {
  await p.evaluate(() => { const e = document.querySelector('[aria-label="打开侧边栏"]'); if (e) e.click(); });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const a = document.querySelector('[aria-label="账号菜单"]'); if (a) a.click(); });
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    for (const el of document.querySelectorAll('[role="menuitem"],button')) {
      const t = (el.textContent || '').replace(/\s+/g, '');
      if (t.indexOf('设置') === 0) { el.click(); return; }
    }
  });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(900);
}

(async () => {
  for (const S of SIZES) {
    console.log('\n===== ' + S.n + '  ' + S.w + 'x' + S.h + ' =====');
    const b = await webkit.launch({ headless: true });
    const c = await b.newContext({ viewport: { width: S.w, height: S.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(7000);

    await p.evaluate(APP_FIX);
    const r1 = await p.evaluate(SCAN);
    console.log('[修复前] ' + JSON.stringify(r1));

    for (let i = 1; i <= 3; i++) {
      const log = await p.evaluate(CORNER_FIX);
      console.log('  [角标第' + i + '轮] ' + JSON.stringify(log));
      await p.waitForTimeout(450);
    }
    const r2 = await p.evaluate(SCAN);
    console.log('[修复后] ' + JSON.stringify(r2));

    await openSettings(p);
    await p.evaluate(APP_FIX);
    await p.evaluate(CORNER_FIX);
    const st = await p.evaluate(() => {
      const panel = document.querySelector('[class*="tklpSG_panel"]');
      const vw = window.innerWidth;
      let hits = [];
      if (panel) {
        const q = panel.getBoundingClientRect();
        for (const y of [Math.round(q.top + 8), Math.round(q.top + 26)]) {
          const el = document.elementFromPoint(Math.round(q.x + q.width / 2), y);
          hits.push({ y, inPanel: el ? (panel.contains(el) || el === panel) : false, cls: el ? String(el.className || '').slice(0, 26) : null });
        }
      }
      window.scrollTo(9999, 0); const sx = window.scrollX; window.scrollTo(0, 0);
      const bad = [];
      document.querySelectorAll('*').forEach(el => { const q = el.getBoundingClientRect(); if (q.width > 6 && q.height > 6 && Math.round(q.right - vw) > 0) bad.push(String(el.className || el.tagName).slice(0, 26) + '+' + Math.round(q.right - vw)); });
      return { panelFound: !!panel, hits, docSW: document.documentElement.scrollWidth, vw, canScrollX: sx, overCount: bad.length, over: bad.slice(0, 5) };
    });
    console.log('[设置面板] ' + JSON.stringify(st));
    await p.screenshot({ path: 'final122_' + S.w + '.png' });
    await b.close();
  }
})();
