const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(8000);
  await p.evaluate(() => {
    for (const c of document.querySelectorAll('[data-slot="sidebar.workspaces"] div')) {
      const t = (c.innerText || '').trim();
      if (t && t.length < 40 && /未命名|修复6066|排队消息/.test(t)) { c.click(); return; }
    }
  });
  await p.waitForTimeout(9000);
  const ed = await p.$('[contenteditable="true"], textarea');
  await ed.click();
  await p.keyboard.type('帮我写一个冒泡排序', { delay: 15 });
  await p.waitForTimeout(1000);
  const d0 = await p.evaluate(() => { const e = document.querySelector('[contenteditable="true"], textarea'); return e.innerText || e.value; });

  await p.click('[class*="dsh-po-capsule"]');
  // 轮询 25 秒看草稿变化
  let changed = null, t0 = Date.now();
  for (let i = 0; i < 25; i++) {
    await p.waitForTimeout(1000);
    const d = await p.evaluate(() => { const e = document.querySelector('[contenteditable="true"], textarea'); return e.innerText || e.value; });
    const cap = await p.evaluate(() => { const c = document.querySelector('[class*="dsh-po-capsule"]'); return c ? (c.innerText || '').replace(/\s+/g, ' ').slice(0, 20) : null; });
    if (d !== d0) { changed = { at: (Date.now() - t0) / 1000, len: d.length, head: d.slice(0, 80), cap }; break; }
    if (i === 24) changed = { at: 25, unchanged: true, cap };
  }
  console.log('before len=' + d0.length + '  ' + JSON.stringify(d0.slice(0, 30)));
  console.log('result =', JSON.stringify(changed));
  // 展开态几何
  const geo = await p.evaluate(() => {
    const box = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
    const act = document.querySelector('[data-slot="conversation.session.header.actions"]');
    return { kids: [...act.children].map(c => ({ cls: (typeof c.className === 'string' ? c.className : '').split(' ')[0].slice(0, 24), b: box(c) })), vw: innerWidth };
  });
  console.log('expanded geo =', JSON.stringify(geo));
  await p.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/_po_result.png', clip: { x: 280, y: 0, width: 1160, height: 60 } });
  await b.close();
})();
