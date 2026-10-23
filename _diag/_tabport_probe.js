/**
 * _tabport_probe.js —— 验证两个胶囊是否 Portal 进了会话区域 tab 栏
 *
 * 期望（老总 2026-10-23 12:01）：
 *   积分胶囊（dcc-root）与提示词优化（dsh-po-shell）应出现在
 *   [data-conversation-tabs]（对话 / 轨迹 / 系统监控 那一行）内部，
 *   与 tab 按钮并排，垂直居中，不压任何 tab。
 *
 * 本脚本先看空态（hero）有没有 tab 栏；没有就点「新会话」再等，
 * 仍没有则输出「tabs 数量不足」的诊断（官方规则：tabs.length>1 才渲染 tab 栏）。
 */
const { webkit } = require('playwright');

const R = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => { const s = String(e); if (!/model\.label|remote\.session/.test(s)) errs.push(s.slice(0, 160)); });

  try { await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 }); }
  catch (e) { console.log('!! goto 失败 ' + e.message.slice(0, 100)); await browser.close(); return; }
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 100, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(9000);

  const snap = async (label) => {
    const r = await p.evaluate(() => {
      const R2 = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
      const out = {};
      const tabs = document.querySelector('[data-conversation-tabs]');
      out.hasTabBar = !!tabs;
      out.tabBar = R2(tabs);
      out.tabStyles = tabs ? (({ display, gap, alignItems, paddingLeft, marginTop }) => ({ display, gap, alignItems, paddingLeft, marginTop }))(getComputedStyle(tabs)) : null;
      out.tabBtns = tabs ? [...tabs.querySelectorAll('button[role="tab"]')].map(b => ({ t: (b.textContent || '').trim(), r: R2(b) })) : [];
      out.tabsChildren = tabs ? [...tabs.children].map(c => ({ cls: String(c.className).slice(0, 50), tag: c.tagName.toLowerCase(), r: R2(c) })) : [];

      const dcc = document.querySelector('[class*="dcc-root"]');
      const po = document.querySelector('[data-dsh-po-shell]') || document.querySelector('[class*="dsh-po-capsule"]');
      out.dcc = dcc ? { r: R2(dcc), parent: String(dcc.parentElement?.className || '').slice(0, 50), inTabs: !!(tabs && tabs.contains(dcc)), alignSelf: getComputedStyle(dcc).alignSelf } : null;
      out.po = po ? { r: R2(po), parent: String(po.parentElement?.className || '').slice(0, 50), inTabs: !!(tabs && tabs.contains(po)), alignSelf: getComputedStyle(po).alignSelf } : null;

      // 原生模型选择器
      const off = document.querySelector('[class*="ofTiQG_root"]');
      out.native = off ? { r: R2(off), pos: getComputedStyle(off).position, inTabs: !!(tabs && tabs.contains(off)) } : null;

      // 会话框内是否还有插件元素
      const card = document.querySelector('[class*="composerStack"] [class*="_card"]') || document.querySelector('[class*="composerStack"]');
      out.inComposer = card ? { dcc: !!card.querySelector('[class*="dcc-root"]'), po: !!card.querySelector('[class*="dsh-po"]') } : null;
      out.slotCount = document.querySelectorAll('[data-slot="conversation.session"]').length;
      out.heroHint = !!document.querySelector('[data-slot="conversation.hero.options"]');
      return out;
    });
    console.log('\n--- ' + label + ' ---');
    console.log(JSON.stringify(r, null, 1));
    return r;
  };

  await snap('初始（可能是 hero 空态）');

  // 试着点侧边栏「新会话」，进入会话态
  const clicked = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('[class*="sessionRow"], [data-slot="sidebar.workspaces"] [role="button"]')];
    for (const r of rows) {
      const t = (r.innerText || '').trim();
      if (t && t.length < 30) { r.click(); return t.split('\n')[0]; }
    }
    return null;
  });
  console.log('\n点击会话行 = ' + clicked);
  await p.waitForTimeout(8000);
  await snap('点会话后');

  if (errs.length) console.log('\n页面错误: ' + JSON.stringify(errs.slice(0, 4), null, 1));
  await browser.close();
})();
