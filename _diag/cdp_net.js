// CDP 抓包：定位 DSH 真实加载的大包 URL，验证渲染 + 正则改写情况
// 用法: node cdp_net.js <targetUrl> [outPrefix]
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

const TARGET = process.argv[2] || 'http://127.0.0.1:9060/dsh/?password=Liu326766@';
const PREFIX = process.argv[3] || 'net';
const PORT = 9333 + Math.floor(Math.random() * 400);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const UD = 'E:/desktop/所有skill/deepseek-harness-ios/_diag/ud_' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitDevtools() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const j = await r.json(); if (j && j.length) return j; } } catch (e) {}
    await sleep(250);
  }
  return null;
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.on = null; }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && c.pending.has(msg.id)) { const r = c.pending.get(msg.id); c.pending.delete(msg.id); r(msg.result); }
      else if (msg.method && c.on) c.on(msg);
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
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, `--user-data-dir=${UD}`, '--window-size=430,932', 'about:blank'], { stdio: 'ignore' });

  const tabs = await waitDevtools();
  if (!tabs) { console.log('EDGE_NOT_READY'); try { child.kill(); } catch (e) {} process.exit(1); }
  const page = tabs.find((t) => t.type === 'page') || tabs[0];
  const cdp = await CDP.connect(page.webSocketDebuggerUrl);

  const big = [], anomalies = [];
  cdp.on = (msg) => {
    if (msg.method === 'Network.responseReceived') {
      const r = msg.params.response;
      const ct = String(r.headers['content-type'] || r.mimeType || '').toLowerCase();
      if (ct.includes('javascript')) big.push({ url: r.url, status: r.status, enc: r.headers['content-encoding'] || 'none', len: r.encodedDataLength, clen: r.headers['content-length'] || '-' });
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      anomalies.push('EXC: ' + String((d.exception && (d.exception.description || d.exception.value)) || d.text || '').slice(0, 260));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
      anomalies.push('CONSOLE ' + msg.params.type + ': ' + (msg.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 260));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') anomalies.push('LOG: ' + String(msg.params.entry.text).slice(0, 260));
  };

  await cdp.send('Network.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: TARGET });
  await sleep(26000);

  const probe = await cdp.send('Runtime.evaluate', {
    expression: `(function(){var r=document.getElementById('root');var t=r?(r.innerText||'').trim():'';
      return JSON.stringify({url:location.href,root:!!r,rootKids:r?r.children.length:-1,rootTextLen:t.length,head:t.slice(0,70),
      lock:!!document.getElementById('dsh-ios-page-lock'),unlock:!!document.getElementById('dsh-ios-page-unlock'),
      htmlPos:getComputedStyle(document.documentElement).position,bodyBg:getComputedStyle(document.body).backgroundColor});})()`,
    returnByValue: true,
  });

  console.log('=== RENDER ==='); console.log(probe && probe.result && probe.result.value);
  console.log('=== JS RESPONSES (' + big.length + ') ===');
  big.sort((a, b) => b.len - a.len).slice(0, 8).forEach((b) => console.log('  ' + b.len + '\t' + b.status + '\t' + b.enc + '\tclen=' + b.clen + '\t' + b.url.slice(0, 150)));
  console.log('=== ANOMALIES (' + anomalies.length + ') ===');
  anomalies.slice(0, 15).forEach((a) => console.log('  ' + a));

  fs.writeFileSync(path.join('E:/desktop/所有skill/deepseek-harness-ios/_diag', PREFIX + '_net.json'), JSON.stringify({ probe: probe && probe.result && probe.result.value, big, anomalies }, null, 2));
  try { await cdp.send('Browser.close'); } catch (e) {}
  try { child.kill(); } catch (e) {}
  setTimeout(() => process.exit(0), 600);
})();
