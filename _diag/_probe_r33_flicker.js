/* ============================================================================
 * R33 取证探针：标题预留高频横跳复现（老总 2026-10-24 双截图实锤）
 * 机制假设：后台任务运行时 DSH 流式重渲染把胶囊 wrapper 打回流内一帧（内联样式清零），
 *   fixHeaderFit 当拍量出偏小 reserve → 下一拍 moveAgentBadge 冻回绝对定位 → 偏大 reserve
 *   → 两个值逐拍互写 → 标题在「只剩省略号 / 展开完全」间横跳。
 * 探针模拟：交替「剥掉 wrapper 内联样式（模拟 React 重挂载）→ tick（读低）→ tick（读高）」，
 *   逐拍采样 --dsh-head-right 与标题宽度，统计翻转次数。
 * 用法：node _probe_r33_flicker.js [430]
 * ==========================================================================*/
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const W = parseInt(process.argv[2] || '430', 10);
const CAP = '1 个后台任务运行中';

const installCapsule = (text) => {
  const util = document.querySelector('[data-phase] header [class*="headerUtilities"]');
  if (!util) return 'no-utilities';
  let root = util.querySelector(':scope > [data-r23-capsule]');
  if (!root) {
    root = document.createElement('div');
    root.setAttribute('data-r23-capsule', '1');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    const dot = document.createElement('span'); dot.textContent = '●';
    const cnt = document.createElement('span');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '12'); svg.setAttribute('height', '12');
    btn.appendChild(dot); btn.appendChild(cnt); btn.appendChild(svg);
    root.appendChild(btn);
    util.appendChild(root);
  }
  const btn = root.querySelector('button');
  btn.querySelector('span:last-of-type').textContent = text;
  btn.setAttribute('aria-label', text);
  return 'ok';
};

/* 模拟 React 流式重挂载：把 wrapper 节点原位替换（removeChild+appendChild = childList 突变，
   与 React 重创建节点同构，会唤醒 shim 的 MutationObserver），内联样式自然清零 */
const reactReset = () => {
  const root = document.querySelector('[data-r23-capsule]');
  if (!root) return 'no-capsule';
  const parent = root.parentElement;
  if (!parent) return 'no-parent';
  const fresh = root.cloneNode(true);
  fresh.removeAttribute('style');
  parent.replaceChild(fresh, root);
  const btn = fresh.querySelector('button');
  btn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:12px;line-height:18px;'
    + 'border:1px solid rgba(128,128,128,.4);border-radius:14px;background:transparent;color:inherit;'
    + 'height:24px;vertical-align:middle;cursor:pointer;width:max-content';
  return 'reset';
};

const SAMPLE = () => {
  const root = document.querySelector('[data-r23-capsule]');
  const row = document.querySelector('[data-phase] header [class*="titleRow"]');
  const crumbs = row && row.querySelector('[class*="crumbs"]');
  const b = crumbs && crumbs.getBoundingClientRect();
  const hdr = document.querySelector('header');
  const acts = row && row.querySelector('[class*="headerActions"]');
  const util = row && row.querySelector('[class*="headerUtilities"]');
  const r = (el) => { if (!el) return null; const q = el.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.right), Math.round(q.width)]; };
  return {
    reserve: document.documentElement.style.getPropertyValue('--dsh-head-right') || '-',
    titleW: b ? Math.round(b.width) : -1,
    wrapW: root ? Math.round(root.getBoundingClientRect().width) : -1,
    wrapPos: root ? (getComputedStyle(root).position) : '-',
    jobsW: window.__dshJobsW === undefined ? 'undef' : window.__dshJobsW,
    hdrW: hdr ? Math.round(hdr.getBoundingClientRect().width) : -1,
    rowRight: row ? Math.round(row.getBoundingClientRect().right) : -1,
    acts: r(acts), util: r(util)
  };
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: W, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate(({ js }) => {
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
  await p.evaluate(() => window.__regTick());
  await p.waitForTimeout(1000);
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
  for (let i = 0; i < 3; i++) { await p.evaluate(() => window.__regTick()); await p.waitForTimeout(600); }
  await p.evaluate(installCapsule, CAP);
  for (let i = 0; i < 3; i++) { await p.evaluate(() => window.__regTick()); await p.waitForTimeout(500); }

  /* ===== 阶段1：纯收敛测试（无 reset 连续 tick）===== */
  const settle = [];
  for (let i = 0; i < 6; i++) {
    await p.evaluate(() => window.__regTick());
    settle.push(await p.evaluate(SAMPLE));
    await p.waitForTimeout(200);
  }
  console.log('== 阶段1 纯收敛（无 reset）==');
  for (const s of settle) console.log(` tick  reserve=${s.reserve} 标题=${s.titleW} jobsW=${s.jobsW} acts=${JSON.stringify(s.acts)} util=${JSON.stringify(s.util)}`);

  /* ===== 阶段2：横跳复现（reset 与 tick 交替）===== */
  const samples = [];
  const reserves = new Set(), widths = new Set();
  for (let i = 0; i < 12; i++) {
    await p.evaluate(reactReset);
    await p.evaluate(() => window.__regTick());           // 低拍：wrapper 在流内
    samples.push({ phase: 'low', ...await p.evaluate(SAMPLE) });
    await p.evaluate(() => window.__regTick());           // 高拍：shim 已冻回
    samples.push({ phase: 'high', ...await p.evaluate(SAMPLE) });
    await p.waitForTimeout(120);
  }
  console.log('== 阶段2 横跳采样（' + W + '）==');
  for (const s of samples) {
    reserves.add(s.reserve); widths.add(s.titleW);
    console.log(` ${s.phase}  reserve=${s.reserve}  标题宽=${s.titleW}  胶囊宽=${s.wrapW}(${s.wrapPos})  jobsW=${s.jobsW} hdr=${s.hdrW} rowR=${s.rowRight} acts=${JSON.stringify(s.acts)} util=${JSON.stringify(s.util)}`);
  }
  console.log(`-- [仅阶段2] reserve 取值数: ${reserves.size}（${[...reserves].join(' / ')}）`);
  console.log(`-- [仅阶段2] 标题宽度取值数: ${widths.size}（${[...widths].sort((a,b)=>a-b).join(' / ')}）`);
  console.log(`-- 判定: ${reserves.size >= 2 ? '🔴 横跳复现（预留逐拍互写）' : '✅ 稳定（横跳根治）'}`);

  /* ===== 阶段3：无胶囊 + 流式重挂载（老总截图场景：团队按钮容器被打回流内）===== */
  await p.evaluate(() => { const c = document.querySelector('[data-r23-capsule]'); if (c) c.remove(); });
  for (let i = 0; i < 3; i++) { await p.evaluate(() => window.__regTick()); await p.waitForTimeout(400); }
  const s3 = [];
  for (let i = 0; i < 10; i++) {
    await p.evaluate(() => {
      const acts = document.querySelector('[data-phase] header [class*="headerActions"]');
      if (acts) { const fresh = acts.cloneNode(true); fresh.removeAttribute('style'); acts.parentElement.replaceChild(fresh, acts); }
    });
    await p.evaluate(() => window.__regTick());
    s3.push(await p.evaluate(SAMPLE));
    await p.evaluate(() => window.__regTick());
    s3.push(await p.evaluate(SAMPLE));
    await p.waitForTimeout(100);
  }
  console.log('== 阶段3 无胶囊+团队容器重挂载 ==');
  const r3 = new Set();
  for (const s of s3.slice(-8)) { r3.add(s.reserve); console.log(` ${s.phase}  reserve=${s.reserve}  标题=${s.titleW}`); }
  console.log(`-- [阶段3尾段] reserve 取值数: ${r3.size}（${[...r3].join(' / ')}）→ ${r3.size >= 2 ? '🔴 仍横跳' : '✅ 稳定'}`);
  await b.close();
})().catch((e) => { console.error('探针失败:', e); process.exit(1); });
