const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, colorScheme: 'dark' })).newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    let css = '';
    for (const s of document.styleSheets) {
      try { for (const ru of s.cssRules) css += ru.cssText + '\n'; } catch (e) { css += ''; }
    }
    const probe = ['composerStack','sidebarCol','pageHead','overlayLayer','centerCol','footArea','headerCorner','scrollBody','viewOptionsMenu','NwyCaq_card','WYye1W_root','titleRow'];
    const out = {};
    probe.forEach(k => out[k] = css.indexOf(k) >= 0);
    return { cssLen: css.length, n: document.styleSheets.length, hit: out };
  });
  console.log('样式表 ' + r.n + ' 个, 规则文本 ' + r.cssLen + ' 字符');
  console.log(JSON.stringify(r.hit, null, 2));
  await b.close();
})();
