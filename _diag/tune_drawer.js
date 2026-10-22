const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const BASE = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject_old.css', 'utf8');
const W = 252;

const V1 = `
[class*="sidebarCol"] * { max-width: 100% !important; box-sizing: border-box !important; }
[class*="sidebarCol"] [class*="root"], [class*="sidebarCol"] [class*="Area"],
[class*="sidebarCol"] [class*="List"], [class*="sidebarCol"] [class*="list"],
[class*="sidebarCol"] [class*="Section"], [class*="sidebarCol"] [class*="Row"],
[class*="sidebarCol"] [class*="row"], [class*="sidebarCol"] [class*="Body"] { min-width: 0 !important; }
[class*="sidebarCol"] [class*="sessionRow"], [class*="sidebarCol"] [class*="projectRow"] {
  min-width: 0 !important; overflow: hidden !important; white-space: nowrap !important;
}
[class*="sidebarCol"] [class*="sessionRow"] *, [class*="sidebarCol"] [class*="projectRow"] * {
  min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important;
}
[class*="sidebarCol"] [class*="label"], [class*="sidebarCol"] [class*="Label"],
[class*="sidebarCol"] [class*="title"], [class*="sidebarCol"] [class*="ooter"] {
  min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important;
}
[class*="sidebarCol"] .cm-footer-stack, [class*="sidebarCol"] .cm-peak-progress, [class*="sidebarCol"] .cm-foot {
  width: 100% !important; max-width: 100% !important; min-width: 0 !important; overflow: hidden !important;
}
[class*="sidebarCol"] .cm-peak-rail-label { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
`;

// V2：在 V1 基础上，强制会话行填满抽屉；时间列不许被压
const V2 = V1 + `
[class*="sidebarCol"] [class*="sessionRow"],
[class*="sidebarCol"] [class*="projectRow"],
[class*="sidebarCol"] [class*="groupSection"],
[class*="sidebarCol"] [class*="treeBody"],
[class*="sidebarCol"] [class*="listArea"] {
  width: 100% !important;
}
[class*="sidebarCol"] [class*="time"] { flex: 0 0 auto !important; }
`;

async function run(b, name, extra) {
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);
  await p.evaluate(({ css, ex }) => {
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    if (ex) { const t = document.createElement('style'); t.textContent = ex; document.head.appendChild(t); }
    document.querySelectorAll('[class*="sidebarCol"]').forEach(el => {
      el.style.setProperty('width', '252px', 'important');
      el.style.setProperty('min-width', '252px', 'important');
      el.style.setProperty('max-width', '252px', 'important');
    });
  }, { css: BASE, ex: extra });
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(2200);
  await p.evaluate(() => {
    document.querySelectorAll('[class*="sidebarCol"]').forEach(el => {
      el.style.setProperty('width', '252px', 'important');
      el.style.setProperty('min-width', '252px', 'important');
      el.style.setProperty('max-width', '252px', 'important');
    });
  });
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
    const rows = [...sb.querySelectorAll('[class*="sessionRow"]')];
    const times = [];
    sb.querySelectorAll('[class*="time"]').forEach(el => {
      const t = (el.textContent || '').trim();
      const q = el.getBoundingClientRect();
      if (q.width < 4) return;
      times.push({ t, x: Math.round(q.x), right: Math.round(q.right), w: Math.round(q.width) });
    });
    return {
      drawerRight: Math.round(sq.right), ov, worst: Math.round(worst * 10) / 10,
      rowCount: rows.length, rowWidths: rows.slice(0, 6).map(r => Math.round(r.getBoundingClientRect().width)),
      times: times.slice(0, 8),
    };
  });
  console.log('\n--- ' + name + ' ---');
  console.log('溢出=' + m.ov + ' 最大=' + m.worst + '  抽屉右=' + m.drawerRight);
  console.log('会话行数=' + m.rowCount + ' 行宽=' + JSON.stringify(m.rowWidths));
  console.log('时间=' + JSON.stringify(m.times));
  await p.screenshot({ path: 'shot_' + name + '.png' });
  await c.close();
}

(async () => {
  const b = await webkit.launch({ headless: true });
  await run(b, 'v1', V1);
  await run(b, 'v2', V2);
  await b.close();
})();
