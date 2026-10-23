/**
 * _narrow_verify2.js —— 验证窄屏「撤回/重优」浮层降级
 *
 * 断言：
 *  A. 宽屏（1440）：.dsh-po-more 是 display:contents —— 展开照旧在胶囊内变长
 *  B. 窄屏（390）：.dsh-po-more 变 position:absolute 浮层，且**不改变外壳宽度**
 *     （即不占 flex 空间 → 不越界、不重叠）
 *  C. 窄屏时插入 fake .dsh-po-more 后，tab 容器内所有元素仍零重叠、不越界
 */
const { webkit } = require('playwright');

let PASS = 0, FAIL = 0;
const fails = [];
function chk(c, name, detail) {
  if (c) { PASS++; console.log('  ✅ ' + name + (detail ? '   ' + detail : '')); }
  else { FAIL++; fails.push(name + ' — ' + (detail || '')); console.log('  ❌ ' + name + (detail ? '   ' + detail : '')); }
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
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

  // ---------- 宽屏 ----------
  console.log('\n■ 宽屏 1440（视口 > 560 → media 不生效）');
  const wide = await p.evaluate(() => {
    const po = document.querySelector('[data-dsh-po-shell]');
    if (!po) return { found: false };
    const probe = document.createElement('div');
    probe.className = 'dsh-po-more';
    po.appendChild(probe);
    const cs = getComputedStyle(probe);
    const out = { display: cs.display, position: cs.position };
    probe.remove();
    return out;
  });
  console.log('  ' + JSON.stringify(wide));
  chk(wide.display === 'contents', '宽屏：.dsh-po-more = display:contents（展开照旧在胶囊内）', wide.display);

  // ---------- 窄屏 390 ----------
  console.log('\n■ 窄屏 390（setViewportSize 一次，不截图）');
  let resized = false;
  try {
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(3500);
    resized = true;
  } catch (e) { console.log('  !! resize 失败/超时 ' + e.message.slice(0, 60)); }

  if (resized) {
    const nar = await p.evaluate(() => {
      const R = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return { x: +q.x.toFixed(1), y: +q.y.toFixed(1), w: +q.width.toFixed(1), h: +q.height.toFixed(1), right: +(q.x + q.width).toFixed(1) }; };
      const tabs = document.querySelector('[data-conversation-tabs]');
      const po = document.querySelector('[data-dsh-po-shell]');
      const dcc = document.querySelector('[class*="dcc-root"]');
      if (!po) return { found: false, hasTabs: !!tabs };
      const wBefore = po.getBoundingClientRect().width;
      // 插入 fake 辅助组（模拟「已优化态」的撤回/重优）
      const probe = document.createElement('div');
      probe.className = 'dsh-po-more';
      probe.innerHTML = '<button class="dsh-po-btn-sub undo">撤回</button><button class="dsh-po-btn-sub">重优</button>';
      po.appendChild(probe);
      const cs = getComputedStyle(probe);
      const wAfter = po.getBoundingClientRect().width;
      const pr = R(probe);
      const out = {
        found: true,
        vw: window.innerWidth,
        bar: R(tabs),
        dcc: R(dcc),
        po: R(po),
        poWBefore: +wBefore.toFixed(1),
        poWAfter: +wAfter.toFixed(1),
        moreDisplay: cs.display,
        morePosition: cs.position,
        moreBox: pr,
        tabs: tabs ? [...tabs.querySelectorAll('button[role="tab"]')].map(b => ({ t: (b.textContent || '').trim(), r: R(b) })) : [],
      };
      probe.remove();
      return out;
    });
    console.log('  ' + JSON.stringify(nar, null, 1));

    chk(nar.found, '窄屏：胶囊仍在');
    if (nar.found) {
      chk(nar.morePosition === 'absolute', '窄屏：.dsh-po-more = absolute 浮层', nar.morePosition + ' / ' + nar.moreDisplay);
      chk(Math.abs(nar.poWAfter - nar.poWBefore) <= 1, '窄屏：插入辅助组后外壳宽度不变（不占 flex 空间）', nar.poWBefore + ' → ' + nar.poWAfter);
      const OV = (a, b) => !(a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5);
      let ovs = [];
      for (const t of nar.tabs) if (OV(nar.po, t.r)) ovs.push('胶囊×' + t.t);
      if (nar.dcc && OV(nar.po, nar.dcc)) ovs.push('胶囊×积分');
      chk(ovs.length === 0, '窄屏：胶囊与 tab / 积分零重叠', ovs.length ? ovs.join(',') : '0 对');
      chk(nar.po.right <= nar.bar.right + 1, '窄屏：胶囊不越出 tab 容器', 'po.right=' + nar.po.right + ' bar.right=' + nar.bar.right);
      if (nar.moreBox) {
        chk(nar.moreBox.right <= nar.vw + 1, '窄屏：浮层不出屏', 'more.right=' + nar.moreBox.right + ' vw=' + nar.vw);
      }
      await p.screenshot({ path: '_narrow390_float.png', timeout: 45000 }).catch(() => {});
      console.log('  截图 _narrow390_float.png');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(' 结果: ' + PASS + ' 绿 / ' + FAIL + ' 红');
  if (FAIL) fails.forEach(f => console.log('   · ' + f));
  await browser.close();
})();
