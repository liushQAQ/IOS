/* ============================================================================
 * R23 取证探针：后台任务胶囊 × 右侧按钮（智能体团队/子智能体徽标）几何对拍
 * 复现真实挂载顺序：先「转圈圈」(spinner-only) → 后渲染「N 个后台任务运行中」文本
 * 用 Build 97 现场 shim（app_inject.js）跑，量出重叠证据；修复后同脚本复测。
 * 用法：node _probe_r23_jobscap.js [430|393|375]
 * ==========================================================================*/
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const W = parseInt(process.argv[2] || '430', 10);
const H = W === 393 ? 852 : (W === 375 ? 812 : 932);
const SHOT = (n) => path.join(DIR, `_r23_${W}_${n}.png`);

const CAP_FULL = '1 个后台任务运行中';

/* 按官方 dsh-client-ui-jobs 结构造假胶囊：
   <div>(rootRef, 无类名) > button[aria-label=N 个后台任务运行中] > (dot + count span + chevron)
   页面侧独立函数（可序列化），text 由 evaluate 第二参传入 */
const installCapsule = (text) => {
  const util = document.querySelector('[data-phase] header [class*="headerUtilities"]')
    || document.querySelector('header [class*="headerUtilities"]');
  if (!util) return 'no-utilities';
  let root = util.querySelector(':scope > [data-r23-capsule]');
  if (!root) {
    root = document.createElement('div');
    root.setAttribute('data-r23-capsule', '1');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    const cnt = document.createElement('span');
    const dot = document.createElement('span');
    dot.textContent = '●';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '12'); svg.setAttribute('height', '12');
    btn.appendChild(dot); btn.appendChild(cnt); btn.appendChild(svg);
    root.appendChild(btn);
    util.appendChild(root);
  }
  const btn = root.querySelector('button');
  const cnt = btn.querySelector('span:last-of-type') || btn.querySelector('span');
  const dot = btn.querySelector('span:first-of-type');
  cnt.textContent = text;
  btn.setAttribute('aria-label', text);
  /* 官方 trigger 的近似外观（inline-flex + 间距 + 字号），让宽度物理可信 */
  btn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:12px;line-height:18px;'
    + 'border:1px solid rgba(128,128,128,.4);border-radius:14px;background:transparent;color:inherit;'
    + 'height:24px;vertical-align:middle;cursor:pointer;width:max-content';
  dot.style.cssText = 'color:#f59e0b;font-size:9px;display:inline-block';
  return 'ok:' + text;
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  p.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 120)));

  // —— 与闸门同款 prep ——
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const fe = document.createElement('style');
    fe.id = '__reg_fakeenv';
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
  await p.evaluate(() => window.__regTick());
  await p.waitForTimeout(1000);

  // —— 进会话（与闸门场景 B 同路径）——
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('Our Free Model') >= 0) || rows[1] || rows[0];
    if (t) { const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + 60, r.y + r.height / 2); if (el) el.click(); }
  });
  await p.waitForTimeout(6000);
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(3000);
  for (let i = 0; i < 6; i++) { await p.evaluate(() => window.__regTick()); await p.waitForTimeout(800); }

  const hasSession = await p.evaluate(() => ({
    row: !!document.querySelector('[data-phase] header [class*="titleRow"]'),
    util: !!document.querySelector('[data-phase] header [class*="headerUtilities"]'),
    team: !!document.querySelector('header button[aria-label*="智能体团队"]')
  }));
  console.log(`== ${W}x${H} 会话页就绪:`, JSON.stringify(hasSession));
  if (!hasSession.row) { console.log('❌ 未进入会话页（titleRow 不存在），探针中止'); await b.close(); process.exit(2); }

  const MEASURE = () => {
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), right: +b.right.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
    const row = document.querySelector('[data-phase] header [class*="titleRow"]');
    const crumbs = row && row.querySelector('[class*="crumbs"]');
    const cur = crumbs && crumbs.querySelector('[class*="crumbCurrent"]');
    const capRoot = document.querySelector('[data-r23-capsule]');
    const capBtn = capRoot && capRoot.querySelector('button');
    const cntSpan = capBtn && capBtn.querySelector('span:last-of-type');
    const team = document.querySelector('header button[aria-label*="智能体团队"]');
    const teamWrap = team && team.parentElement;
    const badge = document.querySelector('header button[aria-label*="子智能体"]');
    const badgeWrap = badge && badge.parentElement;
    const corner = document.querySelector('[data-conversation-header-corner]');
    const cornerBtn = corner && (corner.querySelector('button') || corner);
    const root = document.documentElement;
    const ov = (a, b2) => (!a || !b2) ? null : Math.max(0, Math.min(a.right, b2.right) - Math.max(a.x, b2.x));
    return {
      vw: document.documentElement.clientWidth,
      headRight: root.style.getPropertyValue('--dsh-head-right') || '(未写)',
      row: r(row), crumbs: r(crumbs), crumbText: r(cur),
      capWrap: r(capRoot), capBtn: r(capBtn), capText: r(cntSpan),
      capBtnStyle: capBtn ? { w: capBtn.style.width || '-', ow: getComputedStyle(capBtn).overflow, mwidth: getComputedStyle(capBtn).maxWidth, disp: getComputedStyle(capBtn).display } : null,
      teamWrap: r(teamWrap), team: r(team), badgeWrap: r(badgeWrap), badge: r(badge), corner: r(cornerBtn),
      ov_cap_team: ov(r(capBtn), r(team)), ov_cap_badge: ov(r(capBtn), r(badge)),
      ov_cap_title: ov(r(capBtn), r(cur)), ov_title_team: ov(r(cur), r(team))
    };
  };
  const dump = (tag, m) => {
    console.log(`\n----- ${tag} -----`);
    console.log('vw=' + m.vw + '  --dsh-head-right=' + m.headRight);
    console.log('titleRow   ', JSON.stringify(m.row));
    console.log('crumbs容器 ', JSON.stringify(m.crumbs));
    console.log('标题文本   ', JSON.stringify(m.crumbText));
    console.log('胶囊wrapper', JSON.stringify(m.capWrap));
    console.log('胶囊button ', JSON.stringify(m.capBtn), JSON.stringify(m.capBtnStyle));
    console.log('胶囊count  ', JSON.stringify(m.capText));
    console.log('团队wrapper', JSON.stringify(m.teamWrap), ' 团队btn', JSON.stringify(m.team));
    console.log('徽标wrapper', JSON.stringify(m.badgeWrap), ' 徽标btn', JSON.stringify(m.badge));
    console.log('抽屉       ', JSON.stringify(m.corner));
    const f = (v) => (v === null ? '无' : (v > 0 ? '🔴重叠' + v.toFixed(1) + 'px' : '安全'));
    console.log('胶囊×团队: ' + f(m.ov_cap_team) + '   胶囊×徽标: ' + f(m.ov_cap_badge)
      + '   胶囊×标题: ' + f(m.ov_cap_title) + '   标题×团队: ' + f(m.ov_title_team));
  };

  /* ===== 场景 A：冷挂载 = 满文本胶囊直接出现 ===== */
  console.log('注入A:', await p.evaluate(installCapsule, CAP_FULL));
  for (let i = 0; i < 4; i++) { await p.evaluate(() => window.__regTick()); await p.waitForTimeout(700); }
  dump('A 冷挂载满文本（430 档）', await p.evaluate(MEASURE));
  await p.screenshot({ path: SHOT('A_cold') });

  /* ===== 场景 B：真实顺序 = 先转圈圈，tick 冻结宽度后再长文本 ===== */
  console.log('注入B-转圈圈:', await p.evaluate(installCapsule, '●'));
  for (let i = 0; i < 3; i++) { await p.evaluate(() => window.__regTick()); await p.waitForTimeout(700); }
  const mid = await p.evaluate(MEASURE);
  dump('B1 转圈圈已被定位（宽度冻结点）', mid);
  console.log('注入B-长文本:', await p.evaluate(installCapsule, CAP_FULL));
  for (let i = 0; i < 4; i++) { await p.evaluate(() => window.__regTick()); await p.waitForTimeout(700); }
  dump('B2 长文本渲染后（稳态）', await p.evaluate(MEASURE));
  await p.screenshot({ path: SHOT('B_grow') });

  await b.close();
  console.log('\n探针完成。');
})().catch((e) => { console.error('探针失败:', e); process.exit(1); });
