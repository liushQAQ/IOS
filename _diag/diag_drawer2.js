const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  for (const H of [740, 660, 600]) {
    const c = await b.newContext({ viewport:{width:390,height:H}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
    await p.waitForTimeout(12000);
    await p.evaluate(()=>{ const e=document.querySelector('[aria-label="侧边栏"], [aria-label*="侧"]'); if(e) e.click(); });
    await p.waitForTimeout(500);
    // 抽屉里点第一个按钮打开（用 aria 新建会话列存在即可）
    const st = await p.evaluate(() => {
      const col = document.querySelector('.MnhYfG_sidebarCol');
      if (!col) return { err:'no sidebarCol' };
      const cs = getComputedStyle(col);
      // 找底部账号区
      const acct = document.querySelector('.qin2_W_trigger');
      const list = document.querySelector('.bJOniG_root');
      const r1 = acct && acct.getBoundingClientRect();
      const r2 = list && list.getBoundingClientRect();
      return {
        vh: innerHeight,
        colH: Math.round(col.getBoundingClientRect().height),
        colScrollH: col.scrollHeight, colClientH: col.clientHeight, colOvY: cs.overflowY,
        listBottom: r2 ? Math.round(r2.y + r2.height) : null,
        acctTop: r1 ? Math.round(r1.y) : null, acctBottom: r1 ? Math.round(r1.y+r1.height) : null,
        overlap: (r1 && r2) ? Math.round((r2.y+r2.height) - r1.y) : null,
      };
    });
    console.log('视口 390x' + H + ' ->', JSON.stringify(st));
    await c.close();
  }
  await b.close();
})();
