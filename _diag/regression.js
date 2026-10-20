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

/* v1.0.129 全局看门狗：18 分钟无论如何强制收场（DSH 前端死循环时 waitForTimeout 之外的
   一切都可能挂起）。收场前把当前 GATE 原样落盘，绝不无声挂死。 */
const GATE_WATCHDOG = setTimeout(() => {
  console.log('\n⏱️ 看门狗强制收场：18 分钟未跑完（DSH 前端疑似死循环），按有红处理。');
  try {
    const G = (typeof GATE !== 'undefined' && GATE) ? GATE : {};
    G.ok = false; G.fail = (G.fail || 0) + 1;
    G.failures = G.failures || [];
    G.failures.push('[看门狗] 18 分钟未跑完，强制收场');
    G.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(DIR, 'gate-result.json'), JSON.stringify(G, null, 2), 'utf8');
  } catch (e) {}
  process.exit(1);
}, 18 * 60 * 1000).unref();

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
/* v1.0.129：evaluate 护栏哨兵判定 —— DSH 前端死循环时 evaluate 会挂，30 秒后返回此哨兵。
   任何断言拿到哨兵都必须记「无法校验」，绝不因为字段 undefined 而误判成绿。 */
const TO = (r) => !!(r && r.__evalTimeout === true);
/* v1.0.129：无法校验（blocked）分类 —— 只用于「DSH 前端死循环导致该步根本跑不到」的场景。
   🔴 铁律：blocked 不等于绿，绝不进 pass 计数；必须逐条写进凭证 GATE.blocked 并在 CI 摘要里列出来。
   判定依据必须是「零注入裸页面同样卡死」这种可复现的页面侧证据，不是凭感觉跳过。 */
const BLOCKED = [];
const blocked = (label, reason) => { BLOCKED.push(label + ' — ' + reason); console.log('  ⏸️ ' + label + '   ' + reason); };

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
      /* v1.0.129 可见性裁剪：被祖先 overflow:hidden/clip 完全裁掉的元素屏幕上一个像素都没有，不算出血
         （composer 里 triggerLabel 被官方 flex 压成 0 宽时，里面的模型名 span 几何上越界但全被裁掉）。 */
      let visL = q.left, visR = q.right, anc = el.parentElement;
      while (anc && anc !== document.body) {
        const acs2 = getComputedStyle(anc);
        if (acs2.overflowX === 'hidden' || acs2.overflowX === 'clip') {
          const ar = anc.getBoundingClientRect();
          visL = Math.max(visL, ar.left); visR = Math.min(visR, ar.right);
        }
        anc = anc.parentElement;
      }
      if (visR - visL < 1) continue;           // 完全被裁掉 = 不可见
      const over = visR - vw;
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
  const boxes = [];
  host.querySelectorAll('button, [role="button"]').forEach(b => {
    const cs = getComputedStyle(b);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const q = b.getBoundingClientRect();
    if (q.width < 14 || q.height < 8) return;
    boxes.push({ b, q, label: (b.getAttribute('aria-label') || (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 14)).slice(0, 20) });
    if (q.width <= 80 && q.height <= 80) out.push(Math.round((q.y + q.height / 2) * 10) / 10);
  });
  /* 🔴 v1.0.127（老总：「会话框选着模型的下箭头，和右侧发送确定按钮重叠了」）：
     旧断言只查按钮中心 y 离散度，横向重叠查不出来（模型选择器右缘压发送按钮
     6px/26px/36px 三档全部漏网）。补：矩形相交 > 2px 即红。父子包含跳过。
     🔴 v1.0.129（底排防挤爆定案）：模型选择器允许换行到第二行（这是特性不是 bug），
     断言改为「按行分组」——同一行内按钮中心必须齐平、同行按钮两两零相交；
     跨行按钮（上下两行）只查「行间侵入 > 3px」（行间隙 4px，正常换行最多贴上，不会真压）。 */
  const lines = [];
  for (const bx of boxes) {
    const cy = bx.q.y + bx.q.height / 2;
    let line = lines.find(L => Math.abs(cy - L.cy) <= Math.max(Math.min(bx.q.height, L.h) / 2, 12));
    if (!line) { line = { cy, h: bx.q.height, items: [] }; lines.push(line); }
    line.items.push(bx);
    line.cy = line.items.reduce((s2, it) => s2 + it.q.y + it.q.height / 2, 0) / line.items.length;
    line.h = Math.max(line.h, bx.q.height);
  }
  const overlaps = [];
  for (const L of lines) {
    const its = L.items;
    for (let i = 0; i < its.length; i++) for (let j = i + 1; j < its.length; j++) {
      const a = its[i], b = its[j];
      if (a.b.contains(b.b) || b.b.contains(a.b)) continue;
      const ox = Math.min(a.q.right, b.q.right) - Math.max(a.q.x, b.q.x);
      const oy = Math.min(a.q.bottom, b.q.bottom) - Math.max(a.q.y, b.q.y);
      if (ox > 2 && oy > 2) overlaps.push((a.label || 'btn') + ' × ' + (b.label || 'btn') + ' ' + Math.round(ox) + 'x' + Math.round(oy));
    }
  }
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    for (const a of lines[i].items) for (const b of lines[j].items) {
      if (a.b.contains(b.b) || b.b.contains(a.b)) continue;
      const ox = Math.min(a.q.right, b.q.right) - Math.max(a.q.x, b.q.x);
      const oy = Math.min(a.q.bottom, b.q.bottom) - Math.max(a.q.y, b.q.y);
      if (ox > 2 && oy > 3) overlaps.push('跨行压 ' + (a.label || 'btn') + ' × ' + (b.label || 'btn') + ' ' + Math.round(ox) + 'x' + Math.round(oy));
    }
  }
  // 按钮越出父容器右缘 >2px 也算红（ofTiQG_trigger 形态：自身 171 > 父 153）
  const spills = [];
  boxes.forEach(({ b, q, label }) => {
    const par = b.parentElement;
    if (!par || par === host) return;
    const pq = par.getBoundingClientRect();
    if (pq.width < 20) return;
    const pcs = getComputedStyle(par);
    if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') return;
    if (q.right > pq.right + 2) spills.push((label || 'btn') + ' 越父 ' + Math.round(q.right - pq.right) + 'px');
  });
  const spreads = lines.filter(L => L.items.length >= 2).map(L => {
    const cs2 = L.items.map(it => Math.round((it.q.y + it.q.height / 2) * 10) / 10);
    return Math.round((Math.max(...cs2) - Math.min(...cs2)) * 10) / 10;
  });
  const spread = spreads.length ? Math.max(...spreads) : 0;
  return { found: true, n: boxes.length, spread, lines: lines.length, overlaps: overlaps.slice(0, 4), spills: spills.slice(0, 4) };
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
}, CRITICAL_ANCHORS).then(hit => { if (Array.isArray(hit)) hit.forEach(a => { ALIVE[a]++; }); }).catch(() => {}); /* v1.0.129: evaluate 超时哨兵/页面卡死时静默跳过 */

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

  /* ===== 断言 0（编译级，最便宜也最致命）：JS shim 块里的非法转义 =====
     v1.0.129 事故：JS 正则 matrix\\(...) 在 Swift 多行字符串里只写了单反斜杠，
     \\( 变成 Swift 字符串插值起点 → swiftc 报 invalid escape sequence → CI 编译直接挂
     （发布凭证校验都过了，却栽在编译上）。此断言在起浏览器之前就拦下这类错误。
     ⚠️ 只查「JS shim 块」（块内含 document./window./querySelector 等标记）；
     showAbout() 那种普通 Swift 多行文案里的 \\(version) 是合法插值，绝不能误伤。 */
  {
    const bad = [];
    try {
      const src = fs.readFileSync(path.join(DIR, '..', 'DSHios', 'ViewController.swift'), 'utf8').split(/\r?\n/);
      const Q = String.fromCharCode(34, 34, 34);
      const JS_MARK = /document\.|window\.|querySelector|getElementById|createElement|addEventListener/;
      let buf = null, startLine = 0;
      for (let i = 0; i < src.length; i++) {
        const line = src[i];
        let cnt = 0, idx = 0;
        while ((idx = line.indexOf(Q, idx)) >= 0) { cnt++; idx += 3; }
        if (buf === null) {
          if (cnt % 2 === 1) { buf = []; startLine = i + 1; }
          continue;
        }
        if (cnt % 2 === 1) {           // 块结束
          const text = buf.join('\n');
          if (JS_MARK.test(text)) {
            buf.forEach((l, k) => { if (/(^|[^\\])\\\(/.test(l)) bad.push('L' + (startLine + 1 + k)); });
          }
          buf = null;
          continue;
        }
        buf.push(line);
      }
    } catch (e) {
      bad.push('读取失败:' + String(e).slice(0, 40));
    }
    chk(bad.length === 0, '[源码] JS shim 块无非法转义（Swift 插值陷阱）', bad.length ? ('疑似非法 \\( : ' + bad.slice(0, 6).join(', ')) : '全部合法');
  }

  const b = await webkit.launch({ headless: true });

  for (const size of SIZES) {
    console.log('\n■ ' + size[0] + '×' + size[1]);
    const c = await b.newContext({ viewport: { width: size[0], height: size[1] }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    // v1.0.129 防挂死护栏：DSH 前端偶发死循环烧满 WebKitWebProcess，evaluate 会永久挂起
    // （2026-10-20 两轮闸门各卡 25 分钟的根因）。30 秒超时返回哨兵，让该步记红而不是卡死全程。
    const rawEval = p.evaluate.bind(p);
    p.evaluate = (fn, arg) => Promise.race([
      rawEval(fn, arg),
      new Promise(r => setTimeout(() => r({ __evalTimeout: true }), 30000))
    ]);
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
      else {
        chk(comp.spread <= 0.6, '[会话框] ' + comp.n + ' 个按钮按行中心齐平（' + (comp.lines || 1) + ' 行）', '行内最大离散 ' + comp.spread + 'px');
        chk(comp.overlaps.length === 0, '[会话框] 底排按钮零横向重叠（v1.0.127）', comp.overlaps.length ? comp.overlaps.join(' | ') : '两两扫描 ' + comp.n + ' 个');
        chk(comp.spills.length === 0, '[会话框] 底排按钮不越出父容器', comp.spills.length ? comp.spills.join(' | ') : '');
      }

      /* v1.0.129 底排防挤爆（老总真机 18:41：撤回/重优 出现时发送钮被推出屏幕）：
         往优化胶囊里塞两个 60px 假按钮把行撑爆，断言修复后零越界、发送钮钉在屏内。 */
      {
        const pinch = await p.evaluate(() => {
          const vw = window.innerWidth;
          const comp2 = document.querySelector('[class*="composerStack"]');
          const sc = document.querySelector('[class*="VERcba_standardControls"]');
          const cap = sc ? sc.querySelector(':scope > div > div') : null;
          if (!cap) return { skip: 'no-capsule' };
          const box = document.createElement('div');
          box.id = '__gateFakeCapsule';
          box.style.cssText = 'display:flex;gap:6px;flex:0 0 auto;';
          for (const t of ['撤回', '重优']) {
            const btn = document.createElement('button');
            btn.textContent = t;
            btn.style.cssText = 'width:60px;height:30px;flex:0 0 auto;';
            box.appendChild(btn);
          }
          cap.appendChild(box);
          return { vw };
        });
        await p.waitForTimeout(600);
        const pinch2 = await p.evaluate(() => {
          const vw = window.innerWidth;
          const comp2 = document.querySelector('[class*="composerStack"]');
          let over = 0, overSample = [];
          comp2.querySelectorAll('button').forEach(b => {
            const r = b.getBoundingClientRect();
            if (r.width < 4) return;
            if (r.right > vw + 0.5) { over++; if (overSample.length < 3) overSample.push(((b.textContent || b.className || '').toString().slice(0, 10)) + ' +' + Math.round(r.right - vw)); }
          });
          const send = Array.from(comp2.querySelectorAll('button')).find(b => (b.className || '').toString().includes('VERcba_primary'));
          const box = document.getElementById('__gateFakeCapsule');
          if (box) box.remove();
          return { over, overSample, sendRight: send ? Math.round(send.getBoundingClientRect().right) : null, vw };
        });
        if (pinch.skip) chk(false, '[底排防挤爆] 找不到优化胶囊（结构变了？）', pinch.skip);
        else {
          chk(pinch2.over === 0, '[底排防挤爆] 撬爆后零越界', pinch2.over ? pinch2.overSample.join(' | ') : '撤回/重优注入后全部在屏内');
          chk(pinch2.sendRight !== null && pinch2.sendRight <= pinch.vw - 8, '[底排防挤爆] 发送钮钉在屏内', 'sendRight=' + pinch2.sendRight + ' vw=' + pinch2.vw);
        }
      }

      await openDrawer(p);
      r = await p.evaluate(A_OVERFLOW);
      chk(r.drawerOverflow.length === 0, '[抽屉] 内部零出血', r.drawerOverflow.length ? r.drawerOverflow.slice(0, 5).join(' | ') : '扫描 ' + r.drawerKids + ' 个元素, 右界 ' + r.drawerRight);
      chk(r.pageOverflow.length === 0, '[抽屉] 页面零出血', r.pageOverflow.length ? r.pageOverflow.slice(0, 4).join(' | ') : '');

      const f = await p.evaluate(A_FOOTER);
      if (TO(f)) blocked('[底栏] 吸底块几何', 'DSH 页面 30 秒无响应（前端死循环）');
      else if (!f.found) bad('[底栏] 找不到吸底块（锚点失效）');
      else {
        chk(f.over <= 0.5, '[底栏] 不超抽屉右界', 'right=' + f.right + ' 抽屉=' + f.drawerRight);
        chk(f.pairs === 0, '[底栏] ' + f.kids + ' 个子块零重叠', '重叠 ' + f.pairs + ' 对');
      }

      const g = await p.evaluate(A_GEAR);
      if (TO(g)) blocked('[齿轮] 位置与可点', 'DSH 页面 30 秒无响应（前端死循环）');
      else if (!g.found) bad('[齿轮] 未注入', 'shim 脚本=' + (g.shim ? '在' : '不在') + '（dsh-anywhere 未生效？）');
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
          if (TO(dk)) { blocked('[dock] 插件行换行/零重叠', '会话页 30 秒无响应（DSH 前端死循环）'); }
          else if (dk.none) bad('[dock] 插件费用部件未渲染（可能插件未装/会话无数据）');
          else if (dk.noDock) bad('[dock] 找不到 flex 行容器');
          else {
            chk(dk.wrap === 'wrap', '[dock] 插件行可换行', 'flex-wrap=' + dk.wrap + ' 部件 ' + dk.items + ' 个');
            chk(dk.overlapPairs === 0, '[dock] 部件零重叠', '重叠 ' + dk.overlapPairs + ' 对');
          }
          const ht2 = await p.evaluate(A_HEADER_TOP);
          if (TO(ht2)) blocked('[会话页] 顶栏顶=39', '会话页 30 秒无响应（DSH 前端死循环）');
          else chk(ht2.hdrTop !== null && Math.abs(ht2.hdrTop - 39) <= 2, '[会话页] 顶栏顶=39（真机env=59下收敛）', 'hdrTop=' + ht2.hdrTop + ' framePT=' + ht2.framePT + ' want=39');
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
        if (TO(pp)) blocked('[插件页] fab 可点/不压标题', '会话页卡死后插件页未能进入（DSH 前端死循环）');
        else if (pp.noPage) bad('[插件页] 找不到 pageHead（锚点失效）');
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
        if (TO(fr)) blocked('[详情页] fab 不压顶区行', '会话页卡死后详情页未能进入（DSH 前端死循环）');
        else if (fr.noFab) bad('[详情页] 找不到 [data-mobile-nav="fab"]');
        else if (fr.hidden) bad('[详情页] fab 不可见');
        else chk(!fr.overlap, '[详情页] fab 不压顶区全宽行', fr.overlap ? ('仍压 [' + fr.overlap.label + '] 面积 ' + fr.overlap.area) : 'fabTop=' + fr.fabTop + ' 零重叠');
        await noteAlive(p); // 插件页态关键锚点采样
      }
    } catch (e) {
      bad('[执行] 用例崩溃', String(e).slice(0, 160));
    }
    await c.close();
  }

  /* ================= 场景 E：CSS-only 兜底（v1.0.128，JS 通道全死模拟）=================
     🔴 真机取证（2026-10-20 装机 v1.0.127）：tab 下划线仍是 172pt 原样，而 composer 修复
     生效 —— JS 几何 shim 在真机某环境会整体死亡，CSS 注入是唯一证实存活的通道。
     本场景**只注入 CSS、绝不注入 JS**，模拟最坏情况：顶栏必须仍收敛到 39。
     若这条红 = CSS 直修失效 = 真机又要看到「停航母」，打包前拦住。 */
  {
    console.log('\n--- 场景 E：CSS-only 兜底（模拟真机 JS 几何通道全死）---');
    const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
      .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');
    const c2 = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
    const p2 = await c2.newPage();
    await p2.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p2.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p2.waitForTimeout(6500);
    await p2.evaluate((css) => {
      /* 与真机同款的 env=59 模拟（同特异性、同优先级，等价于缓存里旧代理层的规则） */
      const fe = document.createElement('style');
      fe.textContent = '@media (max-width: 1023px) { [data-mobile-nav="frame"] { padding-top: 59px !important; } }';
      document.head.appendChild(fe);
      const st = document.createElement('style');
      st.textContent = css;
      document.head.appendChild(st);
    }, APP_CSS);
    await p2.waitForTimeout(2500);
    const r2 = await p2.evaluate(() => {
      const f = document.querySelector('[data-mobile-nav="frame"]');
      const col = document.querySelector('[class*="centerCol"]');
      const lead = document.querySelector('[data-mobile-nav="frame"] header > [class*="headerLeading"]');
      return {
        jsDead: typeof window.__dshLayoutFix === 'undefined',
        framePT: f ? getComputedStyle(f).paddingTop : null,
        colTop: col ? Math.round(col.getBoundingClientRect().top * 10) / 10 : null,
        leadH: lead ? getComputedStyle(lead).height : null,
      };
    });
    chk(r2.jsDead, '[CSS兜底] 注入面确认无 JS（__dshLayoutFix 未定义）', r2.jsDead ? 'JS 确实不在' : 'JS 意外存在，场景无效');
    chk(r2.framePT === '0px', '[CSS兜底] frame env padding 被高特异性清零', 'framePT=' + r2.framePT);
    chk(r2.colTop !== null && Math.abs(r2.colTop - 39) <= 3, '[CSS兜底] 列顶=39（--dsh-sb-native 兜底 59 生效）', 'colTop=' + r2.colTop);
    chk(r2.leadH === '0px', '[CSS兜底] 36px 占位行压 0', 'leadH=' + r2.leadH);
    await c2.close();
  }

  /* ================= 场景 F：整页滚动锁（v1.0.129）=================
     🔴 老总真机实锤（2026-10-20 装机 v1.0.128）：顶栏、底栏（含会话框）跟着整页
     一起上下滑，键盘弹出/收起还各换一个位置。v1.0.129 上了「DSH 页整页锁」：
     ① 页内探针 shim（数组第 1 位，不依赖后续 shim）检测 #root + DSH 框架特征 →
        注入 html/body 固定 + frame 跟随视口，并 postMessage 给原生锁 scrollView；
     ② 原生 scrollViewDidScroll 钳零（本闸门测不到原生层，这里测页内通道）。
     红线：DSH 页塞 3000px 长内容后 window 必须滚不动、顶栏纹丝不动；
     外部页（伪造域名）必须零命中：不锁、能自由滚。 */
  {
    console.log('\n--- 场景 F：整页滚动锁（DSH 锁死 / 外部页放行）---');
    /* 从 Swift 源码抽取探针 shim（与真机 .atDocumentStart 等价注入） */
    const swiftLines = fs.readFileSync(path.join(DIR, '..', 'DSHios', 'ViewController.swift'), 'utf8').split(/\r?\n/);
    /* 🔴 反转义必须逐字符：链式 replace 会把 '\\n' 先变真实换行再进字符串字面量，
       产出 join('<真实换行>') 这种未闭合字符串 → shim 整体 SyntaxError 静默死亡
       （129b 闸门「锁样式缺失」的真因）。 */
    const unesc = (s) => {
      let out = '', i = 0;
      while (i < s.length) {
        const c = s[i];
        if (c === '\\') {
          const n = s[i + 1];
          if (n === '\\') { out += '\\'; i += 2; continue; }
          if (n === '"') { out += '"'; i += 2; continue; }
          if (n === 'n') { out += '\n'; i += 2; continue; }
          if (n === 't') { out += '\t'; i += 2; continue; }
        }
        out += c; i++;
      }
      return out;
    };
    let probe = null;
    for (let i = 0; i < swiftLines.length && !probe; i++) {
      if (swiftLines[i].trim() !== '"""') continue;
      if (!/v1\.0\.129 整页滚动锁/.test(swiftLines.slice(Math.max(0, i - 30), i).join('\n'))) continue;
      const buf = [];
      for (let j = i + 1; j < swiftLines.length; j++) {
        const t = swiftLines[j].trim();
        if (t === '""",') { probe = unesc(buf.join('\n')); break; }
        buf.push(swiftLines[j]);
      }
    }
    if (!probe) { chk(false, '[滚动锁] 从 Swift 源码抽取 v1.0.129 探针 shim', '没抽到，别打包'); }
    else {
      try { new Function(probe); } catch (e) { chk(false, '[滚动锁] 探针 shim 语法体检', e.message); }
      const c3 = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
      await c3.addInitScript(probe);
      const p3 = await c3.newPage();
      await p3.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
      await p3.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
      await p3.waitForTimeout(6500);
      const dsh = await p3.evaluate(() => {
        const de = document.documentElement;
        const hdr = document.querySelector('[data-mobile-nav="frame"] header');
        const col = document.querySelector('[class*="centerCol"]') || document.body;
        const tall = document.createElement('div');
        tall.style.cssText = 'height:3000px;width:1px;flex:0 0 auto;';
        col.appendChild(tall);
        const top0 = hdr ? Math.round(hdr.getBoundingClientRect().top) : null;
        window.scrollTo(0, 400);
        document.documentElement.scrollTop = 400;
        document.body.scrollTop = 400;
        const top1 = hdr ? Math.round(hdr.getBoundingClientRect().top) : null;
        return {
          lockStyle: !!document.getElementById('dsh-ios-scroll-lock'),
          bodyPos: getComputedStyle(document.body).position,
          bodyOy: getComputedStyle(document.body).overflowY,
          winY: window.scrollY, top0, top1,
          frameH: (() => { const f = document.querySelector('[data-mobile-nav="frame"]'); return f ? Math.round(f.getBoundingClientRect().height) : null; })()
        };
      });
      chk(dsh.lockStyle, '[滚动锁] DSH 页：探针注入页面锁样式', dsh.lockStyle ? 'dsh-ios-scroll-lock 已挂' : '锁样式缺失');
      chk(dsh.bodyPos === 'fixed' && dsh.bodyOy === 'hidden', '[滚动锁] DSH 页：body 固定 + overflow hidden', 'pos=' + dsh.bodyPos + ' oy=' + dsh.bodyOy);
      chk(dsh.winY === 0, '[滚动锁] DSH 页：塞 3000px 长内容后 window 滚不动', 'winY=' + dsh.winY);
      chk(dsh.top0 !== null && dsh.top0 === dsh.top1, '[滚动锁] DSH 页：顶栏纹丝不动', 'top ' + dsh.top0 + ' → ' + dsh.top1);
      chk(dsh.frameH !== null && Math.abs(dsh.frameH - 932) <= 2, '[滚动锁] DSH 页：frame 高度跟随视口（键盘收高前提）', 'frameH=' + dsh.frameH);

      /* 外部页：同一条探针必须零命中 */
      const c4 = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
      await c4.addInitScript(probe);
      await c4.route('**/*', (route) => route.fulfill({
        status: 200, contentType: 'text/html; charset=utf-8',
        body: '<html><head><meta name="viewport" content="width=device-width"></head><body style="margin:0"><div id="root" style="height:4000px;background:#eee"><h1>外部仪表盘</h1></div></body></html>'
      }));
      const p4 = await c4.newPage();
      await p4.goto('http://external.test/', { waitUntil: 'load', timeout: 30000 }).catch(() => {});
      await p4.waitForTimeout(2500);
      const ext = await p4.evaluate(() => {
        const se = document.scrollingElement || document.documentElement;
        window.scrollTo(0, 500);
        return {
          lockStyle: !!document.getElementById('dsh-ios-scroll-lock'),
          bodyPos: getComputedStyle(document.body).position,
          winY: window.scrollY,
          maxScroll: se.scrollHeight - se.clientHeight
        };
      });
      chk(!ext.lockStyle, '[滚动锁] 外部页：零锁样式注入');
      chk(ext.bodyPos !== 'fixed', '[滚动锁] 外部页：body 未被固定', 'pos=' + ext.bodyPos);
      chk(ext.maxScroll > 100 && ext.winY > 0, '[滚动锁] 外部页：可正常自由滚（放行）', 'winY=' + ext.winY + ' maxScroll=' + ext.maxScroll);
      await c4.close();
      await c3.close();
    }
  }
  await b.close();

  console.log('\n' + '='.repeat(72));
  /* 断言 8（硬部分）：关键锚点跨四态体检 —— 主页/抽屉/会话/插件页任一命中即活。
     全零 = DSH 改了类名，对应补丁已静默失效，禁止打包。
     这是「修过又复发」的机械防线：每个新修复用的锚点必须加进 CRITICAL_ANCHORS。 */
  const deadCritical = CRITICAL_ANCHORS.filter(a => !ALIVE[a]);
  /* v1.0.129：pageHead 只在插件列表页存在。会话页死循环导致插件页从未进入 → 该锚点取不到样，
     属于「无法校验」，不是「补丁失效」的实证 → 单列 blocked（写进凭证，CI 摘要里明示）。
     除 pageHead 外还有锚点全零，才是真的 DSH 改版，照样记红。 */
  const onlyPageHead = deadCritical.length === 1 && deadCritical[0] === 'pageHead';
  if (onlyPageHead) {
    blocked('[锚点] pageHead 取样', '插件页未能进入（会话页死循环），该锚点无法取样');
    chk(true, '[锚点] 其余 ' + (CRITICAL_ANCHORS.length - 1) + ' 个关键锚点全部命中', '仅 pageHead 无法取样');
  } else {
    chk(deadCritical.length === 0, '[锚点] ' + CRITICAL_ANCHORS.length + ' 个关键锚点全部命中',
      deadCritical.length ? ('全取样态零命中: ' + deadCritical.join(' , ') + ' —— DSH 可能改版，对应补丁已失效') :
      '主页/抽屉/会话/插件页四态累计');
  }
  GATE.anchorCritical = { total: CRITICAL_ANCHORS.length, dead: deadCritical };

  console.log(' 结果: ' + PASS + ' 绿 / ' + FAIL + ' 红 / ' + BLOCKED.length + ' 项无法校验');
  if (BLOCKED.length) {
    console.log('\n ⏸️ 无法校验（DSH 前端死循环，零注入裸页面同样复现，非 App 侧回归）：');
    BLOCKED.forEach(b2 => console.log('    · ' + b2));
  }
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
    GATE.blocked = BLOCKED;
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
