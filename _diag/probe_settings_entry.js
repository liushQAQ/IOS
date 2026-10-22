const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(14000);
  await p.evaluate(()=>{ const e=document.querySelector('[aria-label="侧边栏"], [aria-label*="侧"]'); if(e) e.click(); });
  await p.waitForTimeout(1200);

  for (const label of ['插件','自动化任务','记忆系统']) {
    const ok = await p.evaluate((lbl) => {
      const el = document.querySelector('[aria-label="' + lbl + '"]');
      if (!el) return false;
      el.click(); return true;
    }, label);
    await p.waitForTimeout(2000);
    const st = await p.evaluate(() => ({
      url: location.href,
      hash: location.hash,
      dialogs: [...document.querySelectorAll('[role="dialog"],dialog')].filter(d=>d.getBoundingClientRect().width>0).map(d=>(d.getAttribute('aria-label')||'')+'|'+d.innerText.replace(/\s+/g,' ').slice(0,50)),
      text: document.body.innerText.replace(/\s+/g,' ').slice(0,110),
    }));
    console.log('点「' + label + '」ok=' + ok + ' ->', JSON.stringify(st).slice(0, 420));
    // 关闭可能弹层
    await p.keyboard.press('Escape').catch(()=>{});
    await p.waitForTimeout(600);
  }
  await p.screenshot({ path:'after_entries.png' });
  await b.close();
})();
