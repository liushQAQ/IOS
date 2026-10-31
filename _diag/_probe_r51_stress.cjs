// R51c: 真身 shim + 真实会话 + 开合循环压测 —— 抓「页面太靠左」的载体
const path = require('path');
const { webkit } = require('playwright');
const W = 430, H = 932;
const INJECT = path.join(__dirname, 'app_inject.js');

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.evaluate(() => {
    window.__dshNativeStatusBar = 59; window.__dshTopShift = 18;
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-topshift', '18px');
    const b = document.querySelector('.cm-peak-alert-actions button'); if (b) b.click();
  });
  await p.addScriptTag({ path: INJECT });
  await p.waitForTimeout(1500);

  // 进真实会话（真机路径：开左抽屉→点会话）
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"], [aria-label="打开侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(1200);
  const picked = await p.evaluate(() => {
    const items = document.querySelectorAll('[role="listbox"] [role="option"], [class*="sessionList"] [class*="item"], [class*="session"] button[role="listitem"]');
    let el = items[0] || null;
    if (!el) {
      const cands = Array.from(document.querySelectorAll('button, [role="button"], li')).filter(e => /同步DSH|微信|API|session/i.test(e.textContent || '') && e.getBoundingClientRect().width > 100);
      el = cands[0] || null;
    }
    if (el) { el.click(); return (el.textContent || '').slice(0, 30); }
    return null;
  });
  await p.waitForTimeout(3000);
  console.log('picked session:', picked);

  // 流式扰动：后台持续小 churn（模拟流式输出触发 observer）
  await p.evaluate(() => {
    const t = document.createElement('span'); t.id = '__r51churn'; (document.body || document.documentElement).appendChild(t);
    let i = 0; window.__churnT = setInterval(() => { t.textContent = 'c' + (i++); t.setAttribute('data-i', String(i)); }, 280);
  });

  const snap = label => p.evaluate(l => {
    const vw = innerWidth;
    const g = s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left * 10) / 10, Math.round(r.right * 10) / 10, Math.round(r.top), Math.round(r.width)]; };
    const col = document.querySelector('[class*="rightbarCol"]');
    const panel = document.querySelector('[data-sidebar-right-open], .dMHGga_panel');
    // 抽屉内最左可见大块
    let worstL = null;
    if (panel) {
      panel.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > 80 && r.height > 40 && r.left < -2 && getComputedStyle(el).position !== 'fixed') {
          if (!worstL || r.left < worstL.left) worstL = { cls: String(el.className).slice(0, 46), left: Math.round(r.left), w: Math.round(r.width), sl: el.scrollLeft, tf: el.style.transform || undefined };
        }
      });
    }
    // 主会话页 frame（抽屉开着时它应该被盖住，不该移位）
    const main = g('[data-mobile-nav="frame"]') || g('[class*="centerCol"]');
    return {
      label: l, vw,
      col: g('[class*="rightbarCol"]'), colTf: col ? (col.style.transform || 'css') : null,
      panel: g('[data-sidebar-right-open], .dMHGga_panel'), panelTf: panel ? (panel.style.transform || 'css') : null,
      main, worstL,
      bleedN: window.__dshBleedN,
    };
  }, label);

  console.log('S0 会话页基线:', JSON.stringify(await snap('S0')));

  for (let i = 1; i <= 8; i++) {
    await p.evaluate(() => { const b = document.querySelector('button[aria-label="打开右侧边栏"], [data-sidebar-right-toggle]'); if (b) b.click(); });
    await p.waitForTimeout(1700);
    const o = await snap('open#' + i);
    console.log('开#' + i + ':', JSON.stringify(o));
    await p.evaluate(() => { const c = document.querySelector('button[aria-label="收起右侧边栏"], [data-sidebar-right-toggle]'); if (c) c.click(); });
    await p.waitForTimeout(1300);
  }
  const f = await snap('final');
  console.log('收#8后:', JSON.stringify(f));
  await p.evaluate(() => { clearInterval(window.__churnT); const t = document.getElementById('__r51churn'); if (t) t.remove(); });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
