/* v1.0.129 整页滚动锁验证
   ① DSH 页：注入新探针 shim（addInitScript，等价 WKUserScript .atDocumentStart）
      → 断言 html/body 被固定、文档不可滚、塞入 3000px 高内容后顶栏位置仍不变、scrollTo 无效
   ② 外部页（伪造 external.test）：同一探针 shim 必须零命中 → 无锁样式、可正常滚动
*/
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;

// 从 Swift 源码里抽第 1 条 shim（v1.0.129 探针），做反转义
const src = fs.readFileSync(path.join(DIR, '..', 'DSHios', 'ViewController.swift'), 'utf8').split(/\r?\n/);
function unescape(s) {
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const n = s[i + 1];
      if (n === '\\') { out += '\\'; i += 2; continue; }
      if (n === '"') { out += '"'; i += 2; continue; }
      if (n === 'n') { out += '\n'; i += 2; continue; }
      if (n === 't') { out += '\t'; i += 2; continue; }
      out += c; i++; continue;
    }
    out += c; i++;
  }
  return out;
}
let probe = null, inB = false, buf = [], startLine = 0;
for (let i = 0; i < src.length; i++) {
  const t = src[i].trim();
  if (!inB && t === '"""' && src[i].includes('"""') && i > 440 && i < 500) { inB = true; buf = []; startLine = i + 2; continue; }
  if (inB) { if (t === '""",') { probe = unescape(buf.join('\n')); break; } buf.push(src[i]); }
}
if (!probe) { console.error('未抽到探针 shim'); process.exit(1); }
console.log('探针 shim 抽取成功 L' + startLine + '，' + probe.length + 'B');

const APP_CSS = fs.readFileSync(path.join(DIR, 'app_inject.css'), 'utf8')
  .split('\n').filter(l => !/^\/\* RAW: \*\//.test(l) && !/^\/\* RAW: .*\/\*$/.test(l)).join('\n');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';

const chk = (ok, label, extra) => console.log((ok ? '✅ ' : '❌ ') + label + (extra ? '  [' + extra + ']' : ''));
let fail = 0;
const expect = (ok, label, extra) => { if (!ok) fail++; chk(ok, label, extra); };

(async () => {
  const b = await webkit.launch({ headless: true });

  /* ---------- ① DSH 页 ---------- */
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA, colorScheme: 'dark' });
  await c.addInitScript(probe);   // 关键：等价于 WKUserScript atDocumentStart
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:3083/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => document.body && document.body.querySelectorAll('*').length > 60, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(7000);
  await p.evaluate((css) => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }, APP_CSS);
  await p.waitForTimeout(1000);

  const lockState = await p.evaluate(() => {
    const de = document.documentElement;
    const cs = getComputedStyle(document.body);
    return {
      lockStyle: !!document.getElementById('dsh-ios-scroll-lock'),
      bodyPos: cs.position, bodyOy: cs.overflowY, htmlOy: getComputedStyle(de).overflowY,
      docSH: de.scrollHeight, ih: innerHeight
    };
  });
  expect(lockState.lockStyle, 'DSH 页：探针已注入页面锁样式');
  expect(lockState.bodyPos === 'fixed', 'DSH 页：body 被固定（整页不可滚）', 'position=' + lockState.bodyPos);
  expect(lockState.bodyOy === 'hidden', 'DSH 页：body overflow hidden', 'overflow-y=' + lockState.bodyOy);

  // 塞入 3000px 高内容，模拟 48 轮长会话撑高页面
  const after = await p.evaluate(() => {
    const col = document.querySelector('[class*="centerCol"]') || document.body;
    const tall = document.createElement('div');
    tall.id = '__tall';
    tall.style.cssText = 'height:3000px;width:1px;flex:0 0 auto;';
    col.appendChild(tall);
    const hdr = document.querySelector('[data-mobile-nav="frame"] header');
    const top0 = hdr ? Math.round(hdr.getBoundingClientRect().top) : null;
    window.scrollTo(0, 400);
    document.documentElement.scrollTop = 400;
    document.body.scrollTop = 400;
    // 内部容器滚它自己的
    const sc = document.querySelector('[class*="scrollBody"]');
    if (sc) sc.scrollTop = 300;
    const de = document.documentElement;
    const top1 = hdr ? Math.round(hdr.getBoundingClientRect().top) : null;
    return { top0, top1, docTop: de.scrollTop, winY: window.scrollY, docSH: de.scrollHeight, ih: innerHeight, innerScrolled: sc ? sc.scrollTop : null };
  });
  expect(after.docTop === 0 && after.winY === 0, 'DSH 页：页面塞 3000px 内容后 window 滚不动', 'docTop=' + after.docTop + ' winY=' + after.winY);
  expect(after.top0 !== null && after.top0 === after.top1, 'DSH 页：顶栏位置纹丝不动', 'top ' + after.top0 + ' → ' + after.top1 + 'pt');
  await p.screenshot({ path: path.join(DIR, 'lock_dsh.png'), clip: { x: 0, y: 0, width: 430, height: 240 } });
  await c.close();

  /* ---------- ② 外部页（伪造域名）---------- */
  const c2 = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  await c2.addInitScript(probe);
  await c2.route('**/*', (route) => {
    route.fulfill({
      status: 200, contentType: 'text/html; charset=utf-8',
      body: '<html><head><meta name="viewport" content="width=device-width"><style>body{margin:0}#root{height:4000px;background:#eee}</style></head><body><div id="root"><h1>外部仪表盘</h1></div></body></html>'
    });
  });
  const p2 = await c2.newPage();
  await p2.goto('http://external.test/', { waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await p2.waitForTimeout(2500);
  const ext = await p2.evaluate(() => {
    const de = document.documentElement;
    const se = document.scrollingElement || de;
    window.scrollTo(0, 500);
    return {
      lockStyle: !!document.getElementById('dsh-ios-scroll-lock'),
      bodyPos: getComputedStyle(document.body).position,
      docTop: de.scrollTop, seTop: se.scrollTop, winY: window.scrollY,
      maxScroll: (se.scrollHeight - se.clientHeight)
    };
  });
  expect(!ext.lockStyle, '外部页：零锁样式注入');
  expect(ext.bodyPos !== 'fixed', '外部页：body 未被固定', 'position=' + ext.bodyPos);
  expect(ext.maxScroll > 100 && (ext.winY > 0 || ext.seTop > 0), '外部页：可正常上下滚（放行）',
    'winY=' + ext.winY + ' seTop=' + ext.seTop + ' maxScroll=' + ext.maxScroll);
  await c2.close();

  await b.close();
  console.log(fail === 0 ? '\n===== 全部通过 =====' : '\n===== 失败 ' + fail + ' 条 =====');
  process.exit(fail === 0 ? 0 : 1);
})();
