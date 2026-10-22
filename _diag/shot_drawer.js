const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const DRAWER_W = 252;
const which = process.argv[2] === 'old' ? 'old' : 'new';
const cssFile = which === 'old' ? 'app_inject_old.css' : 'app_inject.css';
const APP_CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/' + cssFile, 'utf8');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({
    viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark',
  });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);

  await p.evaluate(({ css }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const s = document.createElement('style'); s.id = '__app_css'; s.textContent = css;
    document.head.appendChild(s);
  }, { css: APP_CSS });
  await p.waitForTimeout(400);

  const clampDrawer = (W) => {
    document.querySelectorAll('[class*="sidebarCol"], .CZPbNW_sidebarCol').forEach(el => {
      el.style.setProperty('width', W + 'px', 'important');
      el.style.setProperty('min-width', W + 'px', 'important');
      el.style.setProperty('max-width', W + 'px', 'important');
    });
  };
  await p.evaluate(clampDrawer, DRAWER_W);

  await p.evaluate(() => {
    const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]');
    if (x) x.click();
  });
  await p.waitForTimeout(1800);
  await p.evaluate(clampDrawer, DRAWER_W);
  await p.waitForTimeout(1200);

  const m = await p.evaluate(() => {
    const sb = document.querySelector('[class*="sidebarCol"]');
    const sq = sb.getBoundingClientRect();
    let n = 0, worst = 0;
    sb.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const q = el.getBoundingClientRect();
      if (q.width < 6 || q.height < 6) return;
      const ov = q.right - sq.right;
      if (ov > 0.5) { n++; if (ov > worst) worst = ov; }
    });
    const g = document.querySelector('button[aria-label="设置"]');
    const gq = g ? g.getBoundingClientRect() : null;
    return {
      drawerRight: Math.round(sq.right), overflowCount: n, worst: Math.round(worst * 10) / 10,
      gear: gq ? { x: Math.round(gq.x), right: Math.round(gq.right), inside: gq.right <= sq.right + 0.5 } : null,
    };
  });
  console.log(which.toUpperCase() + '  ' + JSON.stringify(m));

  await p.screenshot({ path: 'shot_' + which + '_430.png' });
  await b.close();
})();
