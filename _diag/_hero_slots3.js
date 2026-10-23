const { webkit } = require('playwright');
(async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(9000);
  const rows = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('[data-slot]').forEach((e) => {
      const kids = [...e.children];
      const withSize = kids.filter((k) => {
        const b = k.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      });
      out.push({
        slot: e.getAttribute('data-slot'),
        n: kids.length,
        vis: withSize.length,
        first: withSize[0] ? (() => { const b = withSize[0].getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round).join(','); })() : '',
      });
    });
    return out;
  });
  console.log('HERO 态插槽（共 ' + rows.length + '）：');
  rows.forEach((r) => console.log('  ' + (r.vis ? '✅' : '  ') + ' ' + r.slot + '  kids=' + r.n + ' visible=' + r.vis + (r.first ? '  [' + r.first + ']' : '')));
  await browser.close();
})();
