const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const CHAT_CSS = fs.readFileSync(DIR + '/chat_all_css.css', 'utf8');
const APP_CSS = fs.readFileSync(DIR + '/app_inject.css', 'utf8');
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
:root{--dsw-alias-bg-base:#151517;--dsw-alias-label-primary:#e9effb;--dsw-alias-label-secondary:#b5c3dc;--dsw-alias-label-caption:#8595b1;--dsw-alias-border-l1:#33456a;--dsh-content-font-size-secondary:13px;--dsh-content-font-delta-secondary:0px;--dsh-content-font-delta:0px;--dsw-font-family:-apple-system,sans-serif;--dsw-alias-bg-layer-1:#10151d;--dsw-alias-markdown-code-block:#1a2130;color-scheme:dark}
body{margin:0;background:#151517;color:#e9effb;font-family:-apple-system,sans-serif;font-size:14px}
.wrap{padding:12px 16px}
.step{margin-bottom:2px}
.ico{display:inline-flex;width:18px;height:18px;background:#333;border-radius:4px;vertical-align:middle}
</style>
<style>${CHAT_CSS}</style>
</head><body><div class="wrap" data-slot="conversation.chat.flow">

<div class="VmGLcq_root" data-variant="think" data-state="running" data-preview="" style="margin-bottom:2px">
<div class="VmGLcq_row">
<span class="VmGLcq_leading"><svg width="14" height="14"><rect width="14" height="14" fill="#5b9bff"/></svg></span>
<span class="VmGLcq_title">思考</span>
<span class="VmGLcq_separator" data-shimmer-decoration=""></span>
<span class="VmGLcq_summary" data-streaming=""><span class="VmGLcq_summaryText"><span>scrutinizing specific code sections, especially the \`_hand_timeout\` heal\` function and its behaviour around the lock acquisition path in msg_relay</span></span></span>
</div>
</div>

<div class="VmGLcq_root" data-variant="think" data-state="ok" data-preview="" style="margin-bottom:2px">
<div class="VmGLcq_row">
<span class="VmGLcq_leading"><svg width="14" height="14"><rect width="14" height="14" fill="#888"/></svg></span>
<span class="VmGLcq_title">读取</span>
<span class="VmGLcq_separator" data-shimmer-decoration=""></span>
<span class="VmGLcq_summary"><span class="VmGLcq_summaryText"><span>E://desktop//所有skill//qx-worklib//host32//msg_relay.py 非常长的路径文本应当单行截断而不换行否则就是bug</span></span></span>
</div>
</div>

<div class="VmGLcq_root" data-variant="think" data-state="running" data-preview="" style="margin-bottom:2px">
<div class="VmGLcq_row">
<span class="VmGLcq_leading"><svg width="14" height="14"><rect width="14" height="14" fill="#5b9bff"/></svg></span>
<span class="VmGLcq_title">思考</span>
<span class="VmGLcq_separator" data-shimmer-decoration=""></span>
<span class="VmGLcq_summary" data-streaming=""><span class="VmGLcq_summaryText"><span>potential data synchronization strategy. The code prioritizes SH_TASK_STATE but falls back to the lock file when the task state is missing entirely</span></span></span>
</div>
</div>

</div></body></html>`;
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p = await c.newPage();
  await p.route('**/repro.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  await p.goto('http://127.0.0.1:3083/repro.html', { waitUntil: 'load' });
  await p.waitForTimeout(800);
  await p.screenshot({ path: DIR + '/_repro_ov.png' });
  const info = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('.VmGLcq_root')).map(r => {
      const s = r.querySelector('.VmGLcq_summary');
      const st = r.querySelector('.VmGLcq_summaryText');
      const sr = s.getBoundingClientRect(), rr = r.querySelector('.VmGLcq_row').getBoundingClientRect();
      return { rowH: Math.round(rr.height), sumH: Math.round(sr.height), ws: getComputedStyle(s).whiteSpace, oh: getComputedStyle(s).overflow, txt: (s.textContent || '').slice(0, 24) };
    });
  });
  console.log(JSON.stringify(info, null, 1));
  // 再注入 App CSS 看有没有变化
  await p.evaluate(css => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }, APP_CSS);
  await p.waitForTimeout(400);
  await p.screenshot({ path: DIR + '/_repro_ov_appcss.png' });
  const info2 = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('.VmGLcq_root')).map(r => {
      const s = r.querySelector('.VmGLcq_summary');
      return { rowH: Math.round(r.querySelector('.VmGLcq_row').getBoundingClientRect().height), ws: getComputedStyle(s).whiteSpace };
    });
  });
  console.log('AFTER APP CSS:', JSON.stringify(info2));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
