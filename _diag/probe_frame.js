/* 找真机上「多出 59px」的真凶：扫所有 padding-top/margin-top/top 用 safe-area 或 --dsh-frame-* 变量的规则 */
const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, colorScheme: 'dark' })).newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(4000);
  const r = await p.evaluate(() => {
    const hits = [], vars = [];
    for (const s of document.styleSheets) {
      let txt = '';
      try { for (const ru of s.cssRules) txt += ru.cssText + '\n'; } catch (e) { continue; }
      if (!txt) continue;
      const own = txt.indexOf('[class*=') >= 0;
      for (const ru of s.cssRules) {
        const t = (ru.cssText || '').replace(/\s+/g, ' ');
        if (/--dsh-frame-/.test(t)) {
          if (/--dsh-frame-[a-z-]+\s*:/.test(t) && t.indexOf(':root') >= 0 || /html|body|:root/.test(t.slice(0, 60))) vars.push((own ? '[自家]' : '[DSH ]') + t.slice(0, 220));
        }
        if (/(padding-top|margin-top|inset-top|top)\s*:[^;]*(safe-area-inset-top|--dsh-frame-top-clearance|--dsh-frame-chrome-top)/.test(t)) {
          hits.push((own ? '[自家]' : '[DSH ]') + t.slice(0, 240));
        }
      }
    }
    return { hits, vars, bodyPad: getComputedStyle(document.body).paddingTop, htmlPad: getComputedStyle(document.documentElement).paddingTop };
  });
  console.log('body padding-top=' + r.bodyPad + '  html padding-top=' + r.htmlPad);
  console.log('\n--- 变量定义 ---'); r.vars.slice(0, 12).forEach(v => console.log(v));
  console.log('\n--- 吃 top 的规则 ' + r.hits.length + ' 条 ---'); r.hits.slice(0, 25).forEach(v => console.log(v));
  await b.close();
})();
