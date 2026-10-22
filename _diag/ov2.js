const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

const R = el => { const q = el.getBoundingClientRect(); return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height), right: Math.round(q.right), bottom: Math.round(q.bottom) }; };

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);

  // 进一个有会话的页面：点抽屉里的会话项
  await p.evaluate(() => { const e = document.querySelector('[aria-label="打开侧边栏"]'); if (e) e.click(); });
  await p.waitForTimeout(1500);
  const clicked = await p.evaluate(() => {
    const cands = [...document.querySelectorAll('a,button,[role="button"],li,div')].filter(el => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const q = el.getBoundingClientRect();
      return t.length > 1 && t.length < 30 && q.width > 120 && q.height > 20 && q.height < 60 && q.x < 280 && q.y > 200;
    });
    if (cands[0]) { cands[0].click(); return (cands[0].textContent || '').trim().slice(0, 24); }
    return null;
  });
  await p.waitForTimeout(3000);
  console.log('点进会话: ' + clicked);

  const s1 = await p.evaluate(() => {
    const iw = innerWidth;
    const de = document.documentElement, bd = document.body;
    const over = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const q = el.getBoundingClientRect();
      if (q.width < 2 || q.height < 2) continue;
      if (q.right > iw + 1 && q.left < iw) {
        over.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 44), x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height), right: Math.round(q.right), over: Math.round(q.right - iw), z: cs.zIndex });
      }
    }
    over.sort((a, b) => b.over - a.over);
    return { vw: iw, docSW: de.scrollWidth, bodySW: bd.scrollWidth, over: over.slice(0, 10) };
  });
  console.log('\n[会话页] ' + JSON.stringify(s1, null, 1));
  await p.screenshot({ path: 'ov2_session.png' });

  // 打开设置，测 z-index 层叠
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
  await p.waitForTimeout(2000);

  const s2 = await p.evaluate(() => {
    const iw = innerWidth;
    const hd = document.querySelector('header');
    const panel = document.querySelector('[class*="tklpSG_panel"]');
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].map(el => ({ cls: String(el.className || '').slice(0, 30), r: null }));
    const over = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const q = el.getBoundingClientRect();
      if (q.width < 2 || q.height < 2) continue;
      if (q.right > iw + 1 && q.left < iw) over.push({ cls: String(el.className || '').slice(0, 44), right: Math.round(q.right), over: Math.round(q.right - iw), z: cs.zIndex, pos: cs.position });
    }
    over.sort((a, b) => b.over - a.over);
    const pr = panel ? panel.getBoundingClientRect() : null;
    return {
      vw: iw, docSW: document.documentElement.scrollWidth,
      headerZ: hd ? getComputedStyle(hd).zIndex : null,
      headerPos: hd ? getComputedStyle(hd).position : null,
      panel: pr ? { x: Math.round(pr.x), y: Math.round(pr.y), w: Math.round(pr.width), h: Math.round(pr.height) } : null,
      panelZ: panel ? getComputedStyle(panel).zIndex : null,
      panelParentZ: panel && panel.parentElement ? getComputedStyle(panel.parentElement).zIndex : null,
      panelParentPos: panel && panel.parentElement ? getComputedStyle(panel.parentElement).position : null,
      over: over.slice(0, 8),
    };
  });
  console.log('\n[设置面板] ' + JSON.stringify(s2, null, 1));
  await p.screenshot({ path: 'ov2_settings.png' });
  console.log('页面错误: ' + errs.length + ' ' + JSON.stringify(errs.slice(0, 2)));
  await b.close();
})();
