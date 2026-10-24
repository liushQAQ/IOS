/* ============================================================================
 * R39 取证探针：右抽屉 开→文件工作区→返回→关闭 全程采样
 *   老总 1.0.136(105) 真机报障：「打开右侧抽屉到文件工作区，按钮还是下移。
 *   返回后右侧抽屉按钮还是超出屏幕范围。」
 *   目标：抓真凶 —— 谁在哪个元素上写了什么（--dsh-statusbar / padding-top /
 *   transform / top），按钮几何全程时间线，出屏方向与幅值。
 * 用法：node _diag/_probe_r39_ws.cjs
 * ==========================================================================*/
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const W = 430, H = 932;

/* 页面侧：style 属性变更监听（子树全量，带元素归属），只记关键属性 */
const STYLEWATCH = () => {
  window.__wlog = [];
  var cap = 800;
  function desc(el) {
    try {
      return el.tagName.toLowerCase() +
        (el.getAttribute && el.getAttribute('aria-label') ? '(' + el.getAttribute('aria-label').slice(0, 12) + ')' : '') +
        (el.getAttribute && el.getAttribute('data-sidebar-right-open') !== null ? '[open=' + el.getAttribute('data-sidebar-right-open') + ']' : '') +
        (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0].slice(0, 22) : '');
    } catch (e) { return '?'; }
  }
  try {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length && window.__wlog.length < cap; i++) {
        var t = muts[i].target;
        if (!t || t.nodeType !== 1) continue;
        var ns = t.getAttribute('style') || '';
        if (!/(--dsh-statusbar|--dsh-sb-native|--dsh-topshift|padding-top|transform|(^|;)top:|(^|;)right:)/.test(ns)) continue;
        var os = muts[i].oldValue || '';
        if (ns === os) continue;
        window.__wlog.push({ t: Math.round(performance.now()), el: desc(t), old: os.slice(0, 120), neu: ns.slice(0, 220) });
      }
    });
    var armMo = function () {
      if (!document.documentElement) { setTimeout(armMo, 16); return; }
      mo.observe(document.documentElement, { attributes: true, attributeOldValue: true, subtree: true, attributeFilter: ['style'] });
    };
    armMo();
  } catch (e) {}
  return 'stylewatch-armed';
};

/* 全量采样：所有抽屉开关按钮候选 + header + 状态栏变量携带者 + rightbarCol */
const SAMPLE = () => {
  var out = { t: Math.round(performance.now()), vw: window.innerWidth, vh: window.innerHeight };
  var sels = ['header button[aria-label="打开右侧边栏"]', 'header button[aria-label="收起右侧边栏"]', 'button[aria-label="打开右侧边栏"]', 'button[aria-label="收起右侧边栏"]', '[data-sidebar-right-toggle]'];
  out.btns = [];
  for (var i = 0; i < sels.length; i++) {
    var list;
    try { list = document.querySelectorAll(sels[i]); } catch (e) { continue; }
    for (var j = 0; j < Math.min(list.length, 4); j++) {
      var b = list[j];
      var r = b.getBoundingClientRect();
      out.btns.push({
        sel: sels[i].slice(0, 44), idx: j,
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        inline: (b.getAttribute('style') || '').slice(0, 180),
        inHeader: !!b.closest('header'), disp: getComputedStyle(b).display
      });
    }
  }
  var h = document.querySelector('header');
  if (h) { var hr = h.getBoundingClientRect(); out.header = [Math.round(hr.left), Math.round(hr.top), Math.round(hr.width), Math.round(hr.height)]; out.headerPad = getComputedStyle(h).paddingTop; }
  var sbs = [];
  var readEl = function (el) { try { return (el.style.getPropertyValue('--dsh-statusbar') || '').trim(); } catch (e) { return '?'; } };
  var csEl = function (el) { try { return getComputedStyle(el).getPropertyValue('--dsh-statusbar').trim(); } catch (e) { return '?'; } };
  if (document.documentElement) sbs.push({ el: 'html', v: readEl(document.documentElement), cs: csEl(document.documentElement) });
  if (document.body) sbs.push({ el: 'body', v: readEl(document.body), cs: csEl(document.body) });
  var holders;
  try { holders = document.querySelectorAll('[style*="--dsh-statusbar"]'); } catch (e) { holders = []; }
  for (var k = 0; k < Math.min(holders.length, 14); k++) {
    var el = holders[k];
    if (el === document.documentElement || el === document.body) continue;
    sbs.push({
      el: desc(el), v: readEl(el), top: Math.round(el.getBoundingClientRect().top),
      w: Math.round(el.getBoundingClientRect().width)
    });
  }
  out.sbs = sbs;
  try {
    var col = document.querySelector('[class*="rightbarCol"]');
    if (col) { out.colPad = getComputedStyle(col).paddingTop; out.colInlinePad = col.style.getPropertyValue('padding-top'); out.colTop = Math.round(col.getBoundingClientRect().top); }
  } catch (e) {}
  return out;
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  p.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 120)));
  await p.addInitScript(STYLEWATCH);
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const fe = document.createElement('style');
    fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
    document.head.appendChild(fe);
    try { (0, eval)(js); } catch (e) {}
    window.__regTick = function () {
      try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {}
      try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {}
    };
    window.__regTick();
  }, { js: APP_JS });
  await p.waitForTimeout(1500);

  /* 进会话（尽力而为） */
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(2500);

  const dump = [];
  const shot = (n) => p.screenshot({ path: path.join(DIR, '_r39_' + n + '.png') }).catch(() => {});
  const S = async (tag, n) => {
    const s = await p.evaluate(SAMPLE);
    s.tag = tag;
    dump.push(s);
    console.log('[' + tag + '] btns=' + JSON.stringify(s.btns));
    console.log('        sbs=' + JSON.stringify(s.sbs));
    if (s.header) console.log('        header=' + JSON.stringify(s.header) + ' pad=' + s.headerPad + ' colPad=' + s.colPad + '(inline:' + s.colInlinePad + ') colTop=' + s.colTop);
  };
  const LOOPS = async (tag, n, gap) => {
    for (var i = 0; i < n; i++) { await p.waitForTimeout(gap || 300); await S(tag + '#' + i, n); }
  };

  await S('S0基线', 1);
  await shot('s0');

  /* 开右抽屉 */
  await p.evaluate(() => { const t = document.querySelector('header button[aria-label="打开右侧边栏"]') || document.querySelector('button[aria-label="打开右侧边栏"]') || document.querySelector('[data-sidebar-right-toggle]'); if (t) t.click(); });
  await p.waitForTimeout(1800);
  await S('S1开抽屉', 1);
  await shot('s1_open');

  /* 面板内找「文件工作区」入口（R35e 同款：按文本在 panel 里找） */
  const panelItems = await p.evaluate(() => {
    const panel = document.querySelector('.dMHGga_panel') || document.querySelector('[data-sidebar-right-open]');
    if (!panel) return { panel: false };
    const items = [];
    panel.querySelectorAll('button, [role="button"], [role="tab"], a, [class*="tab" i]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      items.push({ tag: el.tagName, aria: el.getAttribute('aria-label') || '', txt: (el.textContent || '').trim().slice(0, 16), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
    });
    return { panel: true, n: items.length, items: items.slice(0, 30) };
  });
  console.log('面板可点项:', JSON.stringify(panelItems));
  const fileTab = await p.evaluate(() => {
    const panel = document.querySelector('.dMHGga_panel') || document.querySelector('[data-sidebar-right-open]');
    if (!panel) return 'no-panel';
    const cands = Array.from(panel.querySelectorAll('button, [role="button"]'));
    let hit = cands.find((e) => {
      const s = (e.textContent || '') + (e.getAttribute('aria-label') || '');
      return s.indexOf('文件浏览') >= 0 || /^工作区/.test((e.textContent || '').trim());
    });
    if (!hit) hit = cands.find((e) => ((e.textContent || '') + (e.getAttribute('aria-label') || '')).indexOf('工作区') >= 0 && e.getBoundingClientRect().width < 420);
    if (hit) {
      hit.click();
      return 'clicked:' + (hit.tagName) + ':' + (hit.textContent || '').trim().slice(0, 14) + '@' + JSON.stringify([Math.round(hit.getBoundingClientRect().left), Math.round(hit.getBoundingClientRect().top)]);
    }
    return 'no-hit';
  });
  console.log('进文件工作区:', fileTab);
  await p.waitForTimeout(1200);
  await S('S2工作区+1.2s', 1);
  await LOOPS('S2工作区', 10, 300);
  await shot('s2_workspace');

  /* 返回：面板内找 返回/关闭/后退 控件，找不到就点第一个非文件 tab */
  const backHit = await p.evaluate(() => {
    const cands = Array.from(document.querySelectorAll('button, [role="button"], a'));
    let hit = null;
    for (const e of cands) {
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.top > 230) continue;
      const s = (e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '');
      if (s.indexOf('返回') >= 0 || s.indexOf('后退') >= 0 || s.indexOf('关闭') >= 0) {
        if (!hit || r.left < hit.getBoundingClientRect().left) hit = e;
      }
    }
    if (hit) { const lb = (hit.getAttribute('aria-label') || hit.textContent || '').trim().slice(0, 14); hit.click(); return 'back:' + lb; }
    return 'no-back';
  });
  console.log('返回:', backHit);
  await p.waitForTimeout(1200);
  await S('S3返回+1.2s', 1);
  await LOOPS('S3返回', 10, 300);
  await shot('s3_back');

  /* 关抽屉 */
  await p.evaluate(() => { if (window.__dshCloseRightPanel) window.__dshCloseRightPanel(); });
  await p.waitForTimeout(1500);
  await S('S4关抽屉+1.5s', 1);
  await LOOPS('S4关抽屉', 8, 300);
  await shot('s4_closed');

  /* 写入日志：工作区点击之后的关键写入 */
  const writes = await p.evaluate(() => window.__wlog || []);
  console.log('===== style 写入日志（关键属性）共', writes.length, '条 =====');
  writes.forEach((w) => console.log(`  t=${w.t} ${w.el}\n    old: ${w.old}\n    new: ${w.neu}`));

  fs.writeFileSync(path.join(DIR, '_r39_ws.json'), JSON.stringify(dump, null, 1), 'utf8');
  await b.close();
  console.log('DONE -> _r39_ws.json');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
