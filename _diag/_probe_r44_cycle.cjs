/* ============================================================================
 * R44 取证探针：老总 23:19/23:23 实测路径连拍
 *   路径：会话页 → 点「打开右侧边栏」(进开始/文件顶栏，闪一下) →
 *         点「收起右侧边栏」回会话页 → 抽屉按钮超出屏幕约 1/3
 *   每 150ms 采样一次几何轨迹（持续 6s），抓漂移写入方与闪烁帧。
 * 用法：node _diag/_probe_r44_cycle.cjs
 * ==========================================================================*/
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

const TRACE_FN = () => {
  // 在页面里装一个 150ms 采样器，结果攒在 window.__trace
  window.__trace = [];
  window.__t0 = performance.now();
  function snap() {
    var s = { t: Math.round(performance.now() - window.__t0) };
    var db = document.querySelector('header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
    if (db) {
      var r = db.getBoundingClientRect();
      s.btn = [Math.round(r.left), Math.round(r.top), Math.round(r.right)];
      s.tf = db.style.transform || '';
      var hc = db.closest('[class*="headerCorner"]') || (db.parentElement && db.parentElement.closest('[class*="headerCorner"]'));
      if (hc) s.hc = hc.style.transform || '';
    }
    var tsh = document.querySelector('[class*="tabHostHeader"]');
    if (tsh) { var tr = tsh.getBoundingClientRect(); s.tsh = [Math.round(tr.left), Math.round(tr.top)]; s.tshMt = tsh.style.marginTop || ''; }
    var cl = document.querySelectorAll('[data-dsh-strip-clamp]');
    s.clamps = cl.length;
    var rb = document.querySelector('[class*="rightbarCol"]');
    if (rb) { var rr = rb.getBoundingClientRect(); s.rb = [Math.round(rr.left), Math.round(rr.right)]; }
    return s;
  }
  window.__trTimer = setInterval(() => { try { window.__trace.push(snap()); } catch (e) {} }, 150);
  return 'armed';
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'light' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    try { (0, eval)(js); } catch (e) {}
    try { window.__dshSetStatusBar(59); } catch (e) {}
  }, { js: APP_JS });
  await p.waitForTimeout(2500);

  // 进一个真实会话（老总图一是会话页）
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(4000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);

  await p.evaluate(TRACE_FN);
  const base = await p.evaluate(() => {
    const db = document.querySelector('header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
    const r = db.getBoundingClientRect();
    return { right: Math.round(r.right), vw: window.innerWidth, tf: db.style.transform || '' };
  });
  console.log('[基线·会话页] btn.right=' + base.right + ' vw=' + base.vw + ' tf=' + JSON.stringify(base.tf));

  // 开抽屉
  await p.evaluate(() => { const t = document.querySelector('header button[aria-label="打开右侧边栏"]'); if (t) t.click(); });
  await p.waitForTimeout(3000);
  // 关抽屉
  await p.evaluate(() => { const t = Array.from(document.querySelectorAll('button')).find(e => (e.getAttribute('aria-label') || '') === '收起右侧边栏'); if (t) t.click(); });
  await p.waitForTimeout(6000);

  const trace = await p.evaluate(() => { clearInterval(window.__trTimer); return window.__trace; });
  console.log('[轨迹] 共 ' + trace.length + ' 拍（0~3s=开抽屉, 3~9s=关抽屉后）');
  let prev = '';
  for (const s of trace) {
    const line = JSON.stringify({ t: s.t, btn: s.btn, tf: s.tf, hc: s.hc, tsh: s.tsh, tshMt: s.tshMt, clamps: s.clamps, rb: s.rb });
    if (line !== prev) console.log('  ' + line);
    prev = line;
  }
  const last = trace[trace.length - 1];
  console.log('[终态] btn=' + JSON.stringify(last && last.btn) + ' tf=' + JSON.stringify(last && last.tf) + ' vw=430');
  await p.screenshot({ path: path.join(DIR, '_r44_after_cycle.png') });
  await b.close();
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
