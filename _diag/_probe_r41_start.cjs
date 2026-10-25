/* ============================================================================
 * R41 取证探针：按老总真实路径复现「开始页」顶栏出屏
 *   路径：会话页 → 开右抽屉 → 点「工作区（文件浏览）」卡片 → 开始页
 *   老总 1.0.137 真机两张截图（16facbd3 / 0dfa19e7）：
 *     · 开始页顶栏最右抽屉按钮被右缘截断（x≈805+/828）
 *     · 开始页顶栏比会话页顶栏低 ~22pt
 *     · 右缘 y≈880-940 蓝色卡片残影 → 整页内容横向溢出
 *   本探针在 414x896（老总机型类）+ 430 两档全量取证：
 *     横向溢出审计 / 顶栏行 DOM 树+几何+内联样式 / 按钮是否在 header / 祖先 padding 链
 * 用法：node _diag/_probe_r41_start.cjs
 * ==========================================================================*/
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

const AUDIT = () => {
  var out = { vw: window.innerWidth, vh: window.innerHeight };
  out.docScrollW = document.documentElement.scrollWidth;
  out.bodyScrollW = document.body ? document.body.scrollWidth : 0;
  // 横向溢出元凶：找出 rect.right > vw+2 的可见元素（浅层）
  out.overflows = [];
  try {
    var all = document.querySelectorAll('body *');
    for (var i = 0; i < all.length && out.overflows.length < 24; i++) {
      var el = all[i];
      var r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.right > window.innerWidth + 2) {
        out.overflows.push({
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string' ? el.className.split(' ')[0] : '').slice(0, 30),
          aria: el.getAttribute('aria-label') || '',
          right: Math.round(r.right), left: Math.round(r.left), w: Math.round(r.width),
          top: Math.round(r.top)
        });
      }
    }
  } catch (e) {}
  // 顶栏行：开始页那排按钮的容器（找 收起右侧边栏/打开右侧边栏/分栏 按钮）
  var btns = document.querySelectorAll('button[aria-label="收起右侧边栏"], button[aria-label="打开右侧边栏"], button[aria-label="分栏"], button[aria-label="退出全屏"]');
  out.btns = [];
  for (var b = 0; b < btns.length; b++) {
    var bt = btns[b];
    var br = bt.getBoundingClientRect();
    var ancestors = [];
    var an = bt.parentElement;
    for (var a = 0; a < 6 && an; a++, an = an.parentElement) {
      var ar = an.getBoundingClientRect();
      var cs = getComputedStyle(an);
      ancestors.push({
        tag: an.tagName.toLowerCase(),
        cls: (typeof an.className === 'string' ? an.className.split(' ')[0] : '').slice(0, 30),
        rect: [Math.round(ar.left), Math.round(ar.top), Math.round(ar.width), Math.round(ar.height)],
        padT: cs.paddingTop, pos: cs.position, disp: cs.display, jc: cs.justifyContent, gap: cs.gap,
        inline: (an.getAttribute('style') || '').slice(0, 140),
        sbVar: an.style.getPropertyValue('--dsh-statusbar') || ''
      });
    }
    out.btns.push({
      aria: bt.getAttribute('aria-label'),
      rect: [Math.round(br.left), Math.round(br.top), Math.round(br.width), Math.round(br.height)],
      inline: (bt.getAttribute('style') || '').slice(0, 120),
      inHeader: !!bt.closest('header'),
      inPanel: !!(bt.closest('[data-sidebar-right-open]') || bt.closest('.dMHGga_panel')),
      headerNear: !!bt.closest('header') ? bt.closest('header').getBoundingClientRect().top : null,
      ancestors: ancestors
    });
  }
  // 开始页标题行（🧭 开始）
  var h1 = document.querySelector('h1, h2, [class*="title"]');
  out.firstRowTop = null;
  var hdr = document.querySelector('header');
  if (hdr) { var hr = hdr.getBoundingClientRect(); out.headerTop = Math.round(hr.top); }
  // 页面主容器 padding 链
  var frame = document.querySelector('[data-mobile-nav="frame"], [class*="frame"]');
  if (frame) {
    var fr = frame.getBoundingClientRect();
    var fcs = getComputedStyle(frame);
    out.frame = { rect: [Math.round(fr.left), Math.round(fr.top), Math.round(fr.width)], padT: fcs.paddingTop, inline: (frame.getAttribute('style') || '').slice(0, 140) };
  }
  var csHtml = getComputedStyle(document.documentElement);
  out.vars = { sb: csHtml.getPropertyValue('--dsh-statusbar').trim(), nat: csHtml.getPropertyValue('--dsh-sb-native').trim(), ts: csHtml.getPropertyValue('--dsh-topshift').trim() };
  return out;
};

(async () => {
  for (const [W, H, tag] of [[414, 896, '414'], [430, 932, '430']]) {
    console.log('\n########## 视口 ' + W + 'x' + H + ' ##########');
    const b = await webkit.launch({ headless: true });
    const c = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(7000);
    await p.evaluate(({ js, w }) => {
      document.documentElement.style.setProperty('--dsh-sb-native', Math.round(w * 0.116) + 'px');
      document.documentElement.style.setProperty('--dsh-statusbar', Math.round(w * 0.116) + 'px');
      document.documentElement.style.setProperty('--dsh-topshift', '18px');
      try { (0, eval)(js); } catch (e) {}
      try { window.__dshSetStatusBar(Math.round(w * 0.116)); } catch (e) {}
    }, { js: APP_JS, w: W });
    await p.waitForTimeout(1500);
    // 进会话
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
    // 会话页基线
    const sess = await p.evaluate(AUDIT);
    console.log('[会话页] headerTop=' + sess.headerTop + ' 开关=' + JSON.stringify(sess.btns.map(x => ({ a: x.aria, r: x.rect, ih: x.inHeader }))) + ' docW=' + sess.docScrollW + '/' + sess.vw);

    // 开右抽屉
    await p.evaluate(() => { const t = document.querySelector('header button[aria-label="打开右侧边栏"]') || document.querySelector('button[aria-label="打开右侧边栏"]'); if (t) t.click(); });
    await p.waitForTimeout(1800);
    // 点「工作区（文件浏览）」卡片 → 开始页
    const clicked = await p.evaluate(() => {
      const panel = document.querySelector('.dMHGga_panel') || document.querySelector('[data-sidebar-right-open]');
      if (!panel) return 'no-panel';
      const cands = Array.from(panel.querySelectorAll('button, [role="button"]'));
      const hit = cands.find(e => { const s = (e.textContent || '') + (e.getAttribute('aria-label') || ''); return s.indexOf('文件浏览') >= 0 || /^工作区/.test((e.textContent || '').trim()); });
      if (hit) { hit.click(); return 'clicked'; }
      return 'no-hit';
    });
    console.log('[开抽屉→点工作区卡片]', clicked);
    await p.waitForTimeout(2500);
    const start = await p.evaluate(AUDIT);
    console.log('[开始页] docScrollW=' + start.docScrollW + '/' + start.vw + ' overflow数=' + start.overflows.length);
    console.log('  溢出元素:', JSON.stringify(start.overflows.slice(0, 8)));
    console.log('  headerTop=' + start.headerTop + ' frame=' + JSON.stringify(start.frame) + ' vars=' + JSON.stringify(start.vars));
    start.btns.forEach(x => {
      console.log('  按钮[' + x.aria + '] rect=' + JSON.stringify(x.rect) + ' inHeader=' + x.inHeader + ' inPanel=' + x.inPanel + ' inline=' + JSON.stringify(x.inline));
      x.ancestors.slice(0, 3).forEach((anc, i) => console.log('    祖先' + i + ' ' + anc.tag + '.' + anc.cls + ' rect=' + JSON.stringify(anc.rect) + ' padT=' + anc.padT + ' jc=' + anc.jc + ' gap=' + anc.gap + ' sb=' + JSON.stringify(anc.sbVar) + ' inline=' + JSON.stringify(anc.inline)));
    });
    await p.screenshot({ path: path.join(DIR, '_r41_start_' + tag + '.png') });
    console.log('  截图: _r41_start_' + tag + '.png');
    await b.close();
  }
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
