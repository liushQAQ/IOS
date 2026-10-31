// R51 会话态验证：回退按钮应在 tab 行（[data-conversation-tabs] 内 chip），composer 干净
const path = require('path');
const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(30000);
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6000);
  await p.evaluate(() => { const b = document.querySelector('.cm-peak-alert-actions button'); if (b) b.click(); });

  // 开左抽屉 → 等列表 → 点第一个会话
  await p.evaluate(() => { const g = document.querySelector('[aria-label="收起侧边栏"], [aria-label="打开侧边栏"]'); if (g) g.click(); });
  await p.waitForTimeout(1500);
  const picked = await p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('button, [role="option"], [role="listitem"], li, a')).filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 120 && r.height > 24 && r.left > -260 && r.left < 60 && (e.textContent || '').trim().length > 4;
    });
    // 优先看起来像会话标题的（非 新建/插件/设置 字样）
    const sess = rows.find(e => !/新会话|插件|市场|自动化|记忆|更多|账号|导出|工作区|终端|浏览器|工具|开始/.test(e.textContent || ''));
    if (sess) { sess.click(); return (sess.textContent || '').trim().slice(0, 26); }
    return null;
  });
  await p.waitForTimeout(4000);
  console.log('picked:', picked);

  const out = await p.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const tabs = document.querySelector('[data-conversation-tabs]');
    const chip = document.querySelector('.dshp-rewind-chip');
    const rewindBtn = document.querySelector('.dshp-rewind');
    const card = document.querySelector('[class*="composerStack"]');
    let composerHasRewind = false, composerBtns = [];
    if (card) {
      card.querySelectorAll('button').forEach(b => {
        const cls = String(b.className);
        if (cls.indexOf('dshp-rewind') >= 0) composerHasRewind = true;
        composerBtns.push([b.getAttribute('aria-label') || (b.textContent || '').trim().slice(0, 14), r(b)]);
      });
    }
    // tab 行整行子元素布局
    const rowKids = tabs ? Array.from(tabs.children).map(k => ({ cls: String(k.className).slice(0, 34), rect: r(k), text: (k.textContent || '').trim().slice(0, 12) })) : null;
    return {
      tabsRow: tabs ? r(tabs) : null,
      chip: chip ? r(chip) : null,
      chipParentIsTabs: chip ? (chip.parentElement === tabs) : null,
      rewindBtn: rewindBtn ? { rect: r(rewindBtn), text: (rewindBtn.textContent || '').trim() } : null,
      composerHasRewind, composerBtns,
      rowKids,
      docSW: document.documentElement.scrollWidth, vw: innerWidth,
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await p.screenshot({ path: path.join(__dirname, '_r51_session_rewind.png') });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
