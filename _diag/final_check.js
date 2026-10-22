const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const CSS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.css', 'utf8');
const SIZES = [{ w: 430, h: 932 }, { w: 393, h: 852 }, { w: 375, h: 667 }];

(async () => {
  const b = await webkit.launch({ headless: true });
  for (const S of SIZES) {
    const c = await b.newContext({ viewport: { width: S.w, height: S.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(8000);
    const W = Math.round(252 * S.w / 430);
    await p.evaluate(({ css, w }) => {
      document.documentElement.style.setProperty('--dsh-statusbar', '59px');
      document.documentElement.style.setProperty('--dsh-topshift', '18px');
      const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
      document.querySelectorAll('[class*="sidebarCol"]').forEach(el => {
        el.style.setProperty('width', w + 'px', 'important');
        el.style.setProperty('min-width', w + 'px', 'important');
        el.style.setProperty('max-width', w + 'px', 'important');
      });
    }, { css: CSS, w: W });
    await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
    await p.waitForTimeout(2200);
    await p.evaluate((w) => {
      document.querySelectorAll('[class*="sidebarCol"]').forEach(el => {
        el.style.setProperty('width', w + 'px', 'important');
        el.style.setProperty('min-width', w + 'px', 'important');
        el.style.setProperty('max-width', w + 'px', 'important');
      });
    }, W);
    await p.waitForTimeout(900);

    const m = await p.evaluate(() => {
      const sb = document.querySelector('[class*="sidebarCol"]');
      const sq = sb.getBoundingClientRect();
      let ov = 0, worst = 0;
      sb.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const q = el.getBoundingClientRect();
        if (q.width < 6 || q.height < 6) return;
        const d = q.right - sq.right;
        if (d > 0.5) { ov++; if (d > worst) worst = d; }
      });
      const g = document.querySelector('button[aria-label="设置"]');
      const gq = g ? g.getBoundingClientRect() : null;
      const docSW = document.documentElement.scrollWidth;
      return {
        drawerW: Math.round(sq.width), drawerRight: Math.round(sq.right), ov,
        worst: Math.round(worst * 10) / 10,
        gearInside: gq ? gq.right <= sq.right + 0.5 && gq.left >= sq.left : null,
        gear: gq ? { x: Math.round(gq.x), right: Math.round(gq.right) } : null,
        docSW, vw: innerWidth,
      };
    });
    console.log('[' + S.w + 'x' + S.h + '] 抽屉=' + m.drawerW + ' 右界=' + m.drawerRight +
      ' 溢出元素=' + m.ov + ' 最大越界=' + m.worst + ' 齿轮在抽屉内=' + m.gearInside +
      ' 齿轮=' + JSON.stringify(m.gear) + ' doc=' + m.docSW + '/' + m.vw);
    await p.screenshot({ path: 'final_' + S.w + '.png' });
    await c.close();
  }
  await b.close();
})();
