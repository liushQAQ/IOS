/* 锚点体检「权威判定」探针
   问题：regression.js 里 A_ANCHORS 拿默认态 DOM 命中数当判据，
   但 134 个锚点里有大量指向弹窗/菜单/浮层（viewOptionsMenu / modal / popup / _portal_），
   默认态本来就不存在 —— 这不是失效，是取样点错了。

   真正的判据：该锚点子串是否还出现在 DSH 实际加载的 CSS/JS 资源文本里。
   资源里没有 → DSH 改了类名 → 我们的 [class*="xxx"] 必然永久失效（这才是要报警的）。
   资源里有、默认态 DOM 没有 → 惰性组件，正常。

   同时把「自家锚点」分离出来：dsh-/shield-/gear 等是 dsh-anywhere 与 App 自己注入的，
   不该拿 DSH 资源去校验。 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const URL = 'http://127.0.0.1:3083/';
const APP_JS = fs.readFileSync(path.join(DIR, 'app_inject.js'), 'utf8');

function extractAnchors(cssText) {
  const set = new Set();
  const re = /\[class[\^*$]?=\\?["']([^"'\\]+)\\?["']\]/g;
  let m;
  while ((m = re.exec(cssText)) !== null) {
    const v = m[1];
    if (v && v.length >= 3 && !/^[\d\s]+$/.test(v)) set.add(v);
  }
  return Array.from(set);
}

const HARVEST = async () => {
  const urls = performance.getEntriesByType('resource')
    .map(r => r.name)
    .filter(u => /\.(js|css|mjs)(\?|$)/.test(u));
  let txt = '';
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: 'force-cache' });
      txt += await r.text();
    } catch (e) {}
  }
  const domCls = new Set();
  document.querySelectorAll('*').forEach(el => {
    const cn = el.getAttribute('class');
    if (cn) cn.split(/\s+/).forEach(x => { if (x) domCls.add(x); });
  });
  return { n: urls.length, len: txt.length, txt, domCls: Array.from(domCls) };
};

(async () => {
  const anchors = extractAnchors(APP_JS);
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true });
  const p = await c.newPage();
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(3000);
  const h = await p.evaluate(HARVEST);

  const own = /^(dsh-|shield-|cm-|sm-|ios-|wb-)/;
  const rows = [];
  for (const a of anchors) {
    const inRes = h.txt.indexOf(a) >= 0;
    const inDom = h.domCls.some(x => x.indexOf(a) >= 0);
    rows.push({ a, inRes, inDom, self: own.test(a) });
  }
  const dead = rows.filter(r => !r.self && !r.inRes);
  const lazy = rows.filter(r => !r.self && r.inRes && !r.inDom);
  const live = rows.filter(r => !r.self && r.inRes && r.inDom);
  const mine = rows.filter(r => r.self);

  console.log('资源 ' + h.n + ' 个, 文本 ' + h.len + ' 字符, DOM 类名 ' + h.domCls.length + ' 个');
  console.log('锚点总数 ' + anchors.length);
  console.log('  ✅ 资源在+DOM在  ' + live.length + '  (常驻)');
  console.log('  ⚪ 资源在+DOM无  ' + lazy.length + '  (惰性弹窗/菜单/浮层, 正常)');
  console.log('  🔴 资源里都没有  ' + dead.length + '  (真失效)');
  console.log('  🔵 自家注入锚点  ' + mine.length + '  (不参与 DSH 校验)');

  if (dead.length) {
    console.log('\n--- 资源里彻底消失的锚点 ---');
    dead.forEach(r => console.log('  ' + r.a + '   domHit=' + r.inDom));
  }
  if (lazy.length) {
    console.log('\n--- 惰性锚点（资源在、默认态无）---');
    console.log('  ' + lazy.map(r => r.a).join(' , '));
  }
  if (mine.length) {
    console.log('\n--- 自家锚点 ---');
    console.log('  ' + mine.map(r => r.a + (r.inDom ? '✓' : '✗')).join(' , '));
  }
  fs.writeFileSync(path.join(DIR, 'anchor_audit.json'), JSON.stringify({ total: anchors.length, live: live.length, lazy: lazy.length, dead: dead.map(r => r.a), mine: mine.map(r => r.a), deadInDom: dead.filter(r => r.inDom).map(r => r.a) }, null, 2), 'utf8');
  await b.close();
})();
