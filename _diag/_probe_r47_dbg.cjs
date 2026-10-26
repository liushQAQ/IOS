/* R47 调试：CSS-only 注入后，验证 headerCorner 绝对定位规则为何没生效 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'light' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  const r = await p.evaluate(({ js }) => {
    const out = {};
    const lines = js.split('\n');
    let css = '';
    for (const ln of lines) {
      const m = ln.match(/^\s*'(.*)',?\s*$/);
      if (m && /[{}:;]/.test(m[1])) css += m[1].replace(/\\'/g, "'").replace(/\\"/g, '"') + '\n';
    }
    out.hasRule = /headerCorner[\s\S]{0,80}position: absolute/.test(css);
    const st = document.createElement('style');
    st.id = 'dsh-probe-css';
    st.textContent = css;
    document.head.appendChild(st);
    // 直接查规则是否进 CSSOM
    let found = 0, sample = '';
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const rule of rules) {
        if (rule.selectorText && rule.selectorText.indexOf('headerCorner') >= 0 && rule.style && rule.style.position === 'absolute') { found++; sample = rule.selectorText; }
      }
    }
    out.cssomHits = found; out.cssomSample = sample;
    const hc = document.querySelector('[class*="headerCorner"]');
    out.hcExists = !!hc;
    if (hc) {
      const cs = getComputedStyle(hc);
      out.hcPos = cs.position;
      // header 标签在不在祖先链
      out.inHeader = !!hc.closest('header');
      out.hdrTag = hc.closest('header') ? hc.closest('header').tagName : null;
      // body>header 直接父子？
      out.bodyChildHeader = !!document.querySelector('body > header');
      let n = hc, chain = [];
      for (let i = 0; i < 6 && n; i++) { chain.push(n.tagName.toLowerCase() + '.' + (typeof n.className === 'string' ? n.className.split(' ')[0] : '').slice(0, 22)); n = n.parentElement; }
      out.chain = chain;
    }
    return out;
  }, { js: APP_JS });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
