/**
 * _tabbar_dom.js —— 摸清「对话 / 轨迹 / 系统监控」tab 栏的真实 DOM 结构
 *
 * 老总 2026-10-23 12:01 纠正：
 *   「轨迹 系统监控 就是 dsh 插件（dsh-system-monitor-plugin）生成的啊，不是官方原生按钮。
 *    所以积分胶囊和提示词插件按钮！也可以做到放这里啊」
 *   → tab 栏是 conversation.view（list / session）槽，任何插件都能追加。
 *   本脚本要回答：
 *     ① tab 栏容器是谁、几何多少、右侧空白多大
 *     ② 三个 tab 按钮各自的 DOM / class / rect
 *     ③ tab 栏内部有没有任何 data-slot（能否挂载）
 *     ④ tab 栏的父级兄弟节点（是否有 actions 区）
 */
const { webkit } = require('playwright');

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});

  try { await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 }); }
  catch (e) { console.log('!! goto 失败 ' + e.message.slice(0, 100)); await browser.close(); return; }
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 100, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(8000);

  // 开真实会话
  const clicked = await p.evaluate(() => {
    const cands = [...document.querySelectorAll('[data-slot="sidebar.workspaces"] div, [data-slot="sidebar.workspaces"] li')];
    for (const c of cands) {
      const txt = (c.innerText || '').trim();
      if (txt && txt.length > 2 && txt.length < 40 && /修复6066|排队消息|未命名/.test(txt)) { c.click(); return txt.split('\n')[0].slice(0, 24); }
    }
    return null;
  });
  await p.waitForTimeout(10000);
  console.log('session=' + clicked);

  const dump = await p.evaluate(() => {
    const R = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
    const D = (e) => { if (!e) return null; const s = getComputedStyle(e); return { d: s.display, pos: s.position, fx: s.flex, w: s.width }; };
    const desc = (e) => {
      if (!e) return 'null';
      const ds = [];
      for (const a of e.attributes) { if (a.name.startsWith('data-') || a.name === 'role' || a.name === 'class') ds.push(a.name + '="' + String(a.value).slice(0, 90) + '"'); }
      return '<' + e.tagName.toLowerCase() + '> ' + ds.join(' ');
    };

    const out = { ok: false };

    // 1) 找含三个 tab 文本的最小共同祖先
    const all = [...document.querySelectorAll('*')];
    const hits = [];
    for (const e of all) {
      const t = (e.textContent || '').trim();
      if (t.length < 60 && /对话/.test(t) && /轨迹/.test(t) && /系统监控/.test(t)) hits.push(e);
    }
    if (!hits.length) { out.msg = '三个 tab 文本未同时出现（可能只渲染了两个）'; }
    // 最小 = 深度最大
    const depth = (e) => { let d = 0; while (e && e.parentElement) { d++; e = e.parentElement; } return d; };
    hits.sort((a, b) => depth(b) - depth(a));
    const bar = hits[0] || null;
    out.bar = bar ? { desc: desc(bar), rect: R(bar), style: D(bar), text: (bar.textContent || '').trim().slice(0, 80) } : null;

    // 2) tab 栏父链（4 层）
    out.chain = [];
    let cur = bar;
    for (let i = 0; i < 4 && cur; i++) { out.chain.push({ desc: desc(cur), rect: R(cur), style: D(cur) }); cur = cur.parentElement; }

    // 3) tab 栏内是否有 data-slot
    out.slotsInside = bar ? [...bar.querySelectorAll('[data-slot]')].map(e => e.getAttribute('data-slot') + ' ' + JSON.stringify(R(e))) : [];
    out.slotsSelf = bar ? bar.getAttribute('data-slot') : null;

    // 4) tab 按钮明细：bar 的直系子 + 孙子里带 tab 语义的
    out.buttons = [];
    if (bar) {
      const cands = [...bar.querySelectorAll('button, [role="tab"], a')];
      for (const b of cands) {
        const t = (b.textContent || '').trim().slice(0, 20);
        out.buttons.push({ text: t, desc: desc(b), rect: R(b), style: D(b) });
      }
    }

    // 5) 兄弟节点（bar 的父级的所有子）
    out.siblings = [];
    if (bar && bar.parentElement) {
      for (const s of bar.parentElement.children) {
        out.siblings.push({ desc: desc(s), rect: R(s), style: D(s), isBar: s === bar });
      }
    }

    // 6) 全页所有 data-slot 清单（找有没有 tab 相关）
    out.allSlots = [...document.querySelectorAll('[data-slot]')]
      .map(e => e.getAttribute('data-slot'))
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();

    out.ok = !!bar;
    return out;
  });

  console.log('\n===== 结果 =====');
  console.log(JSON.stringify(dump, null, 2));
  await browser.close();
})();
