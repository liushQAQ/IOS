/**
 * _tabbar_align.js —— 量 tab 文字与胶囊的视觉中线偏差，并截图
 *
 * 老总 2026-10-23 12:48：「轨迹 系统监控 Loomy 不在一个水平高度，你截图看看」
 *   tab 按钮 CSS：padding: 0 0 9px（底部 9px 是给选中下划线留的），
 *   所以按钮**文字**的中心在按钮顶部 +8px，而不是按钮几何中心。
 *   胶囊是整元素居中 → 视觉上就会比 tab 文字低几像素。
 */
const { webkit } = require('playwright');

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);
  await p.evaluate(() => { [...document.querySelectorAll('[class*="projectRow"]')].forEach(r => { try { r.click(); } catch (e) {} }); });
  await p.waitForTimeout(2200);
  await p.evaluate(() => {
    const all = [...document.querySelectorAll('[class*="sessionRow"]')];
    const t = all.find(r => { const x = (r.innerText || '').trim(); return x && !/新会话/.test(x); }) || all[0];
    if (t) t.click();
  });
  await p.waitForTimeout(9000);

  const r = await p.evaluate(() => {
    const R = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return { x: +q.x.toFixed(1), y: +q.y.toFixed(1), w: +q.width.toFixed(1), h: +q.height.toFixed(1), cy: +(q.y + q.height / 2).toFixed(2) }; };
    // 取元素内「文字」的几何（第一个文本节点的 Range）
    const textRect = (el) => {
      if (!el) return null;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.nodeValue || !n.nodeValue.trim()) continue;
        const rg = document.createRange();
        rg.selectNodeContents(n);
        const q = rg.getBoundingClientRect();
        if (q.width < 1) continue;
        return { x: +q.x.toFixed(1), y: +q.y.toFixed(1), w: +q.width.toFixed(1), h: +q.height.toFixed(1), cy: +(q.y + q.height / 2).toFixed(2), txt: n.nodeValue.trim().slice(0, 12) };
      }
      return null;
    };
    const tabs = document.querySelector('[data-conversation-tabs]');
    const out = { tabBar: R(tabs), tabs: [], caps: [] };
    if (tabs) {
      for (const b of tabs.querySelectorAll('button[role="tab"]')) {
        const cs = getComputedStyle(b);
        out.tabs.push({
          label: (b.textContent || '').trim(),
          box: R(b),
          text: textRect(b),
          pad: cs.padding,
          fs: cs.fontSize + '/' + cs.lineHeight,
          alignSelf: cs.alignSelf,
        });
      }
    }
    const dcc = document.querySelector('[class*="dcc-root"]');
    const po = document.querySelector('[data-dsh-po-shell]');
    for (const [nm, el] of [['积分', dcc], ['优化', po]]) {
      if (!el) continue;
      const cs = getComputedStyle(el);
      out.caps.push({ name: nm, box: R(el), text: textRect(el), alignSelf: cs.alignSelf, order: cs.order, mt: cs.marginTop, mb: cs.marginBottom });
    }
    return out;
  });

  console.log(JSON.stringify(r, null, 1));

  // 偏差汇总
  const t = r.tabs[0];
  const ref = t && t.text ? t.text.cy : (t ? t.box.cy : null);
  console.log('\n【视觉中线基准】tab 文字中心 cy = ' + ref + '（tab 按钮几何中心 = ' + (t ? t.box.cy : '?') + '）');
  for (const c of r.caps) {
    const cc = c.text ? c.text.cy : c.box.cy;
    console.log('  ' + c.name + '：中心 cy=' + cc + '  偏差 = ' + (cc - ref).toFixed(2) + 'px（正=偏低）');
  }

  // 截图：tab 栏 + 上下留白
  const bar = r.tabBar;
  if (bar) {
    await p.screenshot({
      path: '_tabbar_align.png',
      clip: { x: Math.max(0, bar.x - 6), y: Math.max(0, bar.y - 18), width: Math.min(560, 1440 - bar.x), height: bar.h + 40 },
      timeout: 60000,
    }).catch(e => console.log('截图失败 ' + e.message.slice(0, 60)));
    console.log('截图 _tabbar_align.png');
  }
  await browser.close();
})();
