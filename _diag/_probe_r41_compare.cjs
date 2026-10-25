/* ============================================================================
 * R41 修复前/后对比模拟图生成器（给老总验收用）
 *   同一场景（会话→开右抽屉→进开始视图→面板内标签条注入 对话/轨迹/系统监控/开始 四标签）
 *   唯一变量 = 注入代码版本：
 *     A. _app_inject_137.js（线上 1.0.137，老总真机报障版）→ 修复前
 *     B. app_inject.js     （工作区 1.0.138，含 R41 簇级钳制）→ 修复后
 *   产物：_r41_cmp_before_full/_top.png、_r41_cmp_after_full/_top.png（414pt@2x=828px 宽，与老总手机同规格）
 * 用法：node _diag/_probe_r41_compare.cjs
 * ==========================================================================*/
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const NEW = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
  const OLD = fs.readFileSync(path.join(DIR, '_app_inject_137.js'), 'utf8');

  for (const [label, js] of [['before', OLD], ['after', NEW]]) {
    const b = await webkit.launch({ headless: true });
    const c = await b.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(7000);
    await p.evaluate(({ js }) => {
      document.documentElement.style.setProperty('--dsh-sb-native', '48px');
      document.documentElement.style.setProperty('--dsh-statusbar', '48px');
      document.documentElement.style.setProperty('--dsh-topshift', '18px');
      try { (0, eval)(js); } catch (e) {}
      try { window.__dshSetStatusBar(48); } catch (e) {}
    }, { js });
    await p.waitForTimeout(1500);
    // 老总真实路径
    await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]'); if (x) x.click(); });
    await p.waitForTimeout(1500);
    await p.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
      const t = rows[1] || rows[0];
      if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
    });
    await p.waitForTimeout(4000);
    await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
    await p.waitForTimeout(2000);
    await p.evaluate(() => { const t = document.querySelector('header button[aria-label="打开右侧边栏"]') || document.querySelector('button[aria-label="打开右侧边栏"]'); if (t) t.click(); });
    await p.waitForTimeout(2000);
    // 确定性模拟「标签拥挤」：把标签条本身撑到 680px（pane 只有 414px）——
    // 标签条尾部的一切（含功能钮簇）必然落入 overflow-x:hidden 裁剪区，与真机标签多等价。
    const inj = await p.evaluate(() => {
      const strips = document.querySelectorAll('[class*="tabStrip"]');
      let ch = null;
      for (const c of document.querySelectorAll('[class*="stripChrome"]')) {
        const r = c.getBoundingClientRect();
        if (r.width > 0 && r.top >= 0 && r.top < 140) { ch = c; break; }
      }
      let strip = null;
      if (ch) { let n = ch; while (n && n.parentElement) { n = n.parentElement; if (String(n.className).indexOf('tabStrip') >= 0) { strip = n; break; } } }
      if (!strip) for (const s of strips) { const r = s.getBoundingClientRect(); if (r.width > 0 && r.top >= 0 && r.top < 140) { strip = s; break; } }
      if (!strip) return 'no-strip';
      const before = ch ? Math.round(ch.getBoundingClientRect().right) : -1;
      strip.style.setProperty('min-width', '680px', 'important');
      return 'ok strip→680px, chromeRight=' + before;
    });
    console.log('[' + label + '] 推挤:', inj);
    await p.waitForTimeout(1600);
    const geo = await p.evaluate(() => {
      const out = { vw: window.innerWidth };
      const clusters = document.querySelectorAll('[class*="stripChrome"]');
      for (const ch of clusters) {
        const cr = ch.getBoundingClientRect();
        if (cr.width > 0 && cr.top >= 0 && cr.top < 140) {
          out.chrome = [Math.round(cr.left), Math.round(cr.top), Math.round(cr.right)];
          out.tf = ch.style.transform || '(none)';
          const btn = ch.querySelector('button[aria-label="收起右侧边栏"]') || ch.querySelector('button[aria-label="打开右侧边栏"]');
          if (btn) { const br = btn.getBoundingClientRect(); out.btn = [Math.round(br.left), Math.round(br.right)]; }
          break;
        }
      }
      return out;
    });
    console.log('[' + label + ']', JSON.stringify(geo), geo.btn && geo.btn[1] > geo.vw ? '→ 抽屉按钮出屏 ❌（复现老总故障）' : (geo.btn ? '→ 抽屉按钮在屏内 ✅ right=' + geo.btn[1] : ''));
    await p.screenshot({ path: path.join(DIR, '_r41_cmp_' + label + '_full.png') });
    await p.screenshot({ path: path.join(DIR, '_r41_cmp_' + label + '_top.png'), clip: { x: 0, y: 0, width: 414, height: 130 } });
    await b.close();
  }
  console.log('DONE: _r41_cmp_before_full/_top.png + _r41_cmp_after_full/_top.png');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
