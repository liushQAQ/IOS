// 第三步：真正进入会话，量底部费用/CPU 插件 dock 的重叠
const { webkit } = require('playwright');
const fs = require('fs');
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync('app_inject.js','utf8');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) {}
    window.__t = function () { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} }; }, { js: APP_JS });
  await p.waitForTimeout(1200);

  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2000);

  // 列出会话行，点标题最长的那个（有内容的会话才有费用数据）
  const rows = await p.evaluate(() => Array.from(document.querySelectorAll('[class*="sessionRow"]')).map(e => ({
    text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24), w: Math.round(e.getBoundingClientRect().width) })));
  console.log('会话行:', JSON.stringify(rows.slice(0, 8)));

  await p.evaluate(() => {
    const list = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const target = list.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] || list[0];
    if (target) (target.querySelector('button,[role="button"]') || target).click();
  });
  await p.waitForTimeout(6000);
  await p.evaluate(() => window.__t());
  await p.waitForTimeout(3000);
  await p.evaluate(() => window.__t());
  await p.waitForTimeout(1500);

  const r = await p.evaluate(() => {
    const dock = document.querySelector('[data-slot="conversation.composer.dock"]');
    if (!dock) return { none: true, alt: Array.from(document.querySelectorAll('[class*="dock"],[class*="cm-"]')).slice(0, 10).map(e => String(e.className).slice(0, 40)) };
    const q = dock.getBoundingClientRect();
    const leaves = [];
    const walk = (el, d) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const kids = Array.from(el.children).filter(k => getComputedStyle(k).display !== 'none');
      const kq = el.getBoundingClientRect();
      if (!kids.length || d >= 5) {
        if (kq.width > 6 && kq.height > 4) leaves.push({ cls: String(el.className || el.tagName).slice(0, 28),
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22),
          x: Math.round(kq.x), y: Math.round(kq.y), r: Math.round(kq.right), b: Math.round(kq.bottom), w: Math.round(kq.width), h: Math.round(kq.height), pos: cs.position });
        return;
      }
      kids.forEach(k => walk(k, d + 1));
    };
    walk(dock, 0);
    const ov = [];
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], bb = leaves[j];
      const yO = Math.min(a.b, bb.b) - Math.max(a.y, bb.y);
      const xO = Math.min(a.r, bb.r) - Math.max(a.x, bb.x);
      if (yO > 2 && xO > 2) ov.push({ yO, xO, a: a.cls + ' "' + a.text + '"', b: bb.cls + ' "' + bb.text + '"' });
    }
    return { box: { y: Math.round(q.y), h: Math.round(q.height), w: Math.round(q.width) }, n: leaves.length,
      leaves: leaves.slice(0, 30), overlapCount: ov.length, overlaps: ov.slice(0, 12) };
  });
  console.log('===== dock 实测 =====');
  console.log(JSON.stringify(r, null, 1));
  await p.screenshot({ path: 'conv_dock_now.png' });
  await b.close();
})();
