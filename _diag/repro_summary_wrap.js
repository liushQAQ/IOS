const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const CHAT_CSS = fs.readFileSync(DIR + '/chat_all_css.css', 'utf8');
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');

const ROWS = `
<div class="VmGLcq_root" data-variant="think" data-state="running" data-preview="" id="r1">
<div class="VmGLcq_row"><span class="VmGLcq_leading">I</span><span class="VmGLcq_title">思考</span>
<span class="VmGLcq_separator"></span>
<span class="VmGLcq_summary" data-streaming=""><span class="VmGLcq_summaryText"><span>scrutinizing specific code sections, especially the hand timeout heal function and its behaviour around lock acquisition</span></span></span></div>
</div>
<div class="VmGLcq_root" data-variant="think" data-state="ok" data-preview="" id="r2">
<div class="VmGLcq_row"><span class="VmGLcq_leading">I</span><span class="VmGLcq_title">读取</span>
<span class="VmGLcq_separator"></span>
<span class="VmGLcq_summary"><span class="VmGLcq_summaryText"><span>E://desktop//所有skill//qx-worklib//host32//msg_relay.py</span></span></span></div>
</div>
<div class="VmGLcq_root" data-variant="think" data-state="running" data-preview="" id="r3">
<div class="VmGLcq_row"><span class="VmGLcq_leading">I</span><span class="VmGLcq_title">思考</span>
<span class="VmGLcq_separator"></span>
<span class="VmGLcq_summary" data-streaming=""><span class="VmGLcq_summaryText"><span>potential data synchronization strategy. The code prioritizes SH_TASK_STATE but falls back</span></span></span></div>
</div>`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--dsw-alias-bg-base:#151517;--dsw-alias-label-primary:#e9effb;--dsw-alias-label-secondary:#b5c3dc;--dsw-alias-label-caption:#8595b1;--dsw-alias-label-tertiary:#8595b1;--dsw-alias-border-l1:#33456a;--dsh-content-font-size-secondary:13px;--dsh-content-font-delta-secondary:0px;--dsh-content-font-delta:0px;--dsw-font-family:-apple-system,sans-serif;color-scheme:dark}
body{margin:0;background:#151517;color:#e9effb;font-family:-apple-system,sans-serif}
.wrap{padding:10px 16px}
</style>
<style id="official">${CHAT_CSS}</style>
</head><body>
<div id="root"><div data-mobile-nav="frame">
<div class="wrap" data-slot="conversation.chat.flow">${ROWS}</div>
</div></div>
</body></html>`;

const OLD_CSS = `pre,[class*="_text_"],[class*="_summary"]{white-space:pre-wrap !important}`;

async function measure(p) {
  return await p.evaluate(() => {
    const out = [];
    ['r1', 'r2', 'r3'].forEach(id => {
      const root = document.getElementById(id);
      const summ = root.querySelector('[class*="_summary"]');
      const rr = root.getBoundingClientRect();
      const sr = summ.getBoundingClientRect();
      out.push({
        id,
        rootH: Math.round(rr.height),
        rootTop: Math.round(rr.top),
        sumH: Math.round(sr.height),
        sumScrollH: summ.scrollHeight,
        ws: getComputedStyle(summ).whiteSpace,
        overflowY: Math.round(sr.bottom) - Math.round(rr.bottom),
        textOverflow: getComputedStyle(summ).overflow
      });
    });
    const flow = document.querySelector('[data-slot="conversation.chat.flow"]');
    return { flowH: Math.round(flow.getBoundingClientRect().height), rows: out };
  });
}

(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  await p.route('**/_rw.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));

  // A) 官方原样
  await p.goto('http://127.0.0.1:3083/_rw.html', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const A = await measure(p);
  await p.screenshot({ path: DIR + '/_rw_A_official.png', clip: { x: 0, y: 0, width: 430, height: 160 } });

  // B) 叠加旧注入的 pre-wrap 规则（复现真机叠印）
  await p.evaluate(css => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }, OLD_CSS);
  await p.waitForTimeout(300);
  const B = await measure(p);
  await p.screenshot({ path: DIR + '/_rw_B_oldprewrap.png', clip: { x: 0, y: 0, width: 430, height: 160 } });

  // C) 再注入新版全量 App JS（修复后）
  await p.evaluate(js => { try { (0, eval)(js); } catch (e) { window.__e = e.message; } }, APP_JS);
  await p.waitForTimeout(1500);
  const C = await measure(p);
  await p.screenshot({ path: DIR + '/_rw_C_fixed.png', clip: { x: 0, y: 0, width: 430, height: 160 } });
  console.log('JSERR:', await p.evaluate(() => window.__e || null));

  console.log('A 官方原样:', JSON.stringify(A));
  console.log('B 旧注入(pre-wrap):', JSON.stringify(B));
  console.log('C 新注入(修复):', JSON.stringify(C));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
