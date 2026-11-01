// R57: 抽屉打开全程 40ms 高频采样 —— 抓「顶栏微微下移」的哪一步在动、动的是什么属性
const path = require('path');
const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { try { localStorage.setItem('dsh-purge-user-notice-v1', '1'); localStorage.setItem('dsh-purge-drill-auth', '1'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  await p.evaluate(() => { window.__dshNativeStatusBar = 59; window.__dshTopShift = 18; document.documentElement.style.setProperty('--dsh-sb-native', '59px'); document.documentElement.style.setProperty('--dsh-topshift', '18px'); });
  await p.addScriptTag({ path: path.join(__dirname, 'app_inject.js') });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const x = document.querySelector('[aria-label="打开侧边栏"]') || document.querySelector('[aria-label="打开左侧侧边栏"]'); if (x) x.click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[class*="sessionRow"]'));
    const t = rows.find(e => (e.textContent || '').indexOf('同步DSH') >= 0) || rows[1] || rows[0];
    if (t) t.click();
  });
  await p.waitForTimeout(5000);

  // 高频采样：开抽屉瞬间起 2.4s 内每 40ms 记录顶栏元素 top / 行内样式关键项
  const report = await p.evaluate(async () => {
    const toggle = () => document.querySelector('[data-sidebar-right-toggle], header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
    const t0 = toggle(); if (!t0) return { noToggle: true };
    const samples = [];
    const grab = () => {
      const col = document.querySelector('[class*="rightbarCol"]');
      const hdr = document.querySelector('[class*="tabHostHeader"]');
      const strip = document.querySelector('[class*="tabStrip"], [data-dockkit-strip]');
      const chrome = document.querySelector('[class*="stripChrome"]');
      const o = { t: Date.now() };
      if (col) { const r = col.getBoundingClientRect(); o.col = [Math.round(r.top), Math.round(r.left)]; o.colPT = col.style.paddingTop || getComputedStyle(col).paddingTop; }
      if (hdr) { const r = hdr.getBoundingClientRect(); o.hdr = Math.round(r.top * 10) / 10; o.hdrMt = hdr.style.marginTop || '-'; o.hdrPull = hdr.getAttribute('data-dsh-strip-pull-n') || '-'; }
      if (strip) { const r = strip.getBoundingClientRect(); o.strip = Math.round(r.top * 10) / 10; }
      if (chrome) { const r = chrome.getBoundingClientRect(); o.chrome = Math.round(r.top * 10) / 10; o.chromeTf = chrome.style.transform || '-'; }
      return o;
    };
    // 先关（若开着）
    const col0 = document.querySelector('[class*="rightbarCol"]');
    if (col0 && col0.getBoundingClientRect().left < innerWidth / 2) { t0.click(); await new Promise(r => setTimeout(r, 1300)); }
    // 开 + 采样
    const start = Date.now();
    toggle().click();
    while (Date.now() - start < 2600) {
      samples.push(grab());
      await new Promise(r => setTimeout(r, 40));
    }
    // 汇总：哪些字段出现过 ≥2px 的变化
    const fields = {};
    for (const s of samples) {
      for (const k of Object.keys(s)) {
        if (k === 't') continue;
        const v = s[k];
        if (typeof v === 'number') (fields[k] = fields[k] || new Set()).add(v);
      }
    }
    const changed = {};
    for (const k of Object.keys(fields)) {
      const vals = Array.from(fields[k]);
      if (vals.length > 1) {
        const min = Math.min(...vals), max = Math.max(...vals);
        if (max - min >= 2) changed[k] = { min, max, delta: Math.round((max - min) * 10) / 10, count: vals.length };
      }
    }
    // 关键时刻序列（hdr/strip 变化的前 3 拍）
    const seq = [];
    let prev = {};
    for (const s of samples) {
      const key = JSON.stringify([s.hdr, s.strip, s.chrome, s.col, s.colPT]);
      if (key !== prev.key) { seq.push({ dt: s.t - start, ...s }); prev.key = key; }
      if (seq.length > 14) break;
    }
    return { changed, seq, n: samples.length };
  });
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
