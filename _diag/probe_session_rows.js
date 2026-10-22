const { webkit } = require('playwright');
const { spawn } = require('child_process');
const NODE = 'C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-6/node.exe';
const COLLECTOR = 'E:/desktop/所有skill/deepseek-harness-ios/_diag/shimmer_collector.cjs';

const INIT = `
(function () {
  if (window.__dshRowProbe2) return;
  window.__dshRowProbe2 = true;
  function send(data) {
    try {
      const s = JSON.stringify(data);
      if (navigator.sendBeacon) navigator.sendBeacon('http://127.0.0.1:31899/log', s);
      fetch('http://127.0.0.1:31899/log', { method: 'POST', body: s, keepalive: true }).catch(function(){});
    } catch (e) {}
  }
  function deepScan(tag) {
    try {
      const rows = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      let n, count = 0;
      while ((n = walker.nextNode()) && count < 500) {
        count++;
        const t = (n.textContent || '').trim();
        if (!t || !/^(运行命令|思考|工具调用|搜索|读取|写入|编辑|代码)/.test(t)) continue;
        const span = n.parentElement;
        if (!span || seen.has(span)) continue;
        seen.add(span);
        const r = span.getBoundingClientRect();
        if (r.width === 0) continue;
        const chain = [];
        let el = span;
        for (let i = 0; i < 7 && el && el !== document.body; i++) {
          const cc = getComputedStyle(el);
          const b = el.getBoundingClientRect();
          chain.push([el.tagName, String(el.className).slice(0, 55), 'h' + b.height.toFixed(0), 'w' + b.width.toFixed(0),
            'ws:' + cc.whiteSpace, 'ov:' + cc.overflow, 'to:' + cc.textOverflow, 'lh:' + cc.lineHeight, 'fs:' + cc.fontSize,
            cc.display + '/' + cc.position, 'ch:' + cc.height, 'mh:' + cc.maxHeight].join(' '));
          el = el.parentElement;
        }
        rows.push({ t: t.slice(0, 60), h: +r.height.toFixed(1), w: +r.width.toFixed(1), chain });
        if (rows.length >= 20) break;
      }
      if (!rows.length) return false;
      rows.sort(function (a, b) { return b.h - a.h; });
      send({ tag: tag, ts: Date.now(), top: rows });
      return true;
    } catch (e) { send({ err: String(e) }); return false; }
  }
  // auto-navigate: sidebar -> session
  let phase = 0;
  function nav() {
    try {
      if (phase === 0) {
        const btns = [...document.querySelectorAll('button')];
        let best = null;
        for (const b of btns) {
          const r = b.getBoundingClientRect();
          if (r.top < 80 && r.left < 80 && r.width > 0) { if (!best || r.left < best._l) { b._l = r.left; best = b; } }
        }
        if (best) { best.click(); phase = 1; }
      } else if (phase === 1) {
        const els = [...document.querySelectorAll('a,button,[role="button"],li,div')];
        for (const el of els) {
          const t = (el.innerText || '').trim();
          if (t.startsWith('Our Free Model 更新')) { el.click(); phase = 2; break; }
        }
        if (phase === 2) send({ nav: 'session-clicked', ts: Date.now() });
      } else if (phase === 2) {
        if (deepScan('after-session')) phase = 3;
      } else if (phase === 3) {
        deepScan('t+' + (Date.now() % 100000));
        phase = 4;
      } else if (phase === 4) {
        deepScan('t2');
        phase = 5;
      }
    } catch (e) {}
  }
  setInterval(nav, 700);
})();
`;

(async () => {
  const collector = spawn(NODE, [COLLECTOR], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:3083/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  // no more evaluate calls at all
  await page.waitForTimeout(60000);
  await browser.close().catch(() => {});
  collector.kill();
  console.log('done');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
