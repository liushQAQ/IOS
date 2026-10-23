/**
 * _tabport_live.js —— 真实会话态验证：两个胶囊是否进了 tab 栏
 *
 * 前置：profile 里 developerTools 临时设为 true（让「轨迹」tab 出现，
 *       tabs.length>1 才会渲染 tab 栏；验完必须改回）。
 *
 * 流程：hero 空态 → 输入一条极短消息回车 → 等会话态 → dump tab 栏与胶囊几何。
 */
const { webkit } = require('playwright');

const SIZES = [[1440, 900]];

(async () => {
  const browser = await webkit.launch({ headless: true });
  for (const [W, H] of SIZES) {
    console.log('\n■ ' + W + '×' + H);
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => { const s = String(e); if (!/model\.label|remote\.session/.test(s)) errs.push(s.slice(0, 150)); });

    try { await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 }); }
    catch (e) { console.log('  !! goto 失败'); await ctx.close(); continue; }
    await p.waitForTimeout(9000);

    // hero 态：找输入框，输入消息，回车
    const typed = await p.evaluate(() => {
      const ta = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]');
      if (!ta) return 'no-input';
      ta.focus();
      const proto = ta.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : null;
      const setter = proto && Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(ta, '验证 tab 栏'); else ta.textContent = '验证 tab 栏';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return 'typed';
    });
    console.log('  输入框: ' + typed);
    if (typed === 'no-input') { await ctx.close(); continue; }
    await p.waitForTimeout(400);
    await p.keyboard.press('Enter');

    // 等会话态 + tab 栏出现
    let bar = null;
    for (let i = 0; i < 40; i++) {
      await p.waitForTimeout(1000);
      const has = await p.evaluate(() => !!document.querySelector('[data-conversation-tabs]'));
      if (has) { bar = true; break; }
    }
    console.log('  tab 栏出现: ' + bar);

    const r = await p.evaluate(() => {
      const R2 = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
      const out = {};
      const tabs = document.querySelector('[data-conversation-tabs]');
      out.tabBar = R2(tabs);
      out.tabBtns = tabs ? [...tabs.querySelectorAll('button[role="tab"]')].map(b => ({ t: (b.textContent || '').trim(), r: R2(b) })) : [];
      out.children = tabs ? [...tabs.children].map(c => ({
        tag: c.tagName.toLowerCase(),
        cls: String(c.className).slice(0, 40),
        role: c.getAttribute('role') || '',
        r: R2(c),
      })) : [];

      const dcc = document.querySelector('[class*="dcc-root"]');
      const po = document.querySelector('[data-dsh-po-shell]') || document.querySelector('[class*="dsh-po-capsule"]');
      out.dcc = dcc ? { r: R2(dcc), inTabs: !!(tabs && tabs.contains(dcc)), alignSelf: getComputedStyle(dcc).alignSelf, parent: String(dcc.parentElement?.getAttribute('role') || dcc.parentElement?.className || '').slice(0, 40) } : null;
      out.po = po ? { r: R2(po), inTabs: !!(tabs && tabs.contains(po)), alignSelf: getComputedStyle(po).alignSelf, parent: String(po.parentElement?.getAttribute('role') || po.parentElement?.className || '').slice(0, 40) } : null;

      const off = document.querySelector('[class*="ofTiQG_root"]');
      out.native = off ? { r: R2(off), pos: getComputedStyle(off).position, inTabs: !!(tabs && tabs.contains(off)), parent: String(off.parentElement?.className || '').slice(0, 40) } : null;

      const card = document.querySelector('[class*="composerStack"]');
      out.inComposer = card ? { dcc: !!card.querySelector('[class*="dcc-root"]'), po: !!card.querySelector('[class*="dsh-po"]') } : null;

      // 重叠判定：胶囊与每个 tab 按钮是否相交
      const ov = (a, b) => !(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1]);
      out.overlaps = [];
      const caps = [];
      if (out.dcc) caps.push(['dcc', out.dcc.r]);
      if (out.po) caps.push(['po', out.po.r]);
      for (const [nm, rc] of caps) {
        for (const b of out.tabBtns) if (ov(rc, b.r)) out.overlaps.push(nm + '×' + b.t);
        if (ov(rc, rc)) { /* self */ }
      }
      if (caps.length === 2 && ov(caps[0][1], caps[1][1])) out.overlaps.push('dcc×po');
      out.viewport = [window.innerWidth, window.innerHeight];
      return out;
    });

    console.log(JSON.stringify(r, null, 1));
    if (errs.length) console.log('  页面错误: ' + JSON.stringify(errs.slice(0, 3)));
    await ctx.close();
  }
  await browser.close();
})();
