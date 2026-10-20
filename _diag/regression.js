/**
 * ============================================================================
 *  DSH iOS 适配 · 发版前回归闸门 (Regression Gate)
 * ============================================================================
 *  目的：把「修过又复发」从「等老总发现」提前到「打包前被拦住」。
 *
 *  用法：
 *    node regression.js            三尺寸全量（430 / 393 / 375）
 *    node regression.js --quick    只跑 430
 *
 *  退出码：0 = 全绿准予打包   1 = 有红禁止打包
 *
 *  🔴 铁律：任何一条红都不许打包。这是防止「修 A 破 B / 换版复发」的唯一机械防线。
 *  🔴 断言必须打「不变量」（aria-label / role / 文本 / 几何关系），
 *     禁止断言 CSS Module 哈希类名 —— 那些每次换版都会整体漂移。
 * ============================================================================
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const QUICK = process.argv.includes('--quick');
const SIZES = QUICK ? [[430, 932]] : [[430, 932], [393, 852], [375, 812]];

/* 从注入的 CSS 文本里抽出所有语义锚点：[class*="xxx"] / [class^="xxx"] / [class$="xxx"] */
function extractAnchors(cssText) {
  const set = new Set();
  const re = /\[class[\^*$]?=\\?["']([^"'\\]+)\\?["']\]/g;
  let m;
  while ((m = re.exec(cssText)) !== null) {
    const v = m[1];
    if (v && v.length >= 3 && !/^[\d\s]+$/.test(v)) set.add('[class*="' + v + '"]');
  }
  return Array.from(set);
}
const ANCHORS = extractAnchors(APP_JS);

let PASS = 0, FAIL = 0;
const FAILS = [];
/* 发布凭证：全绿才写盘，CI 靠它卡住「没跑闸门就打包」 */
const GATE = { version: null, sizes: [], startedAt: new Date().toISOString(), dshFingerprint: null, dshAssets: 0, domClasses: 0, anchorTotal: 0, anchorDead: 0 };
function ok(n, d) { PASS++; console.log('  ✅ ' + n + (d ? '   ' + d : '')); }
function bad(n, d) { FAIL++; FAILS.push(n + (d ? ' — ' + d : '')); console.log('  ❌ ' + n + (d ? '   ' + d : '')); }
function chk(c, n, d) { c ? ok(n, d) : bad(n, d); }

async function prep(p) {
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    /* 🔴 v1.0.126 铁律：闸门必须模拟真机 env(safe-area-inset-top)=59。
       桌面 WebKit 的 env() 恒为 0，而真机 iPhone 是 59 —— 这正是「沙箱绿、真机崩」
       的根源（老总 2026-10-20：真机会话页顶栏比沙箱低 58.6pt ≈ 一个状态栏）。
       这里用与真机同款选择器同款优先级（!important 样式表）把 frame padding 顶成 59，
       任何「清不干净」的回归都会在这里被抓住，而不是等老总装包后看见。 */
    if (!document.getElementById('__reg_fakeenv')) {
      const fe = document.createElement('style');
      fe.id = '__reg_fakeenv';
      fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
      document.head.appendChild(fe);
    }
    try { (0, eval)(js); } catch (e) { }
    // App 侧把布局管线暴露为 __dshLayoutFix，闸门直接驱动它
    window.__regTick = function () {
      try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {}
      try { if (window.__dshSetStatusBar) window.__dshSetStatusBar(59); } catch (e) {}
    };
    window.__regTick();
  }, { js: APP_JS });
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__regTick());
  await p.waitForTimeout(1000);
}
async function openDrawer(p) {
  await p.evaluate(() => {
    const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]');
    if (x) x.click();
  });
  await p.waitForTimeout(1800);
  /* 费用插件的一次性公告（dialog.cm-billion-notice，居中 fixed 模态）：
     真机用户会点「知道了」关掉它。闸门走同一路径 —— 不关的话它会
     盖住抽屉上半部 + 干扰齿轮 elementFromPoint，制造两条假红。
     它是插件 UI，App 侧不动它（改动只在 App 侧铁律），闸门模拟用户即可。 */
  await p.evaluate(() => {
    try {
      const d = document.querySelector('dialog.cm-billion-notice');
      if (d) {
        const btn = Array.from(d.querySelectorAll('button')).find(b => /知道了|确定|知道了|关闭|OK/i.test((b.textContent || '').trim()));
        if (btn) btn.click();
        else if (typeof d.close === 'function') d.close();
      }
    } catch (e) {}
  });
  await p.waitForTimeout(600);
  await p.evaluate(() => window.__regTick());
  await p.waitForTimeout(1200);
  // 跨过 3 秒兜底定时器，确保间歇出现的浮层（DSH 费用计量卡）也被收敛
  await p.waitForTimeout(3400);
  await p.evaluate(() => window.__regTick());
  await p.waitForTimeout(800);
}

/* 横向溢出：只算「左边缘在屏内、右边缘越界」的真出血。
   整体在屏幕外的（右侧面板收起时 left == vw）不算 —— 那是收起态，本来就该在屏外。 */
const A_OVERFLOW = () => {
  const vw = window.innerWidth;
  const scan = (root, cap) => {
    const hits = [];
    const all = root.getElementsByTagName('*');
    const lim = Math.min(all.length, cap);
    for (let i = 0; i < lim; i++) {
      const el = all[i];
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const q = el.getBoundingClientRect();
      if (q.width < 8 || q.height < 6) continue;
      if (q.left >= vw - 1) continue;          // 整体在屏外右（收起的右侧面板）
      if (q.right <= 1) continue;              // 整体在屏外左（收起的抽屉）
      if (q.width > vw) continue;              // 横向滚动容器
      const over = q.right - vw;
      if (over > 0.5) hits.push((String(el.className || el.tagName).slice(0, 30)) + ' +' + Math.round(over * 10) / 10);
    }
    return hits;
  };
  const r = { vw, docSW: document.documentElement.scrollWidth, pageOverflow: scan(document.body, 4000) };
  const sb = document.querySelector('[class*="sidebarCol"]');
  if (sb) {
    const sq = sb.getBoundingClientRect();
    const hits = [];
    let kids = 0;
    sb.querySelectorAll('*').forEach(el => {
      kids++;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      /* 视口锚定的浮层（插件一次性公告 dialog 等 position:fixed 祖先链）
         不属于抽屉流内容 —— 它按屏幕居中，天然超出 252px 抽屉，不算抽屉出血 */
      let a = el;
      while (a && a !== sb.parentElement) {
        const acs = getComputedStyle(a);
        if (acs.position === 'fixed') return;
        a = a.parentElement;
      }
      const q = el.getBoundingClientRect();
      if (q.width < 8 || q.height < 6) return;
      if (q.left >= vw - 1 || q.right <= 1) return;
      const over = q.right - sq.right;
      if (over > 0.5) hits.push((String(el.className || el.tagName).slice(0, 30)) + ' +' + Math.round(over * 10) / 10);
    });
    r.drawerOverflow = hits;
    r.drawerRight = Math.round(sq.right);
    r.drawerKids = kids;
  }
  return r;
};

const A_FOOTER = () => {
  const sb = document.querySelector('[class*="sidebarCol"]');
  if (!sb) return { found: false };
  const sq = sb.getBoundingClientRect();
  const foot = sb.querySelector('[class*="footArea"]') || sb.querySelector('[class*="cm-footer-stack"]');
  if (!foot) return { found: false };
  const fq = foot.getBoundingClientRect();
  const kids = [];
  Array.from(foot.children).forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const q = el.getBoundingClientRect();
    if (q.height < 4) return;
    kids.push({ cls: String(el.className || '').slice(0, 30), y: q.y, b: q.bottom });
  });
  let pairs = 0;
  for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++)
    if (Math.min(kids[i].b, kids[j].b) - Math.max(kids[i].y, kids[j].y) > 2) pairs++;
  return { found: true, over: Math.round((fq.right - sq.right) * 10) / 10, right: Math.round(fq.right), drawerRight: Math.round(sq.right), kids: kids.length, pairs };
};

const A_COMPOSER = () => {
  const host = document.querySelector('[class*="composerStack"]');
  if (!host) return { found: false };
  const out = [];
  host.querySelectorAll('button').forEach(b => {
    const cs = getComputedStyle(b);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const q = b.getBoundingClientRect();
    if (q.width < 14 || q.width > 80 || q.height < 14 || q.height > 80) return;
    out.push(Math.round((q.y + q.height / 2) * 10) / 10);
  });
  if (out.length < 2) return { found: true, n: out.length, spread: 0 };
  return { found: true, n: out.length, spread: Math.round((Math.max(...out) - Math.min(...out)) * 10) / 10 };
};

const A_GEAR = () => {
  const shim = document.querySelector('script[data-dsh-anywhere-sidebar-gear="1"]');
  const gs = Array.from(document.querySelectorAll('button[aria-label="设置"]'))
    .filter(b => getComputedStyle(b).position === 'fixed');
  if (!gs.length) return { found: false, shim: !!shim };
  const g = gs[0], gq = g.getBoundingClientRect();
  const sb = document.querySelector('[class*="sidebarCol"]');
  if (!sb) return { found: true, noDrawer: true };
  const sq = sb.getBoundingClientRect();
  const hit = document.elementFromPoint(gq.x + gq.width / 2, gq.y + gq.height / 2);
  return {
    found: true, shim: !!shim,
    inside: gq.right <= sq.right + 0.5 && gq.x >= sq.x - 0.5,
    right: Math.round(gq.right), drawerRight: Math.round(sq.right),
    clickable: !!(hit && (g === hit || g.contains(hit) || hit.contains(g))),
  };
};

/* 断言 9：顶栏几何（v1.0.126，老总 2026-10-20「顶栏离状态栏可以停一台航母」）
   真机条件（env=59，prep 已模拟）下 centerCol 顶必须收敛到 want = 59-2-18 = 39。
   老版增量算法被 React 重挂载刷回时会拿脏值累加 —— 这条断言就是它的克星。 */
const A_HEADER_TOP = () => {
  const col = document.querySelector('[class*="centerCol"]');
  const hdr = document.querySelector('header');
  const frame = document.querySelector('[data-mobile-nav="frame"]');
  return {
    colTop: col ? Math.round(col.getBoundingClientRect().top) : null,
    hdrTop: hdr ? Math.round(hdr.getBoundingClientRect().top) : null,
    framePT: frame ? getComputedStyle(frame).paddingTop : null,
  };
};

/* 断言 10：fixed fab 不得压住顶区全宽行按钮（v1.0.126，老总「侧边栏和返回按钮还是遮挡」）
   实测铁证：插件详情页无 header/pageHead，返回行（x=24..406 y=67..83）被
   [data-mobile-nav="fab"]（x=14..52 y=47..85）压住左端 28x16，返回箭头点不到。 */
const A_FAB_ROWS = () => {
  const fab = document.querySelector('[data-mobile-nav="fab"]');
  if (!fab) return { noFab: true };
  const cs = getComputedStyle(fab);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position !== 'fixed') return { hidden: true };
  const fq = fab.getBoundingClientRect();
  let worst = null;
  document.querySelectorAll('button, [role="button"], a').forEach(el => {
    const ecs = getComputedStyle(el);
    if (ecs.display === 'none' || ecs.visibility === 'hidden' || ecs.position === 'fixed') return;
    const q = el.getBoundingClientRect();
    if (q.width < 200 || q.left > 60 || q.y > 220 || q.height < 8) return;
    const ox = Math.min(fq.right, q.right) - Math.max(fq.x, q.x);
    const oy = Math.min(fq.bottom, q.bottom) - Math.max(fq.y, q.y);
    if (ox > 6 && oy > 6 && (!worst || ox * oy > worst.area)) worst = { label: el.getAttribute('aria-label') || '', area: Math.round(ox * oy) };
  });
  return { fabTop: Math.round(fq.y), overlap: worst };
};

/* 断言 6：会话页底部插件 dock 必须可换行（v1.0.125，老总 2026-10-20「底部模型用量那些重叠」）
   真凶：VERcba_dock 是 flex/row/nowrap/center，费用明细+CPU/内存+会话费用+下载+token 环
   总宽一超就互相压（真机实拍 CPU 的 CP 被盖）。修法 flex-wrap:wrap。 */
const A_DOCK = () => {
  const e = document.querySelector('.cm-stat-entry');
  if (!e) return { none: true };
  let n = e, dockEl = null;
  while (n && n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.display === 'flex' && cs.flexDirection === 'row') { dockEl = n; break; }
    n = n.parentElement;
  }
  if (!dockEl) return { noDock: true };
  const cs = getComputedStyle(dockEl);
  // 穿透 display:contents 的槽位，量真实部件
  const items = [];
  const collect = (el, d) => {
    Array.from(el.children).forEach(k => {
      const kcs = getComputedStyle(k);
      if (kcs.display === 'none') return;
      if (kcs.display === 'contents') { collect(k, d + 1); return; }
      const q = k.getBoundingClientRect();
      if (q.width > 6 && q.height > 4) items.push({ x: q.x, r: q.right, y: q.y, b: q.bottom });
      else if (d < 3) collect(k, d + 1);
    });
  };
  collect(dockEl, 0);
  let ov = 0;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (Math.min(a.b, b.b) - Math.max(a.y, b.y) > 2 && Math.min(a.r, b.r) - Math.max(a.x, b.x) > 2) ov++;
  }
  return { wrap: cs.flexWrap, items: items.length, overlapPairs: ov };
};

/* 断言 8：锚点存活体检（v1.0.126 重设计 —— 第一版设计有致命缺陷，这里如实记录）
   ✗ 废弃做法：拿「默认态 DOM 里 querySelector 命中数」当判据。
     实测误报 97/134：viewOptionsMenu / modal / questionDialog 这类惰性组件
     （下拉菜单、提问卡、弹窗）默认态本来就不在 DOM 里，不代表锚点失效。
   ✓ 现行做法（双层）：
     【硬断言·关键锚点】只挑我们 17 个 shim + 460 行 CSS 真正依赖的锚点，
       在「主页 → 抽屉 → 会话 → 插件页」四个取样态里任一命中即算活；
       全部取样态都零命中才报红 —— 这才是「DSH 改了类名、补丁静默失效」。
     【信息·全量健康度】134 个锚点对「DSH 自有 CSS 规则文本」做子串体检
       （排除含 [class*= 的自家样式表，防自证），写入发布凭证做版本间趋势对比，
       不拦截打包 —— 惰性组件锚点够不着它们，拦截只会制造误报噪音。 */
const CRITICAL_ANCHORS = [
  'sidebarCol',      // 抽屉容器：齿轮/底栏/出血断言全靠它
  'footArea',        // 吸底块：底栏重叠断言
  'composerStack',   // 输入区：按钮居中断言 + dock 换行
  'centerCol',       // 顶栏几何：__dshTopShift 四落点
  'pageHead',        // 插件页头部：fab 可点断言
  'headerCorner',    // 顶栏角标：v1.0.122 溢出修复目标
  'overlayLayer',    // fab 所在层：z-index 链
  'scrollBody',      // 滚动容器：会话页滚动
  'headerLeading',   // 顶栏左簇
  'headerActions',   // 顶栏右簇
  'composerSeat',    // 输入座位
  'titleRow',        // 右面板标题行
];
/* 跨场景累计：关键锚点只要在任一取样态命中过就算活 */
const ALIVE = {};
CRITICAL_ANCHORS.forEach(a => { ALIVE[a] = 0; });
const noteAlive = (p) => p.evaluate((crit) => {
  const dom = new Set();
  document.querySelectorAll('*').forEach(el => {
    const cn = el.getAttribute('class');
    if (cn) cn.split(/\s+/).forEach(x => { if (x) dom.add(x); });
  });
  return crit.filter(a => Array.from(dom).some(x => x.indexOf(a) >= 0));
}, CRITICAL_ANCHORS).then(hit => hit.forEach(a => { ALIVE[a]++; }));

/* 全量健康度：DSH 自有 CSS 规则文本（排除含 [class*= 的自家注入样式表，防自证） */
const A_CSS_HEALTH = () => {
  let css = '';
  let ownSheets = 0, allSheets = 0;
  for (const s of document.styleSheets) {
    let txt = '';
    try { for (const ru of s.cssRules) txt += ru.cssText + '\n'; } catch (e) { continue; }
    if (!txt) continue;
    allSheets++;
    // 自家样式表的铁证：含属性子串选择器（DSH 自己从不用 [class*= 写法）
    if (txt.indexOf('[class*=') >= 0 || txt.indexOf('[class^=') >= 0 || txt.indexOf('[class$=') >= 0) { ownSheets++; continue; }
    css += txt;
  }
  return { css, ownSheets, allSheets };
};

/* DSH 换版指纹：所有 js/css 资源的 URL 集合（文件名带内容哈希，换版必变）+ 总传输量 */
const A_FINGERPRINT = () => {
  try {
    const rs = performance.getEntriesByType('resource')
      .filter(r => /\.(js|css|mjs)/.test(r.name))
      .map(r => r.name.split('/').pop().slice(0, 40) + ':' + (r.transferSize || 0))
      .sort();
    let h = 0;
    const s = rs.join('|');
    for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return { n: rs.length, fp: Math.abs(h).toString(36).slice(0, 12) };
  } catch (e) { return { n: 0, fp: 'na' }; }
};


/* 断言 7：插件页左上角「打开目录」fab 必须可点、不压页面标题
   （v1.0.125，老总 2026-10-20「固定的左侧侧边栏按钮重叠」）
   真凶：fab 挂在 overlayLayer(z=20) 里，被 pageHead(z=999) 盖住 + 压住标题。 */
const A_PLUGIN_PAGE = () => {
  const ph = document.querySelector('[class*="pageHead"]');
  if (!ph) return { noPage: true };
  const fabs = Array.from(document.querySelectorAll('button')).filter(b => {
    const cs = getComputedStyle(b); const q = b.getBoundingClientRect();
    return cs.position === 'fixed' && cs.display !== 'none' && q.width > 10 && q.x < 100 && q.y < 220;
  });
  if (!fabs.length) return { noFab: true };
  const fab = fabs[0], q = fab.getBoundingClientRect();
  const hit = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2);
  const h1 = document.querySelector('h1');
  let overlapH1 = null;
  if (h1) {
    const h = h1.getBoundingClientRect();
    overlapH1 = !(q.right < h.x || q.x > h.right || q.bottom < h.y || q.y > h.bottom);
  }
  return {
    clickable: !!(hit && (hit === fab || fab.contains(hit))),
    overlapH1, phZ: getComputedStyle(ph).zIndex, phPadLeft: getComputedStyle(ph).paddingLeft,
  };
};

(async () => {
  console.log('='.repeat(72));
  console.log(' DSH iOS 适配 · 发版前回归闸门   ' + new Date().toLocaleString('zh-CN'));
  console.log('='.repeat(72));
  const b = await webkit.launch({ headless: true });

  for (const size of SIZES) {
    console.log('\n■ ' + size[0] + '×' + size[1]);
    const c = await b.newContext({ viewport: { width: size[0], height: size[1] }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 100)));
    try {
      await prep(p);

      let r = await p.evaluate(A_OVERFLOW);
      chk(r.pageOverflow.length === 0, '[主页] 零横向出血', r.pageOverflow.length ? r.pageOverflow.slice(0, 4).join(' | ') : 'docSW=' + r.docSW + ' vw=' + r.vw);
      chk(r.docSW <= r.vw + 1, '[主页] 无横向滚动', 'docSW=' + r.docSW + ' vw=' + r.vw);

      const ht = await p.evaluate(A_HEADER_TOP);
      chk(ht.hdrTop !== null && Math.abs(ht.hdrTop - 39) <= 2, '[主页] 顶栏顶=39（真机env=59下收敛）', 'hdrTop=' + ht.hdrTop + ' framePT=' + ht.framePT + ' want=39');

      // —— 锚点健康度 + DSH 换版指纹（只在 430 档做一次）——
      if (size[0] === 430) {
        await noteAlive(p); // 主页态关键锚点采样
        const hp = await p.evaluate(A_CSS_HEALTH);
        const dead = ANCHORS.filter(a => hp.css.indexOf(a.replace(/\[class\*="|"\]/g, '')) < 0);
        GATE.anchorTotal = ANCHORS.length;
        GATE.anchorCssAlive = ANCHORS.length - dead.length;
        GATE.anchorResidue = dead.length;
        GATE.dshSheets = hp.allSheets;
        GATE.ownSheets = hp.ownSheets;
        const fp = await p.evaluate(A_FINGERPRINT);
        GATE.dshFingerprint = fp.fp;
        GATE.dshAssets = fp.n;
        console.log('  ℹ DSH 指纹 ' + fp.fp + '（' + fp.n + ' 个 js/css 资源，' + hp.allSheets + ' 张样式表）');
        console.log('  ℹ 锚点健康度 ' + (ANCHORS.length - dead.length) + '/' + ANCHORS.length + ' 命中 DSH 自有 CSS（其余 ' + dead.length + ' 个为惰性组件锚点，仅记录不拦截）');
      }

      const comp = await p.evaluate(A_COMPOSER);
      if (!comp.found) bad('[会话框] 找不到 composerStack（锚点失效）');
      else chk(comp.spread <= 0.6, '[会话框] ' + comp.n + ' 个按钮中心齐平', '离散 ' + comp.spread + 'px');

      await openDrawer(p);
      r = await p.evaluate(A_OVERFLOW);
      chk(r.drawerOverflow.length === 0, '[抽屉] 内部零出血', r.drawerOverflow.length ? r.drawerOverflow.slice(0, 5).join(' | ') : '扫描 ' + r.drawerKids + ' 个元素, 右界 ' + r.drawerRight);
      chk(r.pageOverflow.length === 0, '[抽屉] 页面零出血', r.pageOverflow.length ? r.pageOverflow.slice(0, 4).join(' | ') : '');

      const f = await p.evaluate(A_FOOTER);
      if (!f.found) bad('[底栏] 找不到吸底块（锚点失效）');
      else {
        chk(f.over <= 0.5, '[底栏] 不超抽屉右界', 'right=' + f.right + ' 抽屉=' + f.drawerRight);
        chk(f.pairs === 0, '[底栏] ' + f.kids + ' 个子块零重叠', '重叠 ' + f.pairs + ' 对');
      }

      const g = await p.evaluate(A_GEAR);
      if (!g.found) bad('[齿轮] 未注入', 'shim 脚本=' + (g.shim ? '在' : '不在') + '（dsh-anywhere 未生效？）');
      else if (g.noDrawer) bad('[齿轮] 找不到抽屉容器');
      else {
        chk(g.inside, '[齿轮] 位置在抽屉内', 'right=' + g.right + ' 抽屉=' + g.drawerRight);
        chk(g.clickable, '[齿轮] 中心点可命中自身');
      }

      const fatal = errs.filter(e => /SyntaxError|ReferenceError|is not a function|is not defined|Cannot read/i.test(e));
      chk(fatal.length === 0, '[脚本] 无致命 JS 错误', fatal.length ? fatal.slice(0, 2).join(' | ') : '页面错误 ' + errs.length + ' 条（非致命）');
      await noteAlive(p); // 抽屉态关键锚点采样

      // —— 场景 B：进具体会话，校验底部插件 dock 可换行不重叠（v1.0.125 新增，仅 430 档跑一次以免拖太长）——
      if (size[0] === 430) {
        await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
        await p.waitForTimeout(1800);
        await p.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
          const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
          if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
        });
        let dockSeen = false;
        for (let i = 0; i < 20; i++) { await p.waitForTimeout(3000);
          await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
          if (await p.evaluate(() => !!document.querySelector('.cm-stat-entry'))) { dockSeen = true; break; } }
        if (dockSeen) {
          const dk = await p.evaluate(A_DOCK);
          if (dk.none) bad('[dock] 插件费用部件未渲染（可能插件未装/会话无数据）');
          else if (dk.noDock) bad('[dock] 找不到 flex 行容器');
          else {
            chk(dk.wrap === 'wrap', '[dock] 插件行可换行', 'flex-wrap=' + dk.wrap + ' 部件 ' + dk.items + ' 个');
            chk(dk.overlapPairs === 0, '[dock] 部件零重叠', '重叠 ' + dk.overlapPairs + ' 对');
          }
          const ht2 = await p.evaluate(A_HEADER_TOP);
          chk(ht2.hdrTop !== null && Math.abs(ht2.hdrTop - 39) <= 2, '[会话页] 顶栏顶=39（真机env=59下收敛）', 'hdrTop=' + ht2.hdrTop + ' framePT=' + ht2.framePT + ' want=39');
          await noteAlive(p); // 会话态关键锚点采样
        } else bad('[dock] 60 秒内费用部件未出现（无法校验）');

        // —— 场景 C：插件页，校验左上角 fab 可点、不压标题（v1.0.125 新增）——
        await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
        await p.waitForTimeout(1800);
        await p.evaluate(() => { const b2 = Array.from(document.querySelectorAll('button')).find(e => (e.textContent || '').trim() === '插件'); if (b2) b2.click(); });
        await p.waitForTimeout(3000);
        await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
        await p.waitForTimeout(2500);
        await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
        await p.waitForTimeout(3600); // 跨过 3 秒兜底定时器
        await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
        await p.waitForTimeout(800);
        const pp = await p.evaluate(A_PLUGIN_PAGE);
        if (pp.noPage) bad('[插件页] 找不到 pageHead（锚点失效）');
        else if (pp.noFab) bad('[插件页] 左上角 fixed 按钮消失');
        else {
          chk(pp.clickable, '[插件页] fab 中心可命中自身', '命中=' + (pp.clickable ? 'fab' : '其它') + ' pageHead z=' + pp.phZ);
          chk(pp.overlapH1 === false, '[插件页] fab 不压页面标题', pp.overlapH1 === null ? '页面无 h1' : (pp.overlapH1 ? '仍相交' : '零相交'));
        }
        await noteAlive(p); // 插件列表页态采样（pageHead 只在这类页面存在）

        // —— 场景 D：插件详情页（无 header/pageHead 的页面族），校验 fab 不压返回行（v1.0.126）——
        await p.evaluate(() => { const t = document.querySelector('[aria-label^="查看"]') || Array.from(document.querySelectorAll('[class*="cardTitle"]'))[0]; if (t) t.click(); });
        await p.waitForTimeout(3500);
        await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
        await p.waitForTimeout(3600);
        await p.evaluate(() => { try { if (window.__dshLayoutFix) window.__dshLayoutFix(); } catch (e) {} });
        await p.waitForTimeout(800);
        const fr = await p.evaluate(A_FAB_ROWS);
        if (fr.noFab) bad('[详情页] 找不到 [data-mobile-nav="fab"]');
        else if (fr.hidden) bad('[详情页] fab 不可见');
        else chk(!fr.overlap, '[详情页] fab 不压顶区全宽行', fr.overlap ? ('仍压 [' + fr.overlap.label + '] 面积 ' + fr.overlap.area) : 'fabTop=' + fr.fabTop + ' 零重叠');
        await noteAlive(p); // 插件页态关键锚点采样
      }
    } catch (e) {
      bad('[执行] 用例崩溃', String(e).slice(0, 160));
    }
    await c.close();
  }
  await b.close();

  console.log('\n' + '='.repeat(72));
  /* 断言 8（硬部分）：关键锚点跨四态体检 —— 主页/抽屉/会话/插件页任一命中即活。
     全零 = DSH 改了类名，对应补丁已静默失效，禁止打包。
     这是「修过又复发」的机械防线：每个新修复用的锚点必须加进 CRITICAL_ANCHORS。 */
  const deadCritical = CRITICAL_ANCHORS.filter(a => !ALIVE[a]);
  chk(deadCritical.length === 0, '[锚点] ' + CRITICAL_ANCHORS.length + ' 个关键锚点全部命中',
    deadCritical.length ? ('全取样态零命中: ' + deadCritical.join(' , ') + ' —— DSH 可能改版，对应补丁已失效') :
    '主页/抽屉/会话/插件页四态累计');
  GATE.anchorCritical = { total: CRITICAL_ANCHORS.length, dead: deadCritical };

  console.log(' 结果: ' + PASS + ' 绿 / ' + FAIL + ' 红');
  if (FAIL) { console.log('\n 🔴 禁止打包。未通过：'); FAILS.forEach(f => console.log('    · ' + f)); }
  else console.log(' ✅ 全绿，准予打包。');
  console.log('='.repeat(72));

  /* ================= 开具「发布凭证」 =================
     为什么要有这个东西：
     以前「跑不跑闸门」全靠我自觉，CI 那边完全不看 ——
     只要 commit 推上去就打包，闸门跑没跑过、绿没绿，流水线一无所知。
     这就是「同一个问题修完又复发」在流程层的真正漏洞。

     现在：闸门全绿才写 gate-result.json；CI 打包前强制读它，
     缺失 / ok!=true / 源码指纹对不上，一律 exit 1。

     🔴 sourceHash 的作用：防止「跑过闸门 → 又改代码 → 直接推送打包」。
     凭证里记的是跑闸门那一刻 ViewController.swift 的 sha256，CI 现场再算一次比对。 */
  try {
    const crypto = require('crypto');
    const ROOT = 'E:/desktop/所有skill/deepseek-harness-ios';
    const src = path.join(ROOT, 'DSHios', 'ViewController.swift');
    let srcHash = 'missing';
    try {
      srcHash = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');
    } catch (e) { srcHash = 'missing'; }
    let ver = 'unknown';
    try { ver = (fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8') || '').trim() || 'unknown'; } catch (e) {}

    GATE.version = ver;
    GATE.ok = FAIL === 0;
    GATE.pass = PASS;
    GATE.fail = FAIL;
    GATE.failures = FAILS;
    GATE.sizes = SIZES.map(s => s[0] + 'x' + s[1]);
    GATE.sourceHash = srcHash;
    GATE.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(DIR, 'gate-result.json'), JSON.stringify(GATE, null, 2), 'utf8');
    console.log(' 📝 已写发布凭证 _diag/gate-result.json  (ok=' + GATE.ok + '  v' + ver + '  src=' + srcHash.slice(0, 12) + ')');
  } catch (e) {
    console.log(' ⚠️ 写发布凭证失败: ' + String(e).slice(0, 120));
    /* 写不出凭证 = 无凭证 = CI 会拒绝打包，这里就不再额外造一个红 */
  }

  process.exit(FAIL ? 1 : 0);
})();
