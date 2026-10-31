// R51 探针：右抽屉打开后「页面左右偏移（太靠左出屏）」复现 + 会话框「回退按钮」身份排查
// 用法: node _probe_r51_drawer.cjs [viewportWidth]
const path = require('path');
const fs = require('fs');
const { chromium, webkit } = require('playwright');

const W = parseInt(process.argv[2] || '430', 10);
const H = parseInt(process.argv[3] || '932', 10);
const OUT = __dirname;

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6000);

  // 关掉可能的公告弹窗（费用插件）
  await p.evaluate(() => { const b = document.querySelector('.cm-peak-alert-actions button'); if (b) b.click(); }).catch(() => {});

  const shot0 = path.join(OUT, `_r51_home_${W}.png`);
  await p.screenshot({ path: shot0 });

  // —— 打开右抽屉（模拟真机长滑路径：点官方按钮）——
  const opened = await p.evaluate(() => {
    const b = document.querySelector('header button[aria-label="打开右侧边栏"], button[aria-label="打开右侧边栏"], [data-sidebar-right-expand="true"], [data-sidebar-right-toggle]');
    if (b) { b.click(); return b.getAttribute('aria-label'); }
    return null;
  });
  await p.waitForTimeout(2500);
  const shot1 = path.join(OUT, `_r51_drawer_${W}.png`);
  await p.screenshot({ path: shot1 });

  // —— 全页横向偏移体检 ——
  const audit = await p.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const out = { vw, vh, docSW: document.documentElement.scrollWidth, offenders: [], panel: null, panels: [] };
    const vis = el => { const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none'; };
    // 1) 抽屉面板本体（各种可能形态）
    const cand = document.querySelectorAll('[data-sidebar-right-open],[class*="sidebarRight"],[class*="dMHGga_panel"],aside[class*="panel"],div[class*="rightPanel"]');
    cand.forEach(el => {
      const r = el.getBoundingClientRect();
      out.panels.push({ sel: el.tagName + '.' + String(el.className).slice(0, 60), rect: [r.left, r.top, r.width, r.height].map(v => Math.round(v)), tf: el.style.transform || null, inline: (el.getAttribute('style') || '').slice(0, 200) });
    });
    // 2) 全页扫描：左缘 < -2 的可见块（=太靠左出屏）
    const els = document.querySelectorAll('body *');
    let n = 0;
    for (const el of els) {
      if (++n > 4000) break;
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < -2 && r.width > 40) {
        // 找最近的"大面积"责任元素（避免报一堆子文本）
        const parent = el.parentElement;
        if (parent && vis(parent) && parent.getBoundingClientRect().left < -2 && parent.getBoundingClientRect().width > 40) continue; // 父也越界则只报父
        out.offenders.push({ tag: el.tagName, cls: String(el.className).slice(0, 80), rect: [r.left, r.top, r.width, r.height].map(v => Math.round(v)), tf: el.style.transform || getComputedStyle(el).transform !== 'none' ? (el.style.transform || '') : '' });
        if (out.offenders.length >= 25) break;
      }
    }
    // 3) 主会话列/根容器位置（对照抽屉开合前）
    const main = document.querySelector('[data-mobile-nav="frame"],[class*="centerCol"],main,#root>div');
    if (main) { const r = main.getBoundingClientRect(); out.main = [r.left, r.top, r.width, r.height].map(v => Math.round(v)); }
    return out;
  });

  // —— 会话框「回退按钮」身份排查：枚举 composer 区所有按钮 ——
  const composerBtns = await p.evaluate(() => {
    const out = [];
    const card = document.querySelector('[class*="composerStack"]');
    if (!card) return { found: false, btns: [] };
    card.querySelectorAll('button, [role="button"], a').forEach(b => {
      const r = b.getBoundingClientRect();
      out.push({ label: b.getAttribute('aria-label') || b.title || (b.textContent || '').trim().slice(0, 24), cls: String(b.className).slice(0, 70), rect: [r.left, r.top, r.width, r.height].map(v => Math.round(v)), html: b.outerHTML.slice(0, 220) });
    });
    return { found: true, btns: out };
  });

  // 顶部 header 区按钮（可能「回退」在页面顶上）
  const headerBtns = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('header button, [data-mobile-nav] button, [role="tablist"] button').forEach(b => {
      const r = b.getBoundingClientRect();
      out.push({ label: b.getAttribute('aria-label') || b.title || (b.textContent || '').trim().slice(0, 24), cls: String(b.className).slice(0, 60), rect: [r.left, r.top, r.width, r.height].map(v => Math.round(v)) });
    });
    return out;
  });

  console.log(JSON.stringify({ W, opened, audit, composerBtns, headerBtns, errors: errors.slice(0, 5) }, null, 1));

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
