/* 扫 DSH 自有 CSS + App 注入 CSS 里所有含 safe-area-inset-top 的规则，
   列出选择器 → 判断哪个元素在真机吃到 59px 而我们的修复没覆盖 */
const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, colorScheme: 'dark' })).newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(4000);
  const rules = await p.evaluate(() => {
    const out = [];
    for (const s of document.styleSheets) {
      let own = false, txt = '';
      try { for (const ru of s.cssRules) txt += ru.cssText + '\n'; } catch (e) { continue; }
      if (!txt) continue;
      own = txt.indexOf('[class*=') >= 0 || txt.indexOf('[class^=') >= 0 || txt.indexOf('[class$=') >= 0;
      for (const ru of s.cssRules) {
        const t = ru.cssText || '';
        if (t.indexOf('safe-area-inset-top') < 0) continue;
        out.push({ own, sel: t.slice(0, 200) });
      }
    }
    return out;
  });
  console.log('含 safe-area-inset-top 的规则 ' + rules.length + ' 条：');
  rules.forEach((r, i) => console.log((r.own ? '[自家] ' : '[DSH ] ') + r.sel.replace(/\s+/g, ' ').slice(0, 180)));
  await b.close();
})();
