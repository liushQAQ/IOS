const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;background:#151517;color:#eee;font-family:-apple-system,sans-serif}
.btns{display:inline-flex;border:1px solid #444;border-radius:8px;overflow:hidden}
.btns button{background:#2a2a2a;color:#eee;border:none;padding:6px 14px;font-size:14px}</style></head><body>
<div id="root"><div data-mobile-nav="frame">
<!-- 模拟顶栏路径行 -->
<div><span id="pathline">E://desktop//所有skill//deepseek-harness-desktop//PadHarness-v1.0.71-public.tipa</span></div>
<!-- 模拟不可预览占位 -->
<div class="previewArea">
  <div class="ph" style="text-align:center;padding:40px 0">
    <div style="width:44px;height:44px;background:#555;margin:0 auto"></div>
    <div id="phText">该格式文件暂时无法预览</div>
    <div class="btns"><button data-open-target="wps" id="openBtn">打开</button><button>▾</button></div>
  </div>
</div>
</div></div></body></html>`;
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  // mock 原生桥 + api/file
  await p.addInitScript(() => {
    window.__nativeCalls = [];
    Object.defineProperty(window, 'webkit', { value: { messageHandlers: { dshFileTransfer: { postMessage: (m) => window.__nativeCalls.push(['share', m && m.name]) } } }, configurable: true });
  });
  await p.route('**/api/file*', r => r.fulfill({ status: 200, contentType: 'application/octet-stream', headers: { 'content-disposition': 'attachment' }, body: 'PK\x03\x04FAKE' }));
  let alertText = '';
  p.on('dialog', async d => { alertText = d.message(); await d.dismiss(); });
  await p.route('**/_fo.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  await p.goto('http://127.0.0.1:3083/_fo.html', { waitUntil: 'load' });
  await p.waitForTimeout(300);
  await p.evaluate(js => { try { (0, eval)(js); } catch (e) { window.__err = e.message; } }, APP_JS);
  await p.waitForTimeout(2200);
  const r1 = await p.evaluate(() => ({
    err: window.__err || null,
    saveBtn: !!document.querySelector('.dsh-mobile-save-file-btn'),
    saveBtnText: (document.querySelector('.dsh-mobile-save-file-btn') || {}).textContent || ''
  }));
  // 点「打开」
  await p.click('#openBtn');
  await p.waitForTimeout(2500);
  const r2 = await p.evaluate(() => ({ calls: window.__nativeCalls }));
  console.log(JSON.stringify({ ...r1, afterOpen: r2, alertText }, null, 1));
  const pass = [
    ['保存按钮已注入(文本锚)', r1.saveBtn && r1.saveBtnText.indexOf('保存') >= 0],
    ['点「打开」无拦截弹窗', alertText === ''],
    ['调起原生分享(文件名正确)', (r2.calls || []).some(x => x[0] === 'share' && String(x[1]).indexOf('PadHarness') >= 0)]
  ];
  let f = 0; for (const [k, v] of pass) { console.log((v ? 'PASS ' : 'FAIL ') + k); if (!v) f++; }
  console.log('RESULT: ' + (pass.length - f) + '/' + pass.length);
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
