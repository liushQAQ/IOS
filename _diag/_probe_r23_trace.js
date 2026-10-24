/* R23 插桩诊断：逐 tick 跟踪胶囊测量/冻结路径（430 档） */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
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
  btn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:12px;line-height:18px;'
    + 'border:1px solid rgba(128,128,128,.4);border-radius:14px;background:transparent;color:inherit;'
    + 'height:24px;vertical-align:middle;cursor:pointer;width:max-content';
  return 'ok';
};

const SNAP = () => {
  const root = document.querySelector('[data-r23-capsule]');
  const btn = root && root.querySelector('button');
  const util = document.querySelector('[data-phase] header [class*="headerUtilities"]');
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.right), Math.round(b.width)]; };
  const s = (el) => el ? (el.getAttribute('style') || '-') : null;
  return {
    util: r(util), utilStyle: s(util),
    wrap: r(root), wrapStyle: s(root),
    btn: r(btn),
    btnCS: btn ? (() => { const c = getComputedStyle(btn); return c.maxWidth + '|' + c.overflow + '|' + c.width; })() : null,
    headRight: document.documentElement.style.getPropertyValue('--dsh-head-right') || '-',
    jobsFound: !!document.querySelector('header button[aria-label*="后台任务"]')
  };
};

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA, colorScheme: 'dark' });
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

  console.log('== 注入前:', JSON.stringify(await p.evaluate(SNAP)));
  await p.evaluate(installCapsule, CAP);
  console.log('== 注入后(tick前):', JSON.stringify(await p.evaluate(SNAP)));
  for (let i = 1; i <= 5; i++) {
    await p.evaluate(() => window.__regTick());
    await p.waitForTimeout(650);
    console.log(`== tick${i}:`, JSON.stringify(await p.evaluate(SNAP)));
  }
  await b.close();
})().catch((e) => { console.error('失败:', e); process.exit(1); });
