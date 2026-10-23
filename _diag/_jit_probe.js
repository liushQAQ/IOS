/**
 * _jit_probe.js —— 抓「切换会话/上滑时整体错位几秒再跳回」的时间序列
 *
 * 思路：沙箱裸页没有 App 的注入层，所以先把 _diag/app_inject.js（从 Swift 提取的真身）
 * 注进去，再模拟原生状态栏变量，然后切换会话并每 120ms 采样：
 *   centerCol 的内联 margin-top / rect.top / header.rect.top / crumbs.right / --dsh-head-right
 * 只要看到 margin-top「被清空 → 位置跳到自然值 → 又写回」的序列，即证实事后校正造成跳变。
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const SHIM = fs.readFileSync(path.join(__dirname, 'app_inject.js'), 'utf8');
const W = Number(process.argv[2] || 393);
const H = Number(process.argv[3] || 852);

const SAMPLE = `(() => {
  const col = document.querySelector('[class*="centerCol"]');
  const hdr = document.querySelector('[data-phase] header') || document.querySelector('[class*="_header"]');
  const crumbs = document.querySelector('[data-phase] header [class*="crumbs"]') || document.querySelector('[class*="crumbs"]');
  const R = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return Math.round(b.top * 10) / 10; };
  return {
    t: Math.round(performance.now()),
    mt: col ? (col.style.getPropertyValue('margin-top') || '-') : 'no-col',
    colTop: R(col),
    hdrTop: R(hdr),
    crumbRight: crumbs ? getComputedStyle(crumbs).right : '-',
    crumbW: crumbs ? Math.round(crumbs.getBoundingClientRect().width) : -1,
    headRight: getComputedStyle(document.documentElement).getPropertyValue('--dsh-head-right').trim() || '-',
    tabsY: R(document.querySelector('[data-conversation-tabs]')),
    scrollY: Math.round(window.scrollY),
  };
})()`;

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});

  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);

  // 模拟 iOS 原生下发（shim 依赖这两个）
  await p.evaluate(() => {
    window.__dshNativeStatusBar = 47;
    window.__dshTopShift = 18;
    document.documentElement.style.setProperty('--dsh-sb-native', '47px');
  });

  try {
    await p.addScriptTag({ content: SHIM });
    console.log('✅ shim 注入完成');
  } catch (e) {
    console.log('❌ shim 注入失败: ' + e.message);
  }
  await p.waitForTimeout(3000);

  console.log('基线(hero): ' + JSON.stringify(await p.evaluate(SAMPLE)));

  // 进会话态：移动布局先点抽屉
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => { const r = x.getBoundingClientRect(); return r.x < 60 && r.y < 70 && r.width > 0; });
    if (b) b.click();
  });
  await p.waitForTimeout(1600);
  await p.evaluate(() => { [...document.querySelectorAll('[class*="projectRow"]')].forEach((r) => { try { r.click(); } catch (e) {} }); });
  await p.waitForTimeout(2200);
  const enter = await p.evaluate(() => {
    const a = [...document.querySelectorAll('[class*="sessionRow"]')];
    const t = a.find((r) => !/新会话|新建会话/.test((r.innerText || '').trim()));
    if (!t) return null;
    const name = (t.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 16);
    t.setAttribute('data-jit-target', '1');
    t.click();
    return name;
  });
  console.log('进入会话: ' + enter);
  await p.waitForTimeout(9000);
  console.log('基线(会话态): ' + JSON.stringify(await p.evaluate(SAMPLE)));

  const clicked = '进入会话';
  console.log('点击: ' + clicked);

  const rows = [];
  for (let i = 0; i < 45; i++) {
    rows.push(await p.evaluate(SAMPLE));
    await p.waitForTimeout(120);
  }

  const last = rows[rows.length - 1];
  // ===== 追加：滚动会话内容区（老总说的「上滑」）=====
  const scroller = await p.evaluate(() => {
    const s = document.querySelector('[data-conversation-scroll]');
    if (s) { s.scrollTop = 600; return 'scroll'; }
    window.scrollTo(0, 300); return 'window';
  });
  const scrollRows = [];
  for (let i = 0; i < 20; i++) { scrollRows.push(await p.evaluate(SAMPLE)); await p.waitForTimeout(100); }
  console.log('\n--- 上滑后采样（' + scroller + '）---');
  scrollRows.forEach((r) => console.log('  ' + String(r.t).padStart(6) + ' mt=' + String(r.mt).padStart(9) + ' colTop=' + String(r.colTop).padStart(6) + ' hdrTop=' + String(r.hdrTop).padStart(6) + ' tabsY=' + String(r.tabsY).padStart(6) + ' scrollY=' + r.scrollY));

  console.log('\n  t      mt        colTop  hdrTop  tabsY   crumbW  right   headRight');
  rows.forEach((r) => {
    const mark = (r.mt !== last.mt) ? ' ←' : '';
    console.log('  ' + String(r.t).padStart(6) + '  ' + String(r.mt).padStart(9) + '  '
      + String(r.colTop).padStart(6) + '  ' + String(r.hdrTop).padStart(6) + '  '
      + String(r.tabsY).padStart(6) + '  ' + String(r.crumbW).padStart(6) + '  '
      + String(r.crumbRight).padStart(7) + '  ' + String(r.headRight).padStart(9) + mark);
  });

  const distinct = [...new Set(rows.map((r) => r.mt))];
  const topRange = [Math.min(...rows.map((r) => r.colTop)), Math.max(...rows.map((r) => r.colTop))];
  console.log('\n=== 结论 ===');
  console.log('margin-top 出现过的值: ' + JSON.stringify(distinct));
  console.log('centerCol.top 波动范围: ' + topRange[0] + ' ~ ' + topRange[1] + '（差 ' + Math.round((topRange[1] - topRange[0]) * 10) / 10 + 'px）');
  if (distinct.length > 1) console.log('⚠️ 采样期间 margin-top 变过 ' + distinct.length + ' 种值 → 事后校正会在过渡态产生位移');
  else console.log('本次采样未见 margin-top 跳变');

  await browser.close();
})();
