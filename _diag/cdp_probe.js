// CDP 探针：用真实 Chromium 打开页面，取证 #root 是否挂载、控制台是否有异常
const { spawn } = require('child_process');
const fs = require('fs');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const TARGET = process.argv[2] || 'http://127.0.0.1:3083/';
const WAIT_MS = Number(process.argv[3] || 20000);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch (e) { /* not ready */ }
    await sleep(250);
  }
  throw new Error('devtools not ready');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && c.pending.has(msg.id)) {
        const { res } = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        res(msg);
      } else if (msg.method) {
        c.events.push(msg);
      }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res) => {
      this.pending.set(id, { res });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

(async () => {
  const profDir = 'E:/desktop/所有skill/deepseek-harness-ios/_diag/edgeprof2';
  try { fs.rmSync(profDir, { recursive: true, force: true }); } catch (e) {}
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profDir}`, 'about:blank'
  ], { stdio: 'ignore', detached: false });

  try {
    await waitDevtools();
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(TARGET)}`, { method: 'PUT' });
    const tab = await r.json();
    const cdp = await CDP.connect(tab.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');

    await sleep(WAIT_MS);

    const probe = await cdp.send('Runtime.evaluate', {
      expression: `(function(){
        var r = document.getElementById('root');
        var out = {
          url: location.href,
          title: document.title,
          readyState: document.readyState,
          rootExists: !!r,
          rootKids: r ? r.children.length : -1,
          rootTextLen: r ? (r.innerText||'').trim().length : -1,
          bodyKids: document.body ? document.body.children.length : -1,
          bodyTextLen: (document.body ? (document.body.innerText||'').trim().length : -1),
          htmlBg: getComputedStyle(document.documentElement).backgroundColor,
          bodyBg: document.body ? getComputedStyle(document.body).backgroundColor : '',
          scripts: document.scripts.length,
          hasBR: typeof Promise.withResolvers === 'function',
          hasAt: typeof Array.prototype.at === 'function',
          hasTS: typeof Array.prototype.toSorted === 'function',
          bootReady: typeof window.__DSH_BOOT_READY__,
          loaderMode: (window.__ModuleLoader__ && window.__ModuleLoader__.mode) || 'none'
        };
        try {
          var s = document.getElementById('dsh-ios-page-lock');
          out.pageLockMounted = !!s;
        } catch(e) {}
        try {
          var u = document.getElementById('dsh-ios-page-unlock');
          out.pageUnlockMounted = !!u;
        } catch(e) {}
        return JSON.stringify(out);
      })()`,
      returnByValue: true, awaitPromise: false
    });
    const val = probe.result && probe.result.result && probe.result.result.value;
    console.log('=== PROBE ===');
    console.log(val);

    const errs = cdp.events
      .filter(e => e.method === 'Log.entryAdded' || e.method === 'Runtime.exceptionThrown')
      .map(e => {
        if (e.method === 'Log.entryAdded') {
          return `[LOG ${e.params.entry.level}] ${e.params.entry.text}`;
        }
        const d = e.params.exceptionDetails;
        return `[EXC] ${d.text} ${(d.exception && d.exception.description || '').split('\n')[0]}`;
      });
    console.log('=== CONSOLE/EXC (' + errs.length + ') ===');
    console.log(errs.slice(0, 25).join('\n'));

    try {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      if (shot.result && shot.result.data) {
        fs.writeFileSync('E:/desktop/所有skill/deepseek-harness-ios/_diag/shot.png', Buffer.from(shot.result.data, 'base64'));
        console.log('screenshot saved');
      }
    } catch (e) { console.log('screenshot failed', e.message); }
  } catch (e) {
    console.log('FATAL: ' + e.message);
  } finally {
    try { child.kill(); } catch (e) {}
    await sleep(500);
    process.exit(0);
  }
})();
