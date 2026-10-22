/* v1.0.126 修复验证：模拟 env=59 下（a）会话页顶栏收敛 39（b）详情页 fab 不再压返回行 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync('app_inject.js', 'utf8');
const APP_CSS = fs.readFileSync('app_inject.css', 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  // 顺带检查代理层新 CSS 已生效：真 frame padding 应为 0（不再含 env 规则）
  const served = await (await p.request.get('http://127.0.0.1:3083/dsh-anywhere/client.js')).text().catch(() => '');
  console.log('代理层 client.js 是否还有 env frame padding:', /data-mobile-nav="frame"\s*\{[^}]*env\(safe-area-inset-top/.test(served) ? '❌ 仍在（旧缓存？）' : '✅ 已移除');
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js, css }) => {
    const s = document.createElement('style'); s.id = '__fake_env';
    s.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
    document.head.appendChild(s);
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    try { (0, eval)(js); } catch (e) { console.error(e); }
  }, { js: APP_JS, css: APP_CSS });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
  await p.waitForTimeout(3600);

  // 会话页
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (let i = 0; i < 20; i++) { await p.waitForTimeout(3000); if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry'))) break; }
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(3600);
  await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(800);
  const conv = await p.evaluate(() => {
    const frame = document.querySelector('[data-mobile-nav="frame"]');
    const col = document.querySelector('[class*="centerCol"]');
    const hdr = document.querySelector('header');
    return { framePT: frame ? getComputedStyle(frame).paddingTop : null, colTop: col ? Math.round(col.getBoundingClientRect().top) : null, hdrTop: hdr ? Math.round(hdr.getBoundingClientRect().top) : null };
  });
  console.log('会话页(模拟env=59):', JSON.stringify(conv), conv.hdrTop === 39 ? '✅ 顶栏=39 收敛' : '❌ 顶栏≠39');
  await p.screenshot({ path: 'v126_conv_fixed.png' });

  // 插件详情页
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { const b2 = Array.from(document.querySelectorAll('button')).find(e => (e.textContent || '').trim() === '插件'); if (b2) b2.click(); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const t = document.querySelector('[aria-label^="查看"]') || Array.from(document.querySelectorAll('[class*="cardTitle"]'))[0]; if (t) t.click(); });
  await p.waitForTimeout(3500);
  await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(3600);
  await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(800);
  const det = await p.evaluate(() => {
    const fab = document.querySelector('[data-mobile-nav="fab"]');
    const out = { fabTop: fab ? Math.round(fab.getBoundingClientRect().y) : null };
    if (fab) {
      const fq = fab.getBoundingClientRect();
      const rows = document.querySelectorAll('button, [role="button"], a');
      let worst = null;
      rows.forEach(el => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.position === 'fixed') return;
        const q = el.getBoundingClientRect();
        if (q.width < 200 || q.left > 60 || q.y > 220) return;
        const ox = Math.min(fq.right, q.right) - Math.max(fq.x, q.x);
        const oy = Math.min(fq.bottom, q.bottom) - Math.max(fq.y, q.y);
        if (ox > 6 && oy > 6 && (!worst || ox * oy > worst.area)) worst = { label: el.getAttribute('aria-label') || '', area: ox * oy };
      });
      out.overlap = worst;
    }
    return out;
  });
  console.log('详情页(模拟env=59):', JSON.stringify(det), det.overlap ? '❌ fab 仍压 ' + det.overlap.label : '✅ fab 不压任何行');
  await p.screenshot({ path: 'v126_detail_fixed.png' });
  await b.close();
})();
