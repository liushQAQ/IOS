// 9009 仪表盘滚动取证：注入 App 全部 shim，看注入哪条样式 + 页面是否真的不能滚
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9401;
const TARGET = process.argv[2] || 'http://127.0.0.1:9009/';
const SHIM_MODE = process.argv[3] || 'all';
const SHIM_DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_shims';
const UD = 'E:/desktop/所有skill/deepseek-harness-ios/_diag/ud9009';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shimFiles() {
  return fs.readdirSync(SHIM_DIR).filter((f) => /^shim_\d+\.js$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
}

async function waitDevtools() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const j = await r.json(); if (j && j.length) return j; } } catch (e) {}
    await sleep(250);
  }
  return null;
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && c.pending.has(msg.id)) { const r = c.pending.get(msg.id); c.pending.delete(msg.id); r(msg.result); }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res) => { this.pending.set(id, res); this.ws.send(JSON.stringify({ id, method, params })); });
  }
}

(async () => {
  try { fs.rmSync(UD, { recursive: true, force: true }); } catch (e) {}
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${UD}`, '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });
  const tabs = await waitDevtools();
  if (!tabs) { console.log('EDGE_NOT_READY'); try { child.kill(); } catch (e) {} process.exit(1); }
  const page = tabs.find((t) => t.type === 'page') || tabs[0];
  const cdp = await CDP.connect(page.webSocketDebuggerUrl);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  let injected = 0;
  if (SHIM_MODE !== 'none') {
    for (const f of shimFiles()) {
      const src = fs.readFileSync(path.join(SHIM_DIR, f), 'utf8');
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: src });
      injected++;
    }
  }
  console.log('注入 shim 数 =', injected);

  await cdp.send('Page.navigate', { url: TARGET });
  await sleep(9000);

  const probe = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      var lock=document.getElementById('dsh-ios-page-lock');
      var unlock=document.getElementById('dsh-ios-page-unlock');
      var cs=getComputedStyle(document.documentElement);
      var bs=getComputedStyle(document.body);
      var se=document.scrollingElement||document.documentElement;
      var before=window.scrollY;
      window.scrollTo(0,400);
      var after=window.scrollY;
      return JSON.stringify({
        lock: !!lock, lockCss: lock?lock.textContent.slice(0,60):null,
        unlock: !!unlock,
        htmlPos: cs.position, htmlOv: cs.overflowY, htmlH: cs.height,
        bodyPos: bs.position, bodyOv: bs.overflowY, bodyH: bs.height,
        scrollH: se.scrollHeight, clientH: se.clientHeight,
        innerH: window.innerHeight,
        beforeY: before, afterY: after,
        styleTags: document.querySelectorAll('style').length,
        headKids: document.head?document.head.children.length:-1
      });
    })()`,
    returnByValue: true,
  });
  console.log('=== PROBE ===');
  console.log(probe && probe.result && probe.result.value);

  try { await cdp.send('Browser.close'); } catch (e) {}
  try { child.kill(); } catch (e) {}
  setTimeout(() => process.exit(0), 500);
})();
