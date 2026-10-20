/* 375 档两红取证：抽屉内溢出元素 + 齿轮中心被谁抢了
   不改任何东西，只打印事实。 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const URL = 'http://127.0.0.1:3083/';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

const PREP = () => {
  const doc = document.createElement('div');
  doc.innerHTML = '<div data-dsh-desktop-recovery></div>';
  document.body.appendChild(doc.firstElementChild);
};

const SCAN = () => {
  const vw = window.innerWidth;
  const sb = document.querySelector('[class*="sidebarCol"]');
  if (!sb) return { noDrawer: true };
  const sq = sb.getBoundingClientRect();
  const chain = el => {
    const out = [];
    let n = el, i = 0;
    while (n && n !== document.body && i < 8) {
      out.push((n.tagName || '').toLowerCase() + '.' + String(n.className || '').slice(0, 40));
      n = n.parentElement; i++;
    }
    return out.join(' < ');
  };
  const det = [];
  sb.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const q = el.getBoundingClientRect();
    if (q.width < 8 || q.height < 6) return;
    if (q.left >= vw - 1 || q.right <= 1) return;
    const over = q.right - sq.right;
    if (over <= 0.5) return;
    det.push({
      tag: el.tagName,
      cls: String(el.className || '').slice(0, 60),
      x: Math.round(q.x), right: Math.round(q.right), w: Math.round(q.width),
      over: Math.round(over * 10) / 10,
      pos: cs.position, disp: cs.display, tr: cs.transform,
      chain: chain(el),
    });
  });
  return {
    vw, drawerX: Math.round(sq.x), drawerRight: Math.round(sq.right),
    n: det.length, det: det.slice(0, 25),
  };
};

const GEAR = () => {
  const gs = Array.from(document.querySelectorAll('button[aria-label="设置"]'))
    .filter(b => getComputedStyle(b).position === 'fixed');
  if (!gs.length) return { noGear: true };
  const g = gs[0], gq = g.getBoundingClientRect();
  const cx = gq.x + gq.width / 2, cy = gq.y + gq.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  const desc = el => {
    if (!el) return 'null';
    const chain = [];
    let n = el, i = 0;
    while (n && n !== document.body && i < 6) {
      chain.push((n.tagName || '').toLowerCase() + '.' + String(n.className || '').slice(0, 40));
      n = n.parentElement; i++;
    }
    return chain.join(' < ') + ' | text=' + (el.textContent || '').trim().slice(0, 24);
  };
  // 命中的那个元素自己的 rect 与 z
  const hcs = hit ? getComputedStyle(hit) : null;
  return {
    gear: { x: Math.round(gq.x), y: Math.round(gq.y), w: Math.round(gq.width), h: Math.round(gq.height), z: getComputedStyle(g).zIndex },
    cx: Math.round(cx), cy: Math.round(cy),
    hitIsGear: hit === g,
    hitContainsGear: !!(hit && hit.contains(g)),
    hitDesc: desc(hit),
    hitZ: hcs ? hcs.zIndex : null,
    hitPos: hcs ? hcs.position : null,
    hitRect: hit ? (r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }))(hit.getBoundingClientRect()) : null,
  };
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true });
  const p = await c.newPage();
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2500);
  await p.evaluate(PREP);
  await p.evaluate(APP_JS);
  await p.evaluate(() => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
  });
  await p.waitForTimeout(600);
  await p.evaluate(() => { try { window.__regTick(); } catch (e) {} });
  await p.waitForTimeout(1500);

  // 打开抽屉
  await p.evaluate(() => {
    const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]');
    if (x) x.click();
  });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { try { window.__regTick(); } catch (e) {} });
  await p.waitForTimeout(3400);
  await p.evaluate(() => { try { window.__regTick(); } catch (e) {} });
  await p.waitForTimeout(1000);

  const sc = await p.evaluate(SCAN);
  const gr = await p.evaluate(GEAR);
  console.log('=== 抽屉扫描 ===');
  console.log(JSON.stringify(sc, null, 2));
  console.log('=== 齿轮命中 ===');
  console.log(JSON.stringify(gr, null, 2));

  await p.screenshot({ path: path.join(DIR, 'diag375_drawer.png') });
  // 只看抽屉区域特写
  await p.screenshot({ path: path.join(DIR, 'diag375_drawer_zoom.png'), clip: { x: 0, y: 0, width: 375, height: 812 } });
  await b.close();
})();
