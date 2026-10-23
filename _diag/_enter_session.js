/**
 * _enter_session.js —— 进入真实会话态（优先点历史会话，避免新建）
 */
const { webkit } = require('playwright');

(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});

  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);

  // 1) 展开所有工作区
  await p.evaluate(() => {
    [...document.querySelectorAll('[class*="projectRow"]')].forEach(r => { try { r.click(); } catch (e) {} });
  });
  await p.waitForTimeout(2500);

  // 2) dump 会话行
  const rows = await p.evaluate(() => [...document.querySelectorAll('[class*="sessionRow"]')].map(r => ({
    t: (r.innerText || '').trim().replace(/\n+/g, '|').slice(0, 36),
    cls: String(r.className).slice(0, 40),
  })));
  console.log('会话行 (' + rows.length + '): ' + JSON.stringify(rows, null, 1));

  // 3) 点第一个非「新会话」的行；没有就点「新会话」
  const picked = await p.evaluate(() => {
    const all = [...document.querySelectorAll('[class*="sessionRow"]')];
    const target = all.find(r => { const t = (r.innerText || '').trim(); return t && !/新会话/.test(t); }) || all[0];
    if (!target) return null;
    target.click();
    return (target.innerText || '').trim().replace(/\n+/g, '|').slice(0, 36);
  });
  console.log('点击: ' + picked);
  await p.waitForTimeout(10000);

  const st = await p.evaluate(() => {
    const out = {};
    out.hero = !!document.querySelector('[data-slot="conversation.hero.options"]');
    out.headerActionsSlot = !!document.querySelector('[data-slot="conversation.session.header.actions"]');
    out.headerUtilitiesSlot = !!document.querySelector('[data-slot="conversation.session.header.utilities"]');
    out.tabs = !!document.querySelector('[data-conversation-tabs]');
    out.dcc = !!document.querySelector('[class*="dcc-root"]');
    out.po = !!document.querySelector('[data-dsh-po-shell]');
    return out;
  });
  console.log('状态: ' + JSON.stringify(st));

  // 4) 若仍 hero，则用 contenteditable 真输入并发送
  if (st.hero) {
    const ce = await p.$('[contenteditable="true"]');
    console.log('contenteditable: ' + (ce ? 'found' : 'none'));
    if (ce) {
      await ce.click();
      await p.keyboard.type('1', { delay: 50 });
      await p.waitForTimeout(700);
      const sendInfo = await p.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /发送/.test(x.getAttribute('aria-label') || x.title || '') && !x.disabled);
        if (b) { b.click(); return 'clicked'; }
        return 'none';
      });
      console.log('发送按钮: ' + sendInfo);
      if (sendInfo === 'none') await p.keyboard.press('Enter');
      await p.waitForTimeout(12000);
      const st2 = await p.evaluate(() => ({
        hero: !!document.querySelector('[data-slot="conversation.hero.options"]'),
        tabs: !!document.querySelector('[data-conversation-tabs]'),
        headerActions: !!document.querySelector('[data-slot="conversation.session.header.actions"]'),
        dcc: !!document.querySelector('[class*="dcc-root"]'),
        po: !!document.querySelector('[data-dsh-po-shell]'),
      }));
      console.log('发送后: ' + JSON.stringify(st2));
    }
  }

  await p.screenshot({ path: '_enter_session.png' });
  console.log('截图 _enter_session.png');
  await browser.close();
})();
