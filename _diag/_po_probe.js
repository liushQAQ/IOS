const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const logs = [];
  p.on('pageerror', e => logs.push('[err] ' + String(e).slice(0, 180)));
  p.on('console', m => { const t = m.text(); if (/prompt-optimizer|dsh-po/i.test(t)) logs.push('[' + m.type() + '] ' + t.slice(0, 180)); });
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(8000);
  await p.evaluate(() => {
    for (const c of document.querySelectorAll('[data-slot="sidebar.workspaces"] div')) {
      const t = (c.innerText || '').trim();
      if (t && t.length < 40 && /未命名|修复6066|排队消息/.test(t)) { c.click(); return; }
    }
  });
  await p.waitForTimeout(9000);
  const r = await p.evaluate(() => {
    const box = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
    const out = {};
    const po = document.querySelector('[class*="dsh-po-capsule"]');
    out.poCount = document.querySelectorAll('[class*="dsh-po-capsule"]').length;
    out.poCapsule = box(po);
    if (po) { let n = po; for (let i = 0; i < 12 && n; i++) { if (n.getAttribute && n.getAttribute('data-slot')) { out.poSlot = n.getAttribute('data-slot'); break; } n = n.parentElement; } }
    const act = document.querySelector('[data-slot="conversation.session.header.actions"]');
    out.poInActions = !!(po && act && act.contains(po));
    out.actKids = act ? [...act.children].map(c => ({ cls: (typeof c.className === 'string' ? c.className : '').split(' ')[0].slice(0, 26), b: box(c) })) : null;
    const card = document.querySelector('[class*="composerStack"]');
    out.poInCard = !!(po && card && card.contains(po));
    const rightSlot = document.querySelector('[data-slot="conversation.input.right"]');
    out.rightInner = rightSlot ? [...rightSlot.querySelectorAll('*')].map(e => (typeof e.className === 'string' ? e.className : '')).filter(Boolean).slice(0, 8) : null;
    // 底排所有可见按钮
    const tools = document.querySelector('[class*="VERcba_tools"]');
    const tr = document.querySelector('[class*="VERcba_trailing"]');
    out.tools = tools ? [...tools.children].map(c => ({ cls: (typeof c.className === 'string' ? c.className : '').split(' ')[0].slice(0, 30), b: box(c) })) : null;
    out.trailing = tr ? [...tr.children].map(c => ({ cls: (typeof c.className === 'string' ? c.className : '').split(' ')[0].slice(0, 30), b: box(c) })) : null;
    out.off = box(document.querySelector('[class*="ofTiQG_root"]'));
    out.dcc = box(document.querySelector('[class*="dcc-root"]'));
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('LOGS:', logs.slice(0, 8).join(' || '));
  await b.close();
})();
