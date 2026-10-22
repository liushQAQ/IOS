/* 查清 cap 元素为什么 flex-wrap 没生效：列出所有命中它的 flex-wrap / max-width 声明 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(6000);
  await p.evaluate(({ js }) => { try { (0, eval)(js); } catch (e) {} }, { js: APP_JS });
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const sc = document.querySelector('[class*="VERcba_standardControls"]');
    const cap = sc.querySelector(':scope > div > div');
    const chain = [];
    let el = cap;
    for (let i = 0; i < 4 && el; i++) {
      const cs = getComputedStyle(el);
      chain.push({ i, tag: el.tagName, cls: (el.className || '').toString().slice(0, 40), display: cs.display, wrap: cs.flexWrap, dir: cs.flexDirection, w: Math.round(el.getBoundingClientRect().width), minW: cs.minWidth, maxW: cs.maxWidth, fs: cs.flexShrink });
      el = el.parentElement;
    }
    // 命中 cap 的规则
    const hits = [];
    for (const ss of Array.from(document.styleSheets)) {
      let rules = [];
      try { rules = Array.from(ss.cssRules || []); } catch (e) { continue; }
      for (const r of rules) {
        if (!r.selectorText) continue;
        let m = false;
        try { m = cap.matches(r.selectorText); } catch (e) { m = false; }
        if (!m) continue;
        const t = r.style;
        const decl = [];
        ['flex-wrap', 'flex-flow', 'max-width', 'min-width', 'flex-shrink', 'display'].forEach(k => { const v = t.getPropertyValue(k); if (v) decl.push(k + ':' + v + (t.getPropertyPriority(k) ? '!' : '')); });
        if (decl.length) hits.push(r.selectorText.slice(0, 90) + ' => ' + decl.join(' '));
      }
    }
    return { inline: cap.getAttribute('style'), flowRules: (()=>{const a=[];for(const ss of Array.from(document.styleSheets)){let rs=[];try{rs=Array.from(ss.cssRules||[]);}catch(e){continue;}for(const r of rs){if(!r.selectorText||!r.style)continue;const v=r.style.getPropertyValue('flex-flow');if(v)a.push(r.selectorText.slice(0,60)+' => flex-flow:'+v+(r.style.getPropertyPriority('flex-flow')?'!':''));}}return a.slice(0,10);})(), chain, hits: hits.slice(0, 25), nHits: hits.length };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
