const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;background:#151517;color:#eee;font-family:-apple-system,sans-serif}
.row{padding:2px 16px}
</style></head><body>
<div id="root">
<div data-mobile-nav="frame">
<div data-slot="conversation.chat.flow">
  <!-- 异常1：行距 10px < 字号 13px（截图形态） -->
  <div class="row"><span id="bad1" style="font-size:13px;line-height:10px;display:block">scrutinizing specific code sections, especially the hand timeout heal function</span></div>
  <!-- 异常2：长路径，行距 11px -->
  <div class="row"><span id="bad2" style="font-size:13px;line-height:11px;display:block">E://desktop//所有skill//qx-worklib//host32//msg_relay.py</span></div>
  <!-- 正常1：20px/13px -->
  <div class="row"><span id="ok1" style="font-size:13px;line-height:20px;display:block">potential data synchronization strategy</span></div>
  <!-- 正常2：16px/22px -->
  <div class="row"><span id="ok2" style="font-size:16px;line-height:22px;display:block">_save_lock_to_file</span></div>
  <!-- 正常3：line-height normal（非数值，必须跳过） -->
  <div class="row"><span id="ok3" style="font-size:13px;display:block">def _load_lock_from_file</span></div>
  <!-- 无文本容器（必须跳过） -->
  <div class="row"><div id="empty" style="line-height:8px"><span></span></div></div>
</div>
</div>
</div>
</body></html>`;
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  await p.route('**/_fx26.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  await p.goto('http://127.0.0.1:3083/_fx26.html', { waitUntil: 'load' });
  await p.waitForTimeout(300);
  await p.evaluate(js => { try { (0, eval)(js); } catch (e) { window.__err = e.message; } }, APP_JS);
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const g = id => { const e = document.getElementById(id); const cs = getComputedStyle(e); return { lh: cs.lineHeight, fs: cs.fontSize, mark: e.getAttribute('data-dsh-lh') }; };
    return {
      err: window.__err || null,
      bad1: g('bad1'), bad2: g('bad2'), ok1: g('ok1'), ok2: g('ok2'), ok3: g('ok3'),
      emptyLh: getComputedStyle(document.getElementById('empty')).lineHeight,
      cssTag: !!document.getElementById('dsh-ios-linefix'),
      cssText: (document.getElementById('dsh-ios-linefix') || {}).textContent || ''
    };
  });
  console.log(JSON.stringify(r, null, 1));
  // 断言
  const pass = [];
  pass.push(['bad1 修正为 20px', r.bad1.lh === '20px']);
  pass.push(['bad2 修正为 20px', r.bad2.lh === '20px']);
  pass.push(['ok1 未被改(20px)', r.ok1.lh === '20px']);
  pass.push(['ok2 未被改(22px)', r.ok2.lh === '22px']);
  pass.push(['ok3 跳过(normal)', r.ok3.mark === null]);
  pass.push(['空容器跳过', r.emptyLh === '8px']);
  pass.push(['shimmer CSS 已注入', r.cssTag && r.cssText.indexOf('content: none') >= 0]);
  pass.push(['text-size-adjust 已注入', r.cssText.indexOf('text-size-adjust') >= 0]);
  let fails = 0;
  for (const [k, v] of pass) { console.log((v ? 'PASS ' : 'FAIL ') + k); if (!v) fails++; }
  console.log('RESULT: ' + (pass.length - fails) + ' PASS / ' + fails + ' FAIL');
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
