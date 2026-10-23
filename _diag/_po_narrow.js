const { webkit } = require('playwright');
const OV = (a, b) => !(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1]);
(async () => {
  const b = await webkit.launch({ headless: true });
  for (const W of [1280, 1024]) {
    const p = await (await b.newContext({ viewport: { width: W, height: 800 }, deviceScaleFactor: 1 })).newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForTimeout(8000);
    await p.evaluate(() => {
      for (const c of document.querySelectorAll('[data-slot="sidebar.workspaces"] div')) {
        const t = (c.innerText || '').trim();
        if (t && t.length < 40 && /未命名|修复6066|排队消息/.test(t)) { c.click(); return; }
      }
    });
    await p.waitForTimeout(8000);
    const ed = await p.$('[contenteditable="true"], textarea');
    await ed.click();
    await p.keyboard.type('写个排序', { delay: 12 });
    await p.waitForTimeout(800);
    await p.click('[class*="dsh-po-capsule"]');
    await p.waitForTimeout(2000);
    const geo = await p.evaluate(() => {
      const box = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
      const act = document.querySelector('[data-slot="conversation.session.header.actions"]');
      return { kids: [...act.children].map(c => ({ cls: (typeof c.className === 'string' ? c.className : '').split(' ')[0].slice(0, 22), b: box(c) })), vw: innerWidth };
    });
    // 重叠 / 出屏
    let ov = [];
    for (let i = 0; i < geo.kids.length; i++) for (let j = i + 1; j < geo.kids.length; j++) if (OV(geo.kids[i].b, geo.kids[j].b)) ov.push(geo.kids[i].cls + '×' + geo.kids[j].cls);
    const oos = geo.kids.filter(k => k.b[0] < 0 || k.b[0] + k.b[2] > geo.vw + 1).map(k => k.cls + JSON.stringify(k.b));
    console.log('■ ' + W + '  折叠/展开态=' + JSON.stringify(geo.kids));
    console.log('   重叠=' + (ov.length ? ov.join(',') : '无') + '   出屏=' + (oos.length ? oos.join(',') : '无'));
    // 底排原生按钮是否完整
    const tail = await p.evaluate(() => {
      const box = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
      const sc = document.querySelector('[class*="VERcba_standardControls"]');
      const off = document.querySelector('[class*="ofTiQG_root"]');
      const btn = document.querySelector('[class*="VERcba_primary"]');
      return { sc: box(sc), off: box(off), send: box(btn), offLabel: (document.querySelector('[class*="ofTiQG_triggerLabel"]')?.getBoundingClientRect().width) | 0 };
    });
    console.log('   底排=' + JSON.stringify(tail));
    await p.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/_po_' + W + '.png', clip: { x: 0, y: 0, width: W, height: 50 } });
    await p.context().close();
  }
  await b.close();
})();
