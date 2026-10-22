// 权威版：不看某一刻的 DOM，而是扫「实际加载的 CSS + JS 文本」里还有没有这些哈希类名
// 只要一个哈希类名在 CSS/JS 文本里彻底不存在 = 该补丁永久失效，换任何页面状态都没救
const { webkit } = require('playwright');
const fs = require('fs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const NAMES = JSON.parse(fs.readFileSync('_hashlist.json', 'utf8'));

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();

  const assets = [];
  p.on('response', async r => {
    const u = r.url();
    const ct = (r.headers()['content-type'] || '');
    if (!/javascript|css|text\/plain/.test(ct)) return;
    try {
      const body = await r.text();
      assets.push({ url: u.split('/').pop().slice(0, 40), len: body.length, body });
    } catch (e) {}
  });

  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(9000);

  // 内联 style 也收
  const inlineCss = await p.evaluate(() => {
    let t = '';
    for (const s of document.styleSheets) {
      try { for (const r of s.cssRules) t += r.cssText + '\n'; } catch (e) {}
    }
    document.querySelectorAll('style').forEach(s => { t += s.textContent + '\n'; });
    return t;
  });

  const blob = assets.map(a => a.body).join('\n') + '\n' + inlineCss;
  console.log('抓到的资源: ' + assets.length + ' 个, 文本总长 ' + Math.round(blob.length / 1024) + ' KB');
  console.log('内联/样式表 CSS: ' + Math.round(inlineCss.length / 1024) + ' KB');

  const alive = [], dead = [];
  for (const n of NAMES) {
    if (blob.indexOf(n) >= 0) alive.push(n); else dead.push(n);
  }
  console.log('\nApp 写死哈希类名 ' + NAMES.length + ' 个');
  console.log('  资源文本里仍存在 : ' + alive.length);
  console.log('  资源文本里彻底没有: ' + dead.length + '   ← 永久失效，任何状态都救不回来');
  console.log('\n--- 已彻底失效 ---');
  dead.forEach(n => console.log('  DEAD ' + n));
  console.log('\n--- 仍存在 ---');
  alive.forEach(n => console.log('  OK   ' + n));

  fs.writeFileSync('_hash_survival_result.json', JSON.stringify({ alive, dead }, null, 1), 'utf8');
  await b.close();
})();
