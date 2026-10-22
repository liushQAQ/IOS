const { webkit } = require('playwright');
const fs = require('fs');
const DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag';
const CHAT_CSS = fs.readFileSync(DIR + '/chat_all_css.css', 'utf8');
const APP_JS = fs.readFileSync(DIR + '/app_inject.js', 'utf8');
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>:root{--dsw-alias-bg-base:#151517;--dsw-alias-label-primary:#e9effb;--dsw-alias-label-secondary:#b5c3dc;--dsw-alias-label-caption:#8595b1;--dsh-content-font-size-secondary:13px;--dsh-content-font-delta-secondary:0px;--dsh-content-font-delta:0px;--dsw-font-family:-apple-system,sans-serif;color-scheme:dark}
body{margin:0;background:#151517;color:#e9effb;font-family:-apple-system,sans-serif}</style>
<style>${CHAT_CSS}</style></head><body>
<div id="root"><div data-mobile-nav="frame"><div class="wrap" style="padding:10px 16px" data-slot="conversation.chat.flow">
<div class="VmGLcq_root" data-variant="think" data-state="running" data-preview="" id="r1">
<div class="VmGLcq_row"><span class="VmGLcq_leading">I</span><span class="VmGLcq_title">思考</span><span class="VmGLcq_separator"></span>
<span class="VmGLcq_summary" data-streaming="" id="s1"><span class="VmGLcq_summaryText" id="st1">scrutinizing specific code sections, especially the hand timeout heal function and its behaviour around lock acquisition path</span></span>
</div></div>
<div class="VmGLcq_root" data-variant="think" data-state="ok" data-preview="" id="r2">
<div class="VmGLcq_row"><span class="VmGLcq_leading">I</span><span class="VmGLcq_title">读取</span><span class="VmGLcq_separator"></span>
<span class="VmGLcq_summary" id="s2"><span class="VmGLcq_summaryText" id="st2">E://desktop//所有skill//qx-worklib//host32//msg_relay.py</span></span>
</div></div>
</div></div></div></body></html>`;
const VARIANTS = {
  base: '',
  inlineBlock: `[data-variant="think"] [class*="_summary"], [data-variant="others"] [class*="_summary"] {
    display: inline-block !important; max-height: 20px !important; overflow: hidden !important;
    vertical-align: middle !important; max-width: 100% !important; text-overflow: ellipsis !important; white-space: nowrap !important; }`,
  rowFlex: `[data-variant="think"] [class*="_row"], [data-variant="others"] [class*="_row"] {
    display: flex !important; align-items: center !important; }
    [data-variant="think"][data-preview]:not([data-expanded]), [data-variant="others"][data-preview]:not([data-expanded]) {
    height: 24px !important; }`,
  flexPlusOverflow: `[data-variant="think"] [class*="_row"], [data-variant="others"] [class*="_row"] {
    display: flex !important; align-items: center !important; overflow: hidden !important; }
    [data-variant="think"][data-preview]:not([data-expanded]), [data-variant="others"][data-preview]:not([data-expanded]) {
    height: 24px !important; contain: none !important; }
    [data-variant="think"] [class*="_summary"], [data-variant="others"] [class*="_summary"],
    [data-variant="think"] [class*="_summaryText"], [data-variant="others"] [class*="_summaryText"] {
    min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }`
};
(async () => {
  const b = await webkit.launch({ headless: true });
  for (const [name, css] of Object.entries(VARIANTS)) {
    const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
    const p = await c.newPage();
    await p.route('**/_ts.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
    await p.goto('http://127.0.0.1:3083/_ts.html', { waitUntil: 'load' });
    await p.waitForTimeout(300);
    await p.evaluate(js => { try { (0, eval)(js); } catch (e) {} }, APP_JS);   // 已含第5条(行盒 auto)
    await p.waitForTimeout(1200);
    if (css) await p.evaluate(x => { const s = document.createElement('style'); s.textContent = x; document.head.appendChild(s); }, css);
    await p.waitForTimeout(500);
    const m = await p.evaluate(() => {
      const g = id => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right), disp: cs.display, lh: cs.lineHeight }; };
      return { r1: g('r1'), s1: g('s1'), st1: g('st1'), r2: g('r2'), s2: g('s2'),
        rowPos: (() => { const rr = document.getElementById('r1').querySelector('[class*="_row"]').getBoundingClientRect(); return { top: Math.round(rr.top), h: Math.round(rr.height) }; })() };
    });
    console.log('[' + name + ']', JSON.stringify(m));
    await p.screenshot({ path: DIR + '/_ts_' + name + '.png', clip: { x: 0, y: 0, width: 430, height: 100 } });
    await c.close();
  }
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
