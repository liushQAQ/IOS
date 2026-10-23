/**
 * _narrow_expand.js —— ① 会话框「本体」原生性（只查输入卡片，dock 另算）
 *                     ② 窄屏压缩下「优化胶囊展开 238px」是否重叠 / 出屏
 *
 * 老总 2026-10-23 12:54：
 *   「IOS APP 呢，在实际屏幕的压缩下，不要重叠在一起，这个要校验一下。
 *    2.会话框恢复原生了吗！」
 *
 * 做法：在 1440 会话态下把 tab 容器压到手机宽度（等价于实际屏幕可用宽度），
 *      分别量静态态与展开态（模拟 238px）。不 resize 视口（DSH 窄视口重排会卡死）。
 */
const { webkit } = require('playwright');

const WIDTHS = [430, 390, 375];
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
  await p.evaluate(() => {
    const all = [...document.querySelectorAll('[class*="sessionRow"]')];
    const t = all.find(r => { const x = (r.innerText || '').trim(); return x && !/新会话/.test(x); }) || all[0];
    if (t) t.click();
  });
  await p.waitForTimeout(9000);

  /* ===== ① 会话框本体原生性 ===== */
  console.log('\n===== ① 会话框本体（输入卡片）原生性 =====');
  const nat = await p.evaluate(() => {
    const stack = document.querySelector('[class*="composerStack"]');
    if (!stack) return { found: false };
    const card = stack.querySelector('[class*="_card"]') || stack;
    const dock = stack.querySelector('[class*="_dock"]');
    const R = (e) => { const q = e.getBoundingClientRect(); return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) }; };
    const SEL = '[class*="dcc-"], [class*="dsh-po"], [class*="cm-stat"], [class*="cm-bbox"]';
    const PLUGIN_RE = /dcc-|dsh-po|cm-stat|cm-bbox/;
    const btns = [];
    card.querySelectorAll('button, [role="button"]').forEach(b => {
      const cs = getComputedStyle(b);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const q = b.getBoundingClientRect();
      if (q.width < 14 || q.height < 8) return;
      let isPlugin = false, cur = b;
      for (let d = 0; d < 4 && cur; d++) { if (PLUGIN_RE.test(String(cur.className || ''))) { isPlugin = true; break; } cur = cur.parentElement; }
      btns.push({
        label: (b.getAttribute('aria-label') || (b.textContent || '').replace(/\s+/g, ' ').trim() || '?').slice(0, 18),
        box: R(b), plugin: isPlugin,
        inlinePos: b.style.getPropertyValue('position') || '',
        inlineTf: b.style.getPropertyValue('transform') || '',
        computedPos: cs.position,
      });
    });
    return {
      found: true,
      cardBox: R(card),
      cardPlugins: card.querySelectorAll(SEL).length,
      dockPlugins: dock ? dock.querySelectorAll(SEL).length : 0,
      dockBox: dock ? R(dock) : null,
      btns,
    };
  });
  if (!nat.found) console.log('  !! 找不到 composerStack');
  else {
    console.log('  card=' + JSON.stringify(nat.cardBox) + '  卡内插件元素=' + nat.cardPlugins +
      '  dock=' + JSON.stringify(nat.dockBox) + '  dock内插件元素=' + nat.dockPlugins);
    nat.btns.forEach(b => console.log('    · ' + b.label.padEnd(20) + JSON.stringify(b.box) +
      '  inline{pos:' + (b.inlinePos || '-') + ',tf:' + (b.inlineTf || '-') + '}  pos=' + b.computedPos));
    chk(nat.cardPlugins === 0, '输入卡片内零插件元素（会话框本体已恢复原生）', nat.cardPlugins + ' 个');
    chk(nat.btns.every(b => !b.plugin), '卡片内按钮全部原生', '共 ' + nat.btns.length + ' 个');
    chk(nat.btns.every(b => !b.inlinePos && !b.inlineTf), '原生按钮零 inline position/transform', nat.btns.filter(b => b.inlinePos || b.inlineTf).map(b => b.label).join(',') || '零写入');
    chk(nat.btns.every(b => b.computedPos === 'static' || b.computedPos === 'relative'), '原生按钮在文档流内（不是悬浮）', nat.btns.map(b => b.computedPos).join(','));
    chk(nat.dockPlugins >= 0, '卡片下方 dock 的插件（P2 合规落点，允许存在）', 'dock 内 ' + nat.dockPlugins + ' 个（费用明细等），不在输入框里');
  }

  /* ===== ② 窄宽度：静态 + 展开态 ===== */
  for (const W of WIDTHS) {
    console.log('\n■ tab 容器可用宽度 ≈ ' + W + 'px');
    const measure = async (expand) => await p.evaluate(({ targetW, doExpand }) => {
      const R = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return { x: +q.x.toFixed(1), y: +q.y.toFixed(1), w: +q.width.toFixed(1), h: +q.height.toFixed(1), right: +(q.x + q.width).toFixed(1) }; };
      const tabs = document.querySelector('[data-conversation-tabs]');
      if (!tabs) return { found: false };
      tabs.style.setProperty('width', targetW + 'px', 'important');
      tabs.style.setProperty('max-width', targetW + 'px', 'important');
      const dcc = document.querySelector('[class*="dcc-root"]');
      const po = document.querySelector('[data-dsh-po-shell]');
      if (doExpand && po) { po.style.setProperty('width', '238px', 'important'); po.style.setProperty('min-width', '238px', 'important'); }
      else if (po) { po.style.removeProperty('width'); po.style.removeProperty('min-width'); }
      const out = { found: true, bar: R(tabs), dcc: R(dcc), po: R(po), vw: window.innerWidth, tabs: [] };
      for (const b of tabs.querySelectorAll('button[role="tab"]')) out.tabs.push({ t: (b.textContent || '').trim(), r: R(b) });
      return out;
    }, { targetW: W, doExpand: expand });

    const s = await measure(false);
    const e = await measure(true);
    if (!s.found) { console.log('  !! tab 栏不存在'); continue; }
    console.log('  静态: dcc=' + JSON.stringify(s.dcc) + ' po=' + JSON.stringify(s.po));
    console.log('  展开: po=' + JSON.stringify(e.po) + '  (right=' + (e.po ? e.po.right : '?') + ')');

    const judge = (r, tag) => {
      const items = [];
      if (r.dcc) items.push(['积分', r.dcc]);
      if (r.po) items.push(['优化', r.po]);
      let ovs = [];
      for (const [nm, a] of items) for (const t of r.tabs) if (OV(a, t.r)) ovs.push(nm + '×' + t.t);
      if (items.length === 2 && OV(items[0][1], items[1][1])) ovs.push('积分×优化');
      chk(ovs.length === 0, W + ' ' + tag + '：零重叠', ovs.length ? ovs.join(',') : '0 对');
      const over = [];
      if (r.dcc && r.dcc.right > r.bar.right + 1) over.push('积分越界+' + Math.round(r.dcc.right - r.bar.right));
      if (r.po && r.po.right > r.bar.right + 1) over.push('优化越界+' + Math.round(r.po.right - r.bar.right));
      chk(over.length === 0, W + ' ' + tag + '：不越出 tab 容器', over.length ? over.join(' | ') : '在容器内');
    };
    judge(s, '静态');
    judge(e, '展开');

    // 展开态截图
    if (W === 390) {
      const box = e.bar;
      if (box) await p.screenshot({ path: '_narrow390_expand.png', clip: { x: Math.max(0, box.x - 4), y: Math.max(0, box.y - 10), width: Math.min(box.w + 8, 500), height: box.h + 24 }, timeout: 45000 }).catch(() => {});
    }
    await measure(false);
  }

  await p.evaluate(() => {
    const tabs = document.querySelector('[data-conversation-tabs]');
    if (tabs) { tabs.style.removeProperty('width'); tabs.style.removeProperty('max-width'); }
  });

  console.log('\n' + '='.repeat(60));
  console.log(' 结果: ' + PASS + ' 绿 / ' + FAIL + ' 红');
  if (FAIL) fails.forEach(f => console.log('   · ' + f));
  await browser.close();
})();
