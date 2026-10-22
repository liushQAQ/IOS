/* v1.0.128 修复前后对照（真机最坏条件：缓存旧 client 的 env=59 + JS 几何通道全死，只注 CSS）。
   两遍加载同一状态：Pass1 = 修复前（仅 env59），Pass2 = 修复后（仅 CSS）。
   每遍截 主页 + 会话页 顶部特写，并画 y=39 目标参考线。 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');

const killNotice = () => {
  try {
    const d = document.querySelector('dialog.cm-billion-notice');
    if (d) {
      const btn = Array.from(d.querySelectorAll('button')).find(b => /知道了|确定|关闭|OK/i.test((b.textContent || '').trim()));
      if (btn) btn.click(); else if (typeof d.close === 'function') d.close();
    }
  } catch (e) {}
};

const MEASURE = () => {
  const f = document.querySelector('[data-mobile-nav="frame"]');
  const col = document.querySelector('[class*="centerCol"]');
  const hdr = document.querySelector('header');
  const lead = document.querySelector('[data-mobile-nav="frame"] header > [class*="headerLeading"]');
  return {
    framePT: f ? getComputedStyle(f).paddingTop : null,
    colTop: col ? Math.round(col.getBoundingClientRect().top * 10) / 10 : null,
    hdrTop: hdr ? Math.round(hdr.getBoundingClientRect().top * 10) / 10 : null,
    leadH: lead ? getComputedStyle(lead).height : null,
  };
};

// y=39 目标参考线（绿色）+ y=59 旧漂移位（红色细线）
const MARK = () => {
  const mk = (y, color, label) => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;right:0;top:' + y + 'px;height:1px;background:' + color +
      ';z-index:2147483647;pointer-events:none;font:10px monospace';
    const t = document.createElement('div');
    t.textContent = label;
    t.style.cssText = 'position:absolute;right:4px;top:-11px;color:' + color + ';background:#111;padding:0 3px';
    d.appendChild(t); document.body.appendChild(d);
  };
  mk(59, 'rgba(255,80,80,.75)', '59 旧漂移');
  mk(39, 'rgba(60,230,120,.9)', '39 目标');
};

async function openSession(p) {
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  for (let i = 0; i < 16; i++) { await p.waitForTimeout(2500); if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry'))) break; }
  await p.evaluate(killNotice);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(3000);
}

(async () => {
  const b = await webkit.launch({ headless: true });
  const out = {};

  async function pass(tag, withCss) {
    const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(6500);
    // 真机条件：缓存里旧 client.js 的 env padding 规则
    await p.evaluate(() => {
      const fe = document.createElement('style');
      fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
      document.head.appendChild(fe);
      if (withCss) { const st = document.createElement('style'); st.textContent = window.__APP_CSS; document.head.appendChild(st); }
    }, ).catch(() => {});
    if (withCss) await p.addInitScript(() => {}); // no-op
    // CSS 要在加载时就注入才能模拟「注入层存活」；这里在 DOMContentLoaded 后补注也可以（样式表生效与时机无关）
    if (withCss) await p.evaluate((css) => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }, APP_CSS);
    await p.waitForTimeout(1800);
    await p.evaluate(killNotice);
    await p.waitForTimeout(600);
    // 主页特写
    out[tag + '_home'] = await p.evaluate(MEASURE);
    await p.evaluate(MARK);
    await p.screenshot({ path: path.join(DIR, 'v128_' + tag + '_home.png'), clip: { x: 0, y: 0, width: 430, height: 170 } });
    // 会话页特写
    await openSession(p);
    await p.waitForTimeout(1200);
    out[tag + '_sess'] = await p.evaluate(MEASURE);
    await p.evaluate(MARK);
    await p.screenshot({ path: path.join(DIR, 'v128_' + tag + '_sess.png'), clip: { x: 0, y: 0, width: 430, height: 170 } });
    await c.close();
  }

  await pass('before', false);
  await pass('after', true);

  console.log('BEFORE home ' + JSON.stringify(out.before_home));
  console.log('BEFORE sess ' + JSON.stringify(out.before_sess));
  console.log('AFTER  home ' + JSON.stringify(out.after_home));
  console.log('AFTER  sess ' + JSON.stringify(out.after_sess));
  await b.close();
})();
