const { webkit } = require('playwright');
const fs = require('fs');
const PAGE = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/verify_fileopen.js', 'utf8').match(/const PAGE = `([\s\S]*?)`;/)[1];
const APP_JS = fs.readFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/app_inject.js', 'utf8');
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 } });
  const p = await c.newPage();
  p.on('console', m => { const t = m.text(); console.log('PAGE[' + m.type() + ']:', t.slice(0, 220)); });
  await p.route('**/_x.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  await p.goto('http://127.0.0.1:3083/_x.html', { waitUntil: 'load' });
  await p.waitForTimeout(200);
  const probe = await p.evaluate(() => {
    const out = { phFound: false, phParent: null, btnAfter: false };
    const els = document.querySelectorAll('div, span');
    for (let j = 0; j < els.length && j < 3000; j++) {
      if (els[j].children.length !== 0) continue;
      const t = (els[j].textContent || '').trim();
      if (t === '该格式文件暂时无法预览') { out.phFound = true; out.phParent = els[j].parentElement ? els[j].parentElement.className : null; break; }
    }
    return out;
  });
  console.log('PRE:', JSON.stringify(probe));
  await p.evaluate(js => { try { (0, eval)(js); } catch (e) { console.log('INJECT_ERR', e.message); } }, APP_JS);
  await p.waitForTimeout(2500);
  const post = await p.evaluate(() => ({ btn: !!document.querySelector('.dsh-mobile-save-file-btn'), injected: !!window.__dshDownloadBridgeInjected }));
  console.log('POST:', JSON.stringify(post));
  await b.close();
})().catch(e => { console.error('ERR', e.message); });
