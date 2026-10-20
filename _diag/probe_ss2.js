const { webkit } = require('playwright');
const fs = require('fs'), path = require('path');
const APP_JS = fs.readFileSync(path.join('E:/desktop/所有skill/deepseek-harness-ios/_diag','app_inject.js'),'utf8');
function ex(t){const s=new Set();const re=/\[class[\^*$]?=\\?["']([^"'\\]+)\\?["']\]/g;let m;while((m=re.exec(t))!==null){const v=m[1];if(v&&v.length>=3&&!/^[\d\s]+$/.test(v))s.add(v);}return Array.from(s);}
const ANCHORS = ex(APP_JS);
const SCAN = () => {
  const sheets = [];
  for (const s of document.styleSheets) {
    let txt = '';
    try { for (const ru of s.cssRules) txt += ru.cssText + '\n'; } catch (e) {}
    if (!txt) continue;
    sheets.push({ own: txt.indexOf('[class*=') >= 0 || txt.indexOf('[class^=') >= 0 || txt.indexOf('[class$=') >= 0, len: txt.length, txt: txt.slice(0,0) , href: s.href || '(inline)'});
    if (!sheets[sheets.length-1].own) window.__dshCss = (window.__dshCss||'') + txt;
  }
  const domCls = new Set();
  document.querySelectorAll('*').forEach(el => { const cn = el.getAttribute('class'); if (cn) cn.split(/\s+/).forEach(x=>{if(x)domCls.add(x);}); });
  return { n: sheets.length, ownN: sheets.filter(s=>s.own).length, cssLen: (window.__dshCss||'').length, domCls: Array.from(domCls) };
};
(async () => {
  const b = await webkit.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, colorScheme: 'dark' })).newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(3500);
  const r = await p.evaluate(SCAN);
  const css = await p.evaluate(() => window.__dshCss || '');
  console.log('样式表 ' + r.n + ' 张, 判为自家 ' + r.ownN + ' 张, 剩余规则文本 ' + r.cssLen + ' 字符, DOM 类名 ' + r.domCls.length);
  const rows = ANCHORS.map(a => ({ a, css: css.indexOf(a) >= 0, dom: r.domCls.some(x => x.indexOf(a) >= 0) }));
  const dead = rows.filter(x => !x.css && !x.dom);
  console.log('锚点 ' + ANCHORS.length + ' | CSS在 ' + rows.filter(x=>x.css).length + ' | DOM在 ' + rows.filter(x=>x.dom).length + ' | 双无 ' + dead.length);
  console.log('双无清单: ' + dead.map(x=>x.a).join(' , '));
  await b.close();
})();
