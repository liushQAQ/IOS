const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const p = await c.newPage();
  const reqs = [];
  p.on('request', r => { const u = r.url(); if (u.indexOf('/api/') >= 0) reqs.push(r.method() + ' ' + u.replace('http://127.0.0.1:3083', '')); });
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);
  // 清弹窗
  for (let i = 0; i < 4; i++) {
    const dlg = await p.evaluate(() => !!document.querySelector('dialog[open]'));
    if (!dlg) break;
    const rc = await p.evaluate(() => { const els = Array.from(document.querySelectorAll('*')).filter(e => (e.textContent || '').trim() === '知道了' && e.getBoundingClientRect().width > 10 && e.children.length === 0); if (!els.length) return null; const r = els[els.length - 1].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (!rc) break;
    await p.mouse.click(rc.x, rc.y); await p.waitForTimeout(1000);
  }
  const n0 = reqs.length;
  // 用 locator 真实点击「选择工作区」
  try { await p.click('text=选择工作区', { timeout: 5000 }); } catch (e) { console.log('click fail', e.message.slice(0, 80)); }
  await p.waitForTimeout(6000);
  console.log('NEW REQS AFTER CLICK:'); console.log(reqs.slice(n0).slice(0, 20).join('\n') || '(none)');
  // dump 弹层
  const pop = await p.evaluate(() => {
    const cand = Array.from(document.querySelectorAll('div')).filter(e => { const cs = getComputedStyle(e); return (cs.position === 'fixed' || cs.position === 'absolute') && e.getBoundingClientRect().height > 40 && e.getBoundingClientRect().height < 400 && e.getBoundingClientRect().width < 430 && (e.textContent || '').length > 0 && (e.textContent || '').length < 200; });
    return cand.slice(-5).map(e => ({ cls: (e.className || '').toString().slice(0, 50), txt: (e.textContent || '').trim().slice(0, 80) }));
  });
  console.log('POPUPS:', JSON.stringify(pop, null, 1));
  await p.screenshot({ path: 'E:/desktop/所有skill/deepseek-harness-ios/_diag/_flx_ws2.png' });
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
