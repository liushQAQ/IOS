/* 决定性实验：模拟真机 env(safe-area-inset-top)=59
   注入与 dsh-anywhere mobile.css.ts:452 完全同款的规则（padding-top:59px !important），
   然后跑完整 App JS，看 frame padding 是否真被清掉、header 是否回到 39。
   同时测插件详情页 fab 与左上角侧边栏/返回按钮的重叠（老总问题1）。 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const MEASURE = () => {
  const frame = document.querySelector('[data-mobile-nav="frame"]');
  const col = document.querySelector('[class*="centerCol"]');
  const hdr = document.querySelector('header');
  const out = {
    framePT: frame ? getComputedStyle(frame).paddingTop : null,
    frameInlinePT: frame ? (frame.style.getPropertyValue('padding-top') || '(none)') : null,
    colTop: col ? Math.round(col.getBoundingClientRect().top) : null,
    colMT: col ? getComputedStyle(col).marginTop : null,
    hdrTop: hdr ? Math.round(hdr.getBoundingClientRect().top) : null,
  };
  // 顶区按钮两两重叠
  const btns = [];
  document.querySelectorAll('button').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const q = el.getBoundingClientRect();
    if (q.width < 8 || q.height < 8 || q.y > 180) return;
    btns.push({ label: el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 10), x: q.x, y: q.y, r: q.right, b: q.bottom, fixed: cs.position === 'fixed' });
  });
  const pairs = [];
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i], b2 = btns[j];
    const ox = Math.min(a.r, b2.r) - Math.max(a.x, b2.x), oy = Math.min(a.b, b2.b) - Math.max(a.y, b2.y);
    if (ox > 4 && oy > 4) pairs.push([a.label, b2.label, Math.round(ox) + 'x' + Math.round(oy)]);
  }
  out.topButtons = btns.slice(0, 12);
  out.pairs = pairs;
  return out;
};

(async () => {
  const b = await webkit.launch({ headless: true });
  for (const [tag, w, h] of [['conv+plugin', 430, 932]]) {
    const c = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(7000);
    // ① 模拟真机 env=59：与 dsh-anywhere 同款选择器同款优先级
    await p.evaluate(() => {
      const s = document.createElement('style'); s.id = '__fake_env';
      s.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
      document.head.appendChild(s);
    });
    // ② 注入 App CSS + JS（真机顺序：CSS 由 WKUserScript/evaluateJavaScript 注入）
    await p.evaluate(({ js, css }) => {
      const st = document.createElement('style'); st.id = '__app_css'; st.textContent = css;
      document.head.appendChild(st);
      try { (0, eval)(js); } catch (e) {}
    }, { js: APP_JS, css: APP_CSS });
    await p.waitForTimeout(1200);
    await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) {} });
    await p.waitForTimeout(3600);
    await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
    await p.waitForTimeout(800);
    const m1 = await p.evaluate(MEASURE);
    console.log('===== 首页（模拟 env=59）=====');
    console.log(JSON.stringify({ framePT: m1.framePT, frameInlinePT: m1.frameInlinePT, colTop: m1.colTop, colMT: m1.colMT, hdrTop: m1.hdrTop, pairs: m1.pairs }, null, 1));
    await p.screenshot({ path: path.join(DIR, 'r126b_home_fake59.png') });

    // 进会话
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
    const m2 = await p.evaluate(MEASURE);
    console.log('===== 会话页（模拟 env=59）=====');
    console.log(JSON.stringify({ framePT: m2.framePT, frameInlinePT: m2.frameInlinePT, colTop: m2.colTop, colMT: m2.colMT, hdrTop: m2.hdrTop, pairs: m2.pairs }, null, 1));
    console.log('顶区按钮:', JSON.stringify(m2.topButtons));
    await p.screenshot({ path: path.join(DIR, 'r126b_conv_fake59.png') });

    // 插件页
    await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
    await p.waitForTimeout(1800);
    await p.evaluate(() => { const b2 = Array.from(document.querySelectorAll('button')).find(e => (e.textContent || '').trim() === '插件'); if (b2) b2.click(); });
    await p.waitForTimeout(3000);
    await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
    await p.waitForTimeout(2500);
    await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
    await p.waitForTimeout(3600);
    await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
    await p.waitForTimeout(800);
    const m3 = await p.evaluate(MEASURE);
    console.log('===== 插件列表页（模拟 env=59）=====');
    console.log(JSON.stringify({ framePT: m3.framePT, frameInlinePT: m3.frameInlinePT, colTop: m3.colTop, hdrTop: m3.hdrTop, pairs: m3.pairs }, null, 1));
    console.log('顶区按钮:', JSON.stringify(m3.topButtons, null, 1));
    await p.screenshot({ path: path.join(DIR, 'r126b_plugin_fake59.png') });

    // 插件详情页（点第一个「查看 xxx」卡片标题）
    await p.evaluate(() => {
      const t = document.querySelector('[aria-label^="查看"]') || Array.from(document.querySelectorAll('[class*="cardTitle"]'))[0];
      if (t) t.click();
    });
    await p.waitForTimeout(3500);
    await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
    await p.waitForTimeout(3600);
    await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
    await p.waitForTimeout(800);
    const m4 = await p.evaluate(MEASURE);
    console.log('===== 插件详情页（模拟 env=59）=====');
    console.log(JSON.stringify({ framePT: m4.framePT, frameInlinePT: m4.frameInlinePT, colTop: m4.colTop, hdrTop: m4.hdrTop, pairs: m4.pairs }, null, 1));
    console.log('顶区按钮:', JSON.stringify(m4.topButtons, null, 1));
    await p.screenshot({ path: path.join(DIR, 'r126b_detail_fake59.png') });
    await c.close();
  }
  await b.close();
})();
