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
<span class="VmGLcq_summary" data-streaming="" id="s1"><span class="VmGLcq_summaryText" id="st1"><span id="tx1">scrutinizing specific code sections, especially the hand timeout heal function and its behaviour around lock acquisition</span></span></span>
</div></div>
</div></div></div></body></html>`;
(async () => {
  const b = await webkit.launch({ headless: true });
  const c = await b.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  await p.route('**/_ds.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  await p.goto('http://127.0.0.1:3083/_ds.html', { waitUntil: 'load' });
  await p.waitForTimeout(400);
  await p.evaluate(js => { try { (0, eval)(js); } catch (e) {} }, APP_JS);
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const g = (sel) => {
      const e = document.querySelector(sel); if (!e) return null;
      const cs = getComputedStyle(e); const rc = e.getBoundingClientRect();
      return { sel, w: Math.round(rc.width), h: Math.round(rc.height), top: Math.round(rc.top),
        disp: cs.display, ws: cs.whiteSpace, lh: cs.lineHeight, fs: cs.fontSize,
        pad: cs.padding, mar: cs.margin, ov: cs.overflow, bl: cs.boxSizing, va: cs.verticalAlign,
        flex: cs.flex, align: cs.alignItems, maxW: cs.maxWidth, minW: cs.minWidth,
        scrollH: e.scrollHeight, clientH: e.clientHeight, txt: (e.textContent||'').slice(0,20) };
    };
    const row = document.querySelector('#r1 .VmGLcq_row');
    const root = document.getElementById('r1');
    return {
      root: g('#r1'), row: g('#r1 .VmGLcq_row'),
      rowDisp: row ? getComputedStyle(row).display : null,
      rowCS: row ? { disp: getComputedStyle(row).display, h: Math.round(row.getBoundingClientRect().height), ws: getComputedStyle(row).whiteSpace } : null,
      summary: g('#s1'), summaryText: g('#st1'), text: g('#tx1')
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await p.screenshot({ path: DIR + '/_ds.png', clip: { x: 0, y: 0, width: 430, height: 120 } });
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
