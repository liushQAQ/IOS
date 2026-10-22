const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8')
  .split('\n').filter(l => !/^\/\* RAW/.test(l)).join('\n');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);

  // 注入 App 侧 CSS（真机才有）
  await p.evaluate(({ css }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const s = document.createElement('style'); s.id = '__app_css'; s.textContent = css;
    document.head.appendChild(s);
  }, { css: APP_CSS });
  await p.waitForTimeout(500);

  // 打开抽屉
  const opened = await p.evaluate(() => {
    const btn = document.querySelector('[aria-label="打开侧边栏"]')
      || document.querySelector('[aria-label="打开左侧侧边栏"]')
      || document.querySelector('[data-mobile-nav="sidebar-toggle"]');
    if (btn) { btn.click(); return btn.getAttribute('aria-label') || 'clicked'; }
    return 'NOT FOUND';
  });
  await p.waitForTimeout(1800);
  console.log('抽屉打开按钮: ' + opened);

  const r = await p.evaluate(() => {
    const sb = document.querySelector('[class*="sidebarCol"]');
    if (!sb) return { err: 'no sidebarCol' };
    const sq = sb.getBoundingClientRect();
    const cw = document.createElement('canvas');
    const rgb = (v) => v;

    const rows = [];
    sb.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const q = el.getBoundingClientRect();
      if (q.width < 2 || q.height < 2) return;
      const ov = Math.round((q.right - sq.right) * 10) / 10;
      if (ov <= 0.5 && q.left >= sq.left - 0.5) return;
      rows.push({
        tag: el.tagName,
        cls: String(el.className || '').slice(0, 46),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 26),
        x: Math.round(q.x * 10) / 10, right: Math.round(q.right * 10) / 10,
        w: Math.round(q.width * 10) / 10, ov,
        pos: cs.position,
      });
    });
    rows.sort((a, b2) => b2.ov - a.ov);

    // 抽屉直属子级（看谁撑宽）
    const kids = [];
    for (const k of sb.children) {
      const cs = getComputedStyle(k);
      const q = k.getBoundingClientRect();
      kids.push({
        cls: String(k.className || '').slice(0, 44), w: Math.round(q.width),
        h: Math.round(q.height), y: Math.round(q.y),
        bg: cs.backgroundColor, pos: cs.position, of: cs.overflowX,
      });
    }

    // 齿轮
    const gear = document.querySelector('button[aria-label="设置"]');
    const gq = gear ? gear.getBoundingClientRect() : null;
    // 账号菜单行
    const acc = document.querySelector('[aria-label="账号菜单"]');
    const aq = acc ? acc.getBoundingClientRect() : null;

    return {
      sidebar: { x: Math.round(sq.x), w: Math.round(sq.width), h: Math.round(sq.height), right: Math.round(sq.right) },
      vw: innerWidth,
      sbWidthStyle: getComputedStyle(sb).width,
      sbMaxWidth: getComputedStyle(sb).maxWidth,
      sbBg: getComputedStyle(sb).backgroundColor,
      sbOverflowY: getComputedStyle(sb).overflowY,
      rows: rows.slice(0, 28),
      totalRows: rows.length,
      kids,
      gear: gq ? { x: Math.round(gq.x), y: Math.round(gq.y), w: Math.round(gq.width), right: Math.round(gq.right) } : null,
      acc: aq ? { x: Math.round(aq.x), y: Math.round(aq.y), w: Math.round(aq.width), right: Math.round(aq.right) } : null,
    };
  });

  console.log('\n=== 抽屉本体 ===');
  console.log(JSON.stringify(r.sidebar) + '  vw=' + r.vw);
  console.log('width=' + r.sbWidthStyle + '  max-width=' + r.sbMaxWidth + '  overflow-y=' + r.sbOverflowY);
  console.log('bg=' + r.sbBg);
  console.log('\n=== 抽屉直属子级 ===');
  r.kids.forEach(k => console.log('  y=' + k.y + ' ' + k.w + 'x' + k.h + ' pos=' + k.pos + ' of=' + k.of + ' bg=' + k.bg + '  .' + k.cls));
  console.log('\n=== 齿轮 / 账号行 ===');
  console.log('  gear=' + JSON.stringify(r.gear) + '  acc=' + JSON.stringify(r.acc));
  console.log('\n=== 超出抽屉右界（共 ' + r.totalRows + '）===');
  r.rows.forEach(o => console.log('  越界+' + o.ov + ' x=' + o.x + ' right=' + o.right + ' w=' + o.w + ' ' + o.pos + ' ' + o.tag + '.' + o.cls + (o.text ? '  "' + o.text + '"' : '')));

  await p.screenshot({ path: 'drawer_diag_430.png' });
  await b.close();
})();
