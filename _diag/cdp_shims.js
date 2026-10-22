// 用 CDP 精确复现 WKUserScript(.atDocumentStart) 行为：注入 App 的全部 shim，看 #root 是否还能挂载
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9334;
const TARGET = process.argv[2] || 'http://127.0.0.1:3083/';
const SHIM_MODE = process.argv[3] || 'all'; // all | none | only:N
const SHIM_DIR = 'E:/desktop/所有skill/deepseek-harness-ios/_shims';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function shimFiles() {
  return fs.readdirSync(SHIM_DIR).filter(f => /^shim_\d+\.js$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
}

async function waitDevtools() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch (e) {}
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
      if (msg.id && c.pending.has(msg.id)) { const { res } = c.pending.get(msg.id); c.pending.delete(msg.id); res(msg); }
      else if (msg.method) c.events.push(msg);
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res) => { this.pending.set(id, { res }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
}

(async () => {
  const profDir = 'E:/desktop/所有skill/deepseek-harness-ios/_diag/edgeprof3';
  try { fs.rmSync(profDir, { recursive: true, force: true }); } catch (e) {}
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profDir}`, 'about:blank'],
    { stdio: 'ignore' });

  try {
    await waitDevtools();
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
    const tab = await r.json();
    const cdp = await CDP.connect(tab.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');

    let injected = [];
    const MODE = SHIM_MODE;
    if (MODE.includes('del')) {
      // 先模拟 iOS 16.3 缺失的新 API（删掉它们，让页面以为自己是旧 WebKit）
      const delSrc = `(function(){
        function del(obj, key){ try { delete obj[key]; } catch(e){} }
        del(Promise,'withResolvers'); del(Promise,'try'); del(Promise,'any');
        ['at','toSorted','toReversed','toSpliced','with','findLast','findLastIndex','flatMap','fromAsync'].forEach(function(k){ del(Array.prototype,k); del(Array,k); });
        del(Object,'groupBy'); del(Object,'hasOwn'); del(Map,'groupBy');
        del(globalThis,'structuredClone');
        del(URL,'canParse'); del(URL,'parse');
        del(String.prototype,'isWellFormed'); del(String.prototype,'toWellFormed');
        ['union','intersection','difference','symmetricDifference','isSubsetOf','isSupersetOf','isDisjointFrom'].forEach(function(k){ del(Set.prototype,k); });
        try { if (self.crypto) del(self.crypto.__proto__, 'randomUUID'); } catch(e){}
        try { if (self.crypto) self.crypto.randomUUID = undefined; } catch(e){}
        try { del(RegExp,'escape'); } catch(e){}
      })();`;
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: delSrc });
      console.log('deleted modern APIs (iOS 16.3 simulation)');
    }
    if (MODE.includes('all')) injected = shimFiles();
    else if (MODE.startsWith('only:')) {
      const n = MODE.slice(5);
      injected = shimFiles().filter(f => f === `shim_${n.padStart(2, '0')}.js`);
    }
    for (const f of injected) {
      const src = fs.readFileSync(path.join(SHIM_DIR, f), 'utf8');
      const res = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: src });
      if (!res.result) console.log('inject failed', f, JSON.stringify(res).slice(0, 200));
    }
    console.log('injected shims:', injected.join(',') || '(none)');

    cdp.events.length = 0;
    if (SHIM_MODE.includes('ua')) {
      const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
      await cdp.send('Emulation.setUserAgentOverride', { userAgent: IOS_UA, platform: 'iPhone', acceptLanguage: 'zh-CN,zh;q=0.9' });
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
      console.log('UA overridden to iOS 16.3 Safari');
    }
    await cdp.send('Page.navigate', { url: TARGET });
    await sleep(20000);

    const probe = await cdp.send('Runtime.evaluate', {
      expression: `(function(){
        var r = document.getElementById('root');
        return JSON.stringify({
          readyState: document.readyState,
          rootExists: !!r,
          rootKids: r ? r.children.length : -1,
          rootTextLen: r ? (r.innerText||'').trim().length : -1,
          rootText: r ? (r.innerText||'').trim().slice(0,120) : '',
          bodyTextLen: document.body ? (document.body.innerText||'').trim().length : -1,
          hasBR: typeof Promise.withResolvers === 'function',
          hasAt: typeof Array.prototype.at === 'function'
        });
      })()`, returnByValue: true
    });
    console.log('=== PROBE ===');
    console.log(probe.result && probe.result.result && probe.result.result.value);

    const errs = cdp.events.filter(e => e.method === 'Log.entryAdded' || e.method === 'Runtime.exceptionThrown')
      .map(e => e.method === 'Log.entryAdded'
        ? `[${e.params.entry.level}] ${e.params.entry.text}`
        : `[EXC] ${e.params.exceptionDetails.text} ${((e.params.exceptionDetails.exception||{}).description||'').split('\n').slice(0,2).join(' | ')}`);
    console.log('=== ERRORS (' + errs.length + ') ===');
    console.log(errs.slice(0, 20).join('\n'));
  } catch (e) {
    console.log('FATAL: ' + e.message);
  } finally {
    try { child.kill(); } catch (e) {}
    await sleep(400);
    process.exit(0);
  }
})();
