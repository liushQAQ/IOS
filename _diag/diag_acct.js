const { webkit } = require('playwright');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport:{width:390,height:740}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(12000);
  await p.evaluate(()=>{ const e=document.querySelector('[aria-label="侧边栏"], [aria-label*="侧"]'); if(e) e.click(); });
  await p.waitForTimeout(800);
  await p.screenshot({ path:'shot_acct.png' });

  const info = await p.evaluate(() => {
    function desc(el, depth) {
      if (!el || depth > 3) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        cls: String(el.className||'').slice(0,45),
        x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height),
        pos: cs.position, bottom: cs.bottom, top: cs.top, z: cs.zIndex, ovY: cs.overflowY,
        padB: cs.paddingBottom, marB: cs.marginBottom,
        bg: cs.backgroundColor,
        children: depth < 2 ? [...el.children].map(ch => desc(ch, depth+1)).filter(Boolean) : undefined,
      };
    }
    const acct = document.querySelector('.qin2_W_trigger');
    const list = document.querySelector('.bJOniG_root');
    return {
      acct: acct ? desc(acct, 0) : null,
      acctParent: acct && acct.parentElement ? desc(acct.parentElement, 0) : null,
      acctParent2: acct && acct.parentElement && acct.parentElement.parentElement ? desc(acct.parentElement.parentElement, 0) : null,
      list: list ? desc(list, 0) : null,
      // 抽屉里所有含「设置」的文本
      settingsText: [...document.querySelectorAll('*')].filter(e=>/设置/.test((e.textContent||'').trim()) && e.children.length===0).map(e=>({ t:e.textContent.trim().slice(0,10), cls:String(e.parentElement.className||'').slice(0,30), y:Math.round(e.getBoundingClientRect().y) })).slice(0,10),
    };
  });
  console.log(JSON.stringify(info, null, 1).slice(0, 3000));
  await b.close();
})();
