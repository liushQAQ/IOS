const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, colorScheme: 'dark' })).newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(4000);
  const r = await p.evaluate(() => {
    const varDefs = [], ptVar = [];
    for (const s of document.styleSheets) {
      let txt = '';
      try { for (const ru of s.cssRules) txt += ru.cssText + '\n'; } catch (e) { continue; }
      if (!txt) continue;
      const own = txt.indexOf('[class*=') >= 0;
      for (const ru of s.cssRules) {
        const t = (ru.cssText || '').replace(/\s+/g, ' ');
        // 变量定义里含 safe-area
        const m = t.match(/--[a-z0-9-]+\s*:\s*[^;]*safe-area-inset-top[^;]*/g);
        if (m) m.forEach(x => varDefs.push((own ? '[自家]' : '[DSH ]') + t.slice(0, 50) + ' ⟶ ' + x.slice(0, 120)));
        // padding-top: var(...)
        if (/padding-top\s*:\s*var\(/.test(t)) ptVar.push((own ? '[自家]' : '[DSH ]') + t.slice(0, 230));
      }
    }
    return { varDefs, ptVar };
  });
  console.log('--- 变量定义含 safe-area-inset-top: ' + r.varDefs.length + ' ---');
  r.varDefs.slice(0, 15).forEach(v => console.log(v));
  console.log('\n--- padding-top: var(...) 规则 ' + r.ptVar.length + ' 条 ---');
  r.ptVar.slice(0, 30).forEach(v => console.log(v));
  await b.close();
})();
