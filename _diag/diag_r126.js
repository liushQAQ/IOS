/* 老总 2026-10-20 12:32 两连报全保真取证（带 App CSS —— 6.5 铁律）
   问题1：插件详情页「侧边栏和返回按钮还是遮挡」
   问题2：会话页顶栏离 iOS 状态栏中间空隙巨大（「可以停一台航母」）
   量什么：
   A) 会话页：frame padding-top / centerCol 顶 / 主 header 顶 / 汉堡按钮带 —— 对 want=39
   B) 插件详情页：y<260 区域所有 fixed/absolute 按钮的 rect + 两两重叠矩阵 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const TOPSCAN = () => {
  const dump = [];
  document.querySelectorAll('button, [role="button"], a, header, h1, h2').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const q = el.getBoundingClientRect();
    if (q.width < 8 || q.height < 8) return;
    if (q.y > 300) return;
    dump.push({
      tag: el.tagName,
      label: el.getAttribute('aria-label') || '',
      cls: String(el.className || '').slice(0, 44),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 14),
      x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height),
      right: Math.round(q.right), bottom: Math.round(q.bottom),
      pos: cs.position, z: cs.zIndex, fixed: cs.position === 'fixed',
    });
  });
  // 两两重叠矩阵（只算 top 区按钮）
  const btns = dump.filter(d => (d.tag === 'BUTTON' || d.pos === 'fixed') && d.y < 260);
  const pairs = [];
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i], b = btns[j];
    const ox = Math.min(a.right, b.right) - Math.max(a.x, b.x);
    const oy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
    if (ox > 4 && oy > 4) pairs.push({ a: (a.label || a.text || a.cls).slice(0, 18), b: (b.label || b.text || b.cls).slice(0, 18), ox: Math.round(ox), oy: Math.round(oy) });
  }
  const frame = document.querySelector('[data-mobile-nav="frame"]');
  const col = document.querySelector('[class*="centerCol"]');
  const hdr = document.querySelector('header');
  return {
    sbNative: window.__dshNativeStatusBar || null,
    framePT: frame ? getComputedStyle(frame).paddingTop : null,
    colTop: col ? Math.round(col.getBoundingClientRect().top * 10) / 10 : null,
    colMT: col ? getComputedStyle(col).marginTop : null,
    hdrTop: hdr ? Math.round(hdr.getBoundingClientRect().top) : null,
    hdrYInFlow: hdr ? Math.round(hdr.offsetTop) : null,
    n: dump.length, dump: dump.slice(0, 26), pairs,
  };
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js, css }) => {
    try { (0, eval)(js); } catch (e) { console.error('js注入失败', e); }
    const s = document.createElement('style'); s.id = '__app_css'; s.textContent = css;
    document.head.appendChild(s);
  }, { js: APP_JS, css: APP_CSS });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { try { window.__dshSetStatusBar(59); } catch (e) { console.error(e); } });
  await p.waitForTimeout(3600); // 跨兜底定时器
  await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(800);

  // —— 场景 A：进会话页（同回归闸门路径）——
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    try { const d = document.querySelector('dialog.cm-billion-notice'); if (d) { const btn = Array.from(d.querySelectorAll('button')).find(b => /知道了|确定|关闭|OK/i.test((b.textContent || '').trim())); if (btn) btn.click(); else if (d.close) d.close(); } } catch (e) {}
  });
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
  const conv = await p.evaluate(TOPSCAN);
  console.log('===== A) 会话页（对照截图2：iosmcp）=====');
  console.log(JSON.stringify({ sbNative: conv.sbNative, framePT: conv.framePT, colTop: conv.colTop, colMT: conv.colMT, hdrTop: conv.hdrTop, want: 59 - 2 - 18, pairs: conv.pairs }, null, 1));
  conv.dump.forEach(d => console.log('  ' + d.tag + ' y=' + d.y + ' x=' + d.x + ' w=' + d.w + ' h=' + d.h + (d.label ? ' [' + d.label + ']' : '') + (d.text ? ' "' + d.text + '"' : '') + ' .' + d.cls));
  await p.screenshot({ path: path.join(DIR, 'r126_conv.png') });

  // —— 场景 B：插件页 → 打开「远程控制」详情（对照截图1）——
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { const b2 = Array.from(document.querySelectorAll('button')).find(e => (e.textContent || '').trim() === '插件'); if (b2) b2.click(); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);
  // 点进第一个插件详情（老总截图是「远程控制」）
  await p.evaluate(() => {
    const card = Array.from(document.querySelectorAll('[class*="pageHead"] ~ * button, [class*="card"], li, a')).find(e => (e.textContent || '').indexOf('远程控制') >= 0)
      || Array.from(document.querySelectorAll('*')).find(e => e.children.length === 0 && (e.textContent || '').trim() === '远程控制');
    if (card) card.click();
  });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(3600);
  await p.evaluate(() => { try { window.__dshLayoutFix(); } catch (e) {} });
  await p.waitForTimeout(800);
  const plug = await p.evaluate(TOPSCAN);
  console.log('===== B) 插件详情页（对照截图1：远程控制）=====');
  console.log(JSON.stringify({ sbNative: plug.sbNative, framePT: plug.framePT, colTop: plug.colTop, pairs: plug.pairs }, null, 1));
  plug.dump.forEach(d => console.log('  ' + d.tag + (d.fixed ? ' FIXED' : '') + ' y=' + d.y + ' x=' + d.x + ' w=' + d.w + ' h=' + d.h + (d.label ? ' [' + d.label + ']' : '') + (d.text ? ' "' + d.text + '"' : '') + ' .' + d.cls + ' z=' + d.z));
  await p.screenshot({ path: path.join(DIR, 'r126_plugin.png') });
  await b.close();
})();
