/* 重启后验证：点进会话页是否还死循环（带 25 秒 evaluate 超时，绝不挂死） */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

const withTO = (p, fn, arg, ms = 25000) => Promise.race([
  p.evaluate(fn, arg),
  new Promise(r => setTimeout(() => r({ __timeout: true }), ms))
]);

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(9000);
  console.log('1 首屏 ' + JSON.stringify(await withTO(p, () => ({
    nodes: document.querySelectorAll('*').length,
    hasWorkspacePicker: !!(document.body.innerText || '').includes('选择工作区'),
    hasComposer: !!document.querySelector('[class*="composerStack"]'),
    sidebarBtn: !!document.querySelector('[aria-label="打开侧边栏"]') || !!document.querySelector('[aria-label="打开左侧侧边栏"]')
  }))));

  await withTO(p, () => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2000);
  const rows = await withTO(p, () => {
    const rs = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    return { n: rs.length, texts: rs.slice(0, 6).map(e => (e.textContent || '').trim().slice(0, 18)) };
  });
  console.log('2 会话列表 ' + JSON.stringify(rows));

  await withTO(p, () => {
    const rs = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rs.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rs[1] || rs[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (const w of [5000, 5000, 5000]) {
    await p.waitForTimeout(w);
    const st = await withTO(p, () => ({ nodes: document.querySelectorAll('*').length, dock: !!document.querySelector('.cm-stat-entry'), hdr: !!document.querySelector('[class*="headerCorner"]') }), 20000);
    console.log('3 会话页 ' + JSON.stringify(st));
  }
  await b.close();
})();
