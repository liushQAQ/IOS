const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => { const r = x.getBoundingClientRect(); return r.x < 60 && r.y < 70 && r.width > 0; }); if (b) b.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { [...document.querySelectorAll('[class*="projectRow"]')].forEach((r) => { try { r.click(); } catch (e) {} }); });
  await p.waitForTimeout(2200);
  await p.evaluate(() => { const a = [...document.querySelectorAll('[class*="sessionRow"]')]; const t = a.find((r) => !/新会话|新建会话/.test((r.innerText || '').trim())); if (t) t.click(); });
  await p.waitForTimeout(9000);

  const dump = await p.evaluate(() => {
    const out = [];
    const row = document.querySelector('[class*="titleRow"]');
    if (!row) return ['titleRow 不存在'];
    const walk = (el, d) => {
      if (d > 3) return;
      const b = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const slot = el.getAttribute('data-slot');
      const t = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 20);
      out.push('  '.repeat(d) + el.tagName + ' .' + String(el.className || '').slice(0, 24)
        + (slot ? ' [slot=' + slot + ']' : '')
        + ' [' + [b.x, b.y, b.width, b.height].map(Math.round).join(',') + ']'
        + ' pos=' + s.position + ' disp=' + s.display + ' flex=' + s.flex
        + ' minW=' + s.minWidth + ' ovf=' + s.overflow + ' ws=' + s.whiteSpace
        + (t ? ' 「' + t + '」' : ''));
      [...el.children].forEach((k) => walk(k, d + 1));
    };
    walk(row, 0);
    // 父链
    let cur = row.parentElement;
    const chain = [];
    for (let i = 0; i < 4 && cur; i++) { chain.push(cur.tagName + '.' + String(cur.className || '').slice(0, 24)); cur = cur.parentElement; }
    out.push('父链: ' + chain.join(' < '));
    return out;
  });
  console.log(dump.join('\n'));

  // 所有 header 相关 slot
  const slots = await p.evaluate(() => [...document.querySelectorAll('[data-slot]')]
    .map((e) => e.getAttribute('data-slot'))
    .filter((n) => n.includes('header') || n.includes('conversation')));
  console.log('\nheader 相关 slot: ' + JSON.stringify([...new Set(slots)]));
  await browser.close();
})();
