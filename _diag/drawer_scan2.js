const { webkit } = require('playwright');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);
  await p.evaluate(() => { const e = document.querySelector('[aria-label="打开侧边栏"]'); if (e) e.click(); });
  await p.waitForTimeout(1500);

  const r = await p.evaluate(() => {
    const a = document.querySelector('[aria-label="账号菜单"]');
    const out = { account: null, children: [], probes: [] };
    if (a) {
      const q = a.getBoundingClientRect();
      out.account = { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height), cls: String(a.className).slice(0, 40) };
      // 递归列出所有后代
      const walk = (el, depth) => {
        for (const ch of el.children) {
          const cq = ch.getBoundingClientRect();
          if (cq.width < 2 || cq.height < 2) { walk(ch, depth + 1); continue; }
          out.children.push('  '.repeat(depth) + ch.tagName + ' ' + Math.round(cq.x) + ',' + Math.round(cq.y) + ' ' +
            Math.round(cq.width) + 'x' + Math.round(cq.height) +
            (ch.getAttribute && ch.getAttribute('aria-label') ? ' [aria:' + ch.getAttribute('aria-label') + ']' : '') +
            ' "' + (ch.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16) + '" ' + String(ch.className || '').slice(0, 30));
          walk(ch, depth + 1);
        }
      };
      walk(a, 1);
    }
    // 探测齿轮落点 230~262 / 868~900 中心 (246, 884) 命中谁
    for (const [x, y, tag] of [[246, 884, '齿轮中心'], [236, 884, '齿轮左侧'], [258, 884, '齿轮右侧'], [246, 870, '齿轮上'], [246, 898, '齿轮下']]) {
      const el = document.elementFromPoint(x, y);
      out.probes.push(tag + '(' + x + ',' + y + ') -> ' + (el ? el.tagName + '.' + String(el.className || '').slice(0, 26) + ' "' + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 12) + '"' : 'null'));
    }
    // 找抽屉内所有空白候选位（右侧空白带）
    const s = document.querySelector('[class*="sidebarCol"]');
    const sr = s.getBoundingClientRect();
    const cands = [];
    for (let y = Math.round(sr.y) + 40; y < sr.bottom - 40; y += 24) {
      for (let x = Math.round(sr.x) + 16; x < sr.right - 40; x += 24) {
        const el = document.elementFromPoint(x + 16, y + 16);
        if (!el) continue;
        // 只有命中普通容器（非 button/link/交互元素）才算空白
        const interactive = el.closest('button,a,[role="button"],[role="menuitem"]');
        if (!interactive) cands.push({ x, y, hit: el.tagName + '.' + String(el.className || '').slice(0, 20) });
      }
    }
    // 只保留靠近底部/顶部的、且先做去重（按 y 选每组最右一个）
    const byY = {};
    for (const c of cands) { if (!byY[c.y] || c.x > byY[c.y].x) byY[c.y] = c; }
    out.blank = Object.values(byY).slice(0, 14);
    return out;
  });

  console.log('[账号菜单] ' + JSON.stringify(r.account));
  console.log('[后代]'); r.children.forEach(c => console.log('  ' + c));
  console.log('[落点探测]'); r.probes.forEach(c => console.log('  ' + c));
  console.log('[空白候选]'); r.blank.forEach(c => console.log('  x=' + c.x + ' y=' + c.y + ' -> ' + c.hit));
  await b.close();
})();
