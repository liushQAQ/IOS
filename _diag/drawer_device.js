const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8')
  .split('\n').filter(l => !/^\/\* RAW/.test(l)).join('\n');

const DRAWER_W = 252;

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);

  await p.evaluate(({ css }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const s = document.createElement('style'); s.id = '__app_css'; s.textContent = css;
    document.head.appendChild(s);
  }, { css: APP_CSS });
  await p.waitForTimeout(400);

  // 复刻真机 applyDrawerWidth
  await p.evaluate((W) => {
    document.querySelectorAll('[class*="sidebarCol"], .CZPbNW_sidebarCol').forEach(el => {
      el.style.setProperty('width', W + 'px', 'important');
      el.style.setProperty('min-width', W + 'px', 'important');
      el.style.setProperty('max-width', W + 'px', 'important');
    });
  }, DRAWER_W);

  const opened = await p.evaluate(() => {
    const btn = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]');
    if (btn) { btn.click(); return btn.getAttribute('aria-label'); }
    return 'NOT FOUND';
  });
  await p.waitForTimeout(1800);
  await p.evaluate((W) => {
    document.querySelectorAll('[class*="sidebarCol"], .CZPbNW_sidebarCol').forEach(el => {
      el.style.setProperty('width', W + 'px', 'important');
      el.style.setProperty('min-width', W + 'px', 'important');
      el.style.setProperty('max-width', W + 'px', 'important');
    });
  }, DRAWER_W);
  await p.waitForTimeout(600);
  console.log('抽屉打开: ' + opened);

  const r = await p.evaluate(() => {
    const sb = document.querySelector('[class*="sidebarCol"]');
    const sq = sb.getBoundingClientRect();
    // 找真正承载内容的根（子级里面积最大的）
    let root = null, best = 0;
    sb.querySelectorAll('div').forEach(d => {
      const q = d.getBoundingClientRect();
      const a = q.width * q.height;
      if (a > best && q.width > 100) { best = a; root = d; }
    });

    const rows = [];
    sb.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const q = el.getBoundingClientRect();
      if (q.width < 6 || q.height < 6) return;
      const ov = Math.round((q.right - sq.right) * 10) / 10;
      if (ov <= 0.5 && q.left >= sq.left - 0.5) return;
      rows.push({
        tag: el.tagName, cls: String(el.className || '').slice(0, 44),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24),
        x: Math.round(q.x * 10) / 10, right: Math.round(q.right * 10) / 10,
        w: Math.round(q.width * 10) / 10, ov, pos: cs.position,
        of: cs.overflowX, ws: cs.whiteSpace,
      });
    });
    rows.sort((a, b2) => b2.ov - a.ov);

    // 底部区域：所有 y>820 的元素，按 y 排序，看重叠
    const bottom = [];
    sb.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const q = el.getBoundingClientRect();
      if (q.height < 6 || q.width < 6) return;
      if (q.bottom < 800) return;
      bottom.push({
        tag: el.tagName, cls: String(el.className || '').slice(0, 40),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18),
        y: Math.round(q.y), h: Math.round(q.height), x: Math.round(q.x), w: Math.round(q.width),
        pos: cs.position, bg: cs.backgroundColor, z: cs.zIndex,
      });
    });
    bottom.sort((a, b2) => a.y - b2.y);

    const gear = document.querySelector('button[aria-label="设置"]');
    const gq = gear ? gear.getBoundingClientRect() : null;
    const acc = document.querySelector('[aria-label="账号菜单"]');
    const aq = acc ? acc.getBoundingClientRect() : null;

    return {
      sidebar: { x: Math.round(sq.x), w: Math.round(sq.width), right: Math.round(sq.right), h: Math.round(sq.height) },
      rootCls: root ? String(root.className).slice(0, 50) : null,
      rootW: root ? Math.round(root.getBoundingClientRect().width) : null,
      rows: rows.slice(0, 30), totalRows: rows.length,
      bottom: bottom.slice(0, 26),
      gear: gq ? { x: Math.round(gq.x), y: Math.round(gq.y), w: Math.round(gq.width), right: Math.round(gq.right) } : null,
      acc: aq ? { x: Math.round(aq.x), y: Math.round(aq.y), w: Math.round(aq.width), right: Math.round(aq.right) } : null,
    };
  });

  console.log('\n=== 抽屉 ===');
  console.log(JSON.stringify(r.sidebar) + '  内容根=' + r.rootCls + ' w=' + r.rootW);
  console.log('齿轮=' + JSON.stringify(r.gear) + '  账号行=' + JSON.stringify(r.acc));
  console.log('\n=== 超出抽屉右界（共 ' + r.totalRows + ' 个）===');
  r.rows.forEach(o => console.log('  +' + o.ov + ' x=' + o.x + ' right=' + o.right + ' w=' + o.w + ' ' + o.pos + ' of=' + o.of + ' ws=' + o.ws + ' ' + o.tag + '.' + o.cls + (o.text ? '  "' + o.text + '"' : '')));
  console.log('\n=== 底部区 y>800（看重叠）===');
  r.bottom.forEach(o => console.log('  y=' + o.y + ' h=' + o.h + ' x=' + o.x + ' w=' + o.w + ' ' + o.pos + ' z=' + o.z + ' bg=' + o.bg + ' ' + o.tag + '.' + o.cls + (o.text ? '  "' + o.text + '"' : '')));

  await p.screenshot({ path: 'drawer_device_430.png' });
  await b.close();
})();
