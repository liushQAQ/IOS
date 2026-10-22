const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:430,height:932}, deviceScaleFactor:3, isMobile:true, hasTouch:true });
  const p = await c.newPage();
  const bad = [];
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(-60)); });
  p.on('pageerror', e => bad.push('pageerror ' + e.message.slice(0,110)));
  const t0 = Date.now();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let ok = null;
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(3000);
    const s = await p.evaluate(() => { const r=document.getElementById('root'); return { root:!!r, textLen:r?String(r.innerText||'').trim().length:-1, head:r?String(r.innerText||'').replace(/\s+/g,' ').slice(0,50):'' }; });
    if (s.textLen > 60) { ok = { ...s, ms: Date.now() - t0 }; break; }
    ok = { ...s, ms: Date.now() - t0 };
  }
  // 顺便验证邮箱正则真的能工作（改写后的语义）
  const mailTest = await p.evaluate(() => {
    const t = '联系 a@b.com 或 x.y@mail.co.uk 谢谢';
    const re = new RegExp('(?:^|\\s|\\p{P}|\\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)', 'gu');
    const out = []; let m;
    while ((m = re.exec(t))) { out.push(m[1] + '@' + m[2]); }
    return out;
  });
  await b.close();
  console.log('最终状态:', JSON.stringify(ok));
  console.log('邮箱提取自测:', JSON.stringify(mailTest));
  console.log('异常(' + bad.length + '):'); bad.slice(0,8).forEach(x=>console.log('  - '+x));
})();
