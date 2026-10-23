/**
 * _narrow_check.js —— ① 窄屏压缩下 tab 栏胶囊不重叠校验 ② 会话框是否恢复原生
 *
 * 做法：不在 Playwright 里 resize 视口（DSH 窄视口重排会卡死），
 *      改为在 1440 会话态下**把 tab 容器宽度压到手机宽度**，
 *      这只影响 flex 分配，等价于「实际屏幕压缩」时 tab 栏的可用宽度。
 *
 * 断言：
 *  A. 各压缩档下，积分胶囊 / 优化胶囊 / tab 按钮 两两零重叠
 *  B. 胶囊不超出 tab 容器右界、不超出视口
 *  C. 优化胶囊展开（238px）后仍不与积分胶囊重叠
 *  D. 会话框内零插件元素；原生按钮零 inline position/transform
 */
const { webkit } = require('playwright');

const WIDTHS = [430, 390, 375, 320];
let PASS = 0, FAIL = 0;
const fails = [];
function chk(c, name, detail) {
  if (c) { PASS++; console.log('  ✅ ' + name + (detail ? '   ' + detail : '')); }
  else { FAIL++; fails.push(name + ' — ' + (detail || '')); console.log('  ❌ ' + name + (detail ? '   ' + detail : '')); }
}
const OV = (a, b) => !(a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5);

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);
  await p.evaluate(() => { [...document.querySelectorAll('[class*="projectRow"]')].forEach(r => { try { r.click(); } catch (e) {} }); });
  await p.waitForTimeout(2200);
  const picked = await p.evaluate(() => {
    const all = [...document.querySelectorAll('[class*="sessionRow"]')];
    const t = all.find(r => { const x = (r.innerText || '').trim(); return x && !/新会话/.test(x); }) || all[0];
    if (!t) return null; t.click(); return (t.innerText || '').trim().slice(0, 24);
  });
  await p.waitForTimeout(9000);
  console.log('会话: ' + picked);

  /* ============ ② 会话框是否恢复原生（先查，压缩会改几何但不改归属）============ */
  console.log('\n===== ② 会话框原生性 =====');
  const nat = await p.evaluate(() => {
    const card = document.querySelector('[class*="composerStack"]');
    if (!card) return { found: false };
    const R = (e) => { const q = e.getBoundingClientRect(); return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) }; };
    const PLUGIN_RE = /dcc-|dsh-po|cm-stat|cm-bbox/;
    const btns = [];
    card.querySelectorAll('button, [role="button"]').forEach(b => {
      const cs = getComputedStyle(b);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const q = b.getBoundingClientRect();
      if (q.width < 14 || q.height < 8) return;
      let isPlugin = false, cur = b;
      for (let d = 0; d < 4 && cur; d++) {
        if (PLUGIN_RE.test(String(cur.className || ''))) { isPlugin = true; break; }
        cur = cur.parentElement;
      }
      const st = b.style;
      btns.push({
        label: (b.getAttribute('aria-label') || (b.textContent || '').replace(/\s+/g, ' ').trim() || '?').slice(0, 16),
        box: R(b),
        plugin: isPlugin,
        inlinePos: st.getPropertyValue('position') || '',
        inlineTf: st.getPropertyValue('transform') || '',
        computedPos: cs.position,
      });
    });
    // 会话框内任何插件元素（不只按钮）
    const anyPlugin = card.querySelectorAll('[class*="dcc-"], [class*="dsh-po"], [class*="cm-stat"], [class*="cm-bbox"]').length;
    const text = (card.innerText || '').replace(/\n+/g, ' | ').slice(0, 120);
    return { found: true, btns, anyPlugin, text };
  });
  if (!nat.found) console.log('  !! 找不到 composerStack');
  else {
    console.log('  会话框内插件元素数 = ' + nat.anyPlugin);
    console.log('  按钮清单：');
    nat.btns.forEach(b => console.log('    · ' + b.label.padEnd(16) + ' ' + JSON.stringify(b.box) + '  inline{pos:' + (b.inlinePos || '-') + ', tf:' + (b.inlineTf || '-') + '}  computed.pos=' + b.computedPos));
    chk(nat.anyPlugin === 0, '会话框内零插件元素（恢复原生）', '插件元素 ' + nat.anyPlugin + ' 个');
    chk(nat.btns.every(b => !b.plugin), '底排按钮全部是原生按钮', '共 ' + nat.btns.length + ' 个');
    chk(nat.btns.every(b => !b.inlinePos && !b.inlineTf), '原生按钮零 inline position/transform', nat.btns.filter(b => b.inlinePos || b.inlineTf).map(b => b.label).join(',') || '零写入');
    chk(nat.btns.every(b => b.computedPos !== 'fixed' && b.computedPos !== 'absolute'), '原生按钮未脱离文档流（不是悬浮）', nat.btns.filter(b => /fixed|absolute/.test(b.computedPos)).map(b => b.label).join(',') || '全部 static/relative');
  }
  // 会话框截图（孤证）
  await p.evaluate(() => {
    const c = document.querySelector('[class*="composerStack"]');
    if (c) c.setAttribute('data-shot-target', '1');
  });
  const cardBox = await p.evaluate(() => {
    const c = document.querySelector('[data-shot-target="1"]');
    if (!c) return null;
    const q = c.getBoundingClientRect();
    return { x: q.x, y: q.y, w: q.width, h: q.height };
  });
  if (cardBox) {
    await p.screenshot({ path: '_composer_native.png', clip: { x: Math.max(0, cardBox.x), y: Math.max(0, cardBox.y), width: Math.min(cardBox.w, 1440), height: Math.min(cardBox.h, 900) }, timeout: 45000 }).catch(() => {});
    console.log('  截图 _composer_native.png');
  }

  /* ============ ① 窄屏压缩：把 tab 容器压到手机宽度 ============ */
  for (const W of WIDTHS) {
    console.log('\n■ tab 容器压到 ' + W + 'px');
    const r = await p.evaluate((targetW) => {
      const R = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return { x: +q.x.toFixed(1), y: +q.y.toFixed(1), w: +q.width.toFixed(1), h: +q.height.toFixed(1), right: +(q.x + q.width).toFixed(1) }; };
      const tabs = document.querySelector('[data-conversation-tabs]');
      if (!tabs) return { found: false };
      tabs.setAttribute('data-orig-w', '1');
      tabs.style.setProperty('width', targetW + 'px', 'important');
      tabs.style.setProperty('max-width', targetW + 'px', 'important');
      tabs.style.setProperty('overflow', 'visible', 'important');
      const dcc = document.querySelector('[class*="dcc-root"]');
      const po = document.querySelector('[data-dsh-po-shell]');
      const out = { found: true, bar: R(tabs), tabs: [], dcc: R(dcc), po: R(po), vw: window.innerWidth };
      for (const b of tabs.querySelectorAll('button[role="tab"]')) out.tabs.push({ t: (b.textContent || '').trim(), r: R(b) });
      // 判定是否溢出容器
      const over = [];
      if (out.dcc && out.dcc.right > out.bar.right + 1) over.push('积分越界 +' + Math.round(out.dcc.right - out.bar.right));
      if (out.po && out.po.right > out.bar.right + 1) over.push('优化越界 +' + Math.round(out.po.right - out.bar.right));
      out.over = over;
      return out;
    }, W);

    if (!r.found) { console.log('  !! tab 栏不存在'); continue; }
    console.log('  bar=' + JSON.stringify(r.bar) + '  dcc=' + JSON.stringify(r.dcc) + '  po=' + JSON.stringify(r.po));

    chk(!!r.dcc && !!r.po, W + '：两个胶囊都在');
    // 重叠：胶囊×tab、胶囊×胶囊
    const items = [];
    if (r.dcc) items.push(['积分', r.dcc]);
    if (r.po) items.push(['优化', r.po]);
    let ovs = [];
    for (const [nm, a] of items) for (const t of r.tabs) if (OV(a, t.r)) ovs.push(nm + '×' + t.t);
    if (items.length === 2 && OV(items[0][1], items[1][1])) ovs.push('积分×优化');
    chk(ovs.length === 0, W + '：零重叠', ovs.length ? ovs.join(',') : '0 对');
    chk(r.over.length === 0, W + '：胶囊不越出 tab 容器', r.over.length ? r.over.join(' | ') : '全部在容器内');
    const onScreen = items.filter(([, a]) => a.right > r.vw + 1 || a.x < -1);
    chk(onScreen.length === 0, W + '：胶囊不出屏', onScreen.length ? onScreen.map(x => x[0]).join(',') : 'vw=' + r.vw);
  }

  /* ============ 恢复原宽度 ============ */
  await p.evaluate(() => {
    const tabs = document.querySelector('[data-conversation-tabs]');
    if (tabs) {
      tabs.style.removeProperty('width');
      tabs.style.removeProperty('max-width');
      tabs.style.removeProperty('overflow');
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(' 结果: ' + PASS + ' 绿 / ' + FAIL + ' 红');
  if (FAIL) fails.forEach(f => console.log('   · ' + f));
  await browser.close();
})();
