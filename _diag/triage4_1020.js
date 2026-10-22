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
  await p.waitForTimeout(1000);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2000);
  const clicked = await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (!t) return null;
    const r = t.getBoundingClientRect();
    // 点行中心（躲开右端时间戳）
    const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2);
    if (el) el.click();
    return { text: (t.textContent || '').slice(0, 20), hit: el ? String(el.className || el.tagName).slice(0, 30) : null };
  });
  console.log('点击:', JSON.stringify(clicked));
  // 轮询等 dock 出现，最多 60 秒
  let dock = null;
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(3000);
    await p.evaluate(() => window.__t());
    dock = await p.evaluate(() => !!document.querySelector('[data-slot="conversation.composer.dock"]'));
    if (dock) break;
  }
  console.log('dock 出现:', dock);
  if (dock) {
    const r = await p.evaluate(() => {
      const d = document.querySelector('[data-slot="conversation.composer.dock"]');
      const dq = d.getBoundingClientRect();
      const cs = getComputedStyle(d);
      const leaves = [];
      const walk = (el, dep) => {
        const c2 = getComputedStyle(el);
        if (c2.display === 'none' || c2.visibility === 'hidden') return;
        const kids = Array.from(el.children).filter(k => getComputedStyle(k).display !== 'none');
        const q = el.getBoundingClientRect();
        if (!kids.length || dep >= 5) {
          if (q.width > 6 && q.height > 4) leaves.push({ cls: String(el.className || el.tagName).slice(0, 28),
            text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22),
            x: Math.round(q.x), y: Math.round(q.y), r: Math.round(q.right), b: Math.round(q.bottom), w: Math.round(q.width), h: Math.round(q.height), pos: c2.position, disp: c2.display });
          return;
        }
        kids.forEach(k => walk(k, dep + 1));
      };
      walk(d, 0);
      const ov = [];
      for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i], b2 = leaves[j];
        const yO = Math.min(a.b, b2.b) - Math.max(a.y, b2.y);
        const xO = Math.min(a.r, b2.r) - Math.max(a.x, b2.x);
        if (yO > 2 && xO > 2) ov.push({ yO, xO, a: a.cls + ' "' + a.text + '"', b: b2.cls + ' "' + b2.text + '"' });
      }
      return { dockDisp: cs.display, dockFlexDir: cs.flexDirection, box: { y: Math.round(dq.y), h: Math.round(dq.height), w: Math.round(dq.width) },
        n: leaves.length, leaves: leaves.slice(0, 32), overlapCount: ov.length, overlaps: ov.slice(0, 12) };
    });
    console.log(JSON.stringify(r, null, 1));
    await p.screenshot({ path: 'conv_dock_now.png' });
  }
  await b.close();
})();
