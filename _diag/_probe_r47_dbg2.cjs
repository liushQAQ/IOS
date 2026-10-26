/* R47 调试 v2：真实通道验证——eval bundle 第一段（CSS 数组+attach 所在块），
 * 查 CSSOM 里 headerCorner absolute 规则是否注册、computed position 是否生效 */
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
  const blocks = APP_JS.split('\n;\n');
  console.log('blocks=' + blocks.length + ' firstLen=' + blocks[0].length + ' firstHasArray=' + /headerCorner/.test(blocks[0]));
  const r = await p.evaluate(({ js }) => {
    const out = {};
    const firstBlock = js.split('\n;\n').slice(0, 2).join('\n;\n');
    try { (0, eval)(firstBlock); } catch (e) { out.err = String(e).slice(0, 160); }
    document.documentElement.style.setProperty('--dsh-sb-native', '59px');
    document.documentElement.style.setProperty('--dsh-statusbar', '59px');
    out.styleIn = !!document.getElementById('dsh-ios-glass-enhancement');
    let hits = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const rule of rules) {
        if (rule.selectorText && /headerCorner/.test(rule.selectorText) && rule.style && rule.style.position === 'absolute') hits.push(rule.selectorText.slice(0, 90));
      }
    }
    out.cssomHits = hits;
    const hc = document.querySelector('[class*="headerCorner"]');
    out.hcPos = hc ? getComputedStyle(hc).position : null;
    const db = document.querySelector('header button[aria-label="打开右侧边栏"], header button[aria-label="收起右侧边栏"]');
    if (db) { const rr = db.getBoundingClientRect(); out.btn = [Math.round(rr.left), Math.round(rr.right)]; }
    out.vw = window.innerWidth;
    return out;
  }, { js: APP_JS });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
