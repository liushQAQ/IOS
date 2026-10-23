/**
 * _hero_capsule.js —— 检查「新会话空态（hero / blank）」下胶囊还在不在
 *
 * 背景：官方 client.js 里 hideChrome=blank 时，headerActions 分支整块不渲染，
 * 于是 tab 栏（data-conversation-tabs）和降级位（conversation.session.header.actions）
 * 同时不存在 → 插件组件根本没挂载。需实测确认是否真空态消失。
 */
const { webkit } = require('playwright');

const URL = 'http://127.0.0.1:3083/';

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});

  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);

  const dump = async (tag) => {
    const r = await p.evaluate(() => {
      const q = (s) => document.querySelectorAll(s).length;
      const rect = (s) => {
        const e = document.querySelector(s);
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
      };
      return {
        hero: q('[class*="hero"]'),
        phase: (document.querySelector('[data-phase]') || {}).getAttribute
          ? document.querySelector('[data-phase]').getAttribute('data-phase') : null,
        headerBlank: !!document.querySelector('[class*="headerBlank"]'),
        tabs: q('[data-conversation-tabs]'),
        dccRoot: q('[class*="dcc-root"]'),
        poShell: q('[data-dsh-po-shell]'),
        headerActions: q('[class*="headerActions"]'),
        corner: q('[data-conversation-header-corner]'),
        composer: rect('[class*="composerStack"]'),
        dccRect: rect('[class*="dcc-root"]'),
        poRect: rect('[data-dsh-po-shell]'),
        // 整个文档里凡是出现 dcc / dsh-po 的元素（含未挂载也无法查，故并列 innerText 检查）
        bodyHasCreditsText: document.body.innerText.includes('积分'),
        bodyHasOptimizeText: document.body.innerText.includes('优化'),
      };
    });
    console.log('=== ' + tag + ' ===');
    console.log(JSON.stringify(r, null, 1));
    return r;
  };

  await dump('① 启动后默认态');

  // 尝试点「新会话」新建一个空会话
  const clicked = await p.evaluate(() => {
    const cands = [...document.querySelectorAll('button,a,div[role="button"]')];
    const hit = cands.find((e) => /新会话|新建会话|New session/i.test((e.innerText || '').trim()) && (e.innerText || '').trim().length < 20);
    if (hit) { try { hit.click(); return (hit.innerText || '').trim().slice(0, 20); } catch (e) { return 'click-fail'; } }
    return null;
  });
  console.log('点了：' + clicked);
  await p.waitForTimeout(5000);
  await dump('② 新会话空态（hero）');

  await p.screenshot({ path: '_hero_capsule.png' });
  console.log('截图 → _hero_capsule.png');

  await browser.close();
})();
