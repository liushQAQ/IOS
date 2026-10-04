// 端到端验证 DSH Pocket 3083：端口监听 + 握手页 + 二跳完整 index.html + WS upgrade 探测
import net from 'node:net';
import http from 'node:http';

const HOST = '192.168.215.218';
const PORT = 3083;

function checkPort(host, port) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 3000 });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });
}

function req(opts, cookie) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
    if (cookie) headers['Cookie'] = cookie;
    const r = http.request({ host: HOST, port: PORT, path: opts.path || '/', method: opts.method || 'GET', headers, timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    r.end();
  });
}

function parseCookies(setCookieArr) {
  if (!setCookieArr) return [];
  return setCookieArr.map(c => c.split(';')[0]);
}

const alive = await checkPort(HOST, PORT);
console.log(`[1] TCP ${HOST}:${PORT} alive = ${alive}`);
if (!alive) { console.log('RESULT: FAIL - port not listening'); process.exit(1); }

// 第一跳：无 cookie GET /
const hop1 = await req({ path: '/' });
console.log(`[2] hop1 GET / -> ${hop1.status}`);
console.log(`    x-dsh-pocket-handshake: ${hop1.headers['x-dsh-pocket-handshake'] || '(none)'}`);
console.log(`    set-cookie: ${JSON.stringify(parseCookies(hop1.headers['set-cookie']))}`);
console.log(`    body length: ${hop1.body.length}, is handshake page: ${hop1.body.includes('正在进入') || hop1.body.includes('opening')}`);

const cookies = parseCookies(hop1.headers['set-cookie']);
const cookieHeader = cookies.join('; ');
const dshAuthCookie = cookies.find(c => c.startsWith('dsh-auth-'));
console.log(`    dsh-auth cookie minted: ${dshAuthCookie ? 'YES name=' + dshAuthCookie.split('=')[0] : 'NO'}`);

// 第二跳：带 cookie GET /
const hop2 = await req({ path: '/' }, cookieHeader);
console.log(`[3] hop2 GET / (with cookie) -> ${hop2.status}`);
console.log(`    body length: ${hop2.body.length}`);
console.log(`    has __DSH_BOOT__: ${hop2.body.includes('__DSH_BOOT__')}`);
console.log(`    title: ${(hop2.body.match(/<title>([^<]*)<\/title>/) || [])[1] || '(none)'}`);
console.log(`    assets refs: ${(hop2.body.match(/\/assets\/[a-zA-Z0-9._-]+/g) || []).slice(0, 6).join(', ')}`);

// 静态资源抽查：取一个 asset 验证 200
const asset = (hop2.body.match(/(?:src|href)="(\/assets\/[a-zA-Z0-9._-]+)"/) || [])[1];
if (asset) {
  const a = await req({ path: asset }, cookieHeader);
  console.log(`[4] asset ${asset} -> ${a.status} (${a.body.length}B, type=${a.headers['content-type']})`);
} else {
  console.log('[4] no asset ref found');
}

// API 抽查：/api/desktop/settings 之类 renderer-only 的不行，试一个通用 RPC
const api = await req({ path: '/api/', method: 'GET' }, cookieHeader);
console.log(`[5] GET /api/ -> ${api.status} (${api.body.slice(0, 80).replace(/\n/g, ' ')})`);

// WebSocket upgrade 探测
const wsOk = await new Promise((resolve) => {
  const key = Buffer.from(Math.random().toString(36).slice(2) + '==').toString('base64');
  const r = http.request({
    host: HOST, port: PORT, path: '/api/events.host',
    method: 'GET',
    headers: {
      'Connection': 'Upgrade',
      'Upgrade': 'websocket',
      'Sec-WebSocket-Key': key,
      'Sec-WebSocket-Version': '13',
      ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
      'Origin': `http://${HOST}:${PORT}`,
    },
    timeout: 6000,
  });
  r.on('upgrade', (res) => { console.log(`[6] WS upgrade -> 101, x-dsh-pocket-headers: ${JSON.stringify(Object.keys(res.headers).filter(h => h.includes('pocket')))}`); r.destroy(); resolve(true); });
  r.on('response', (res) => { console.log(`[6] WS got normal response ${res.status} (not upgraded)`); res.resume(); resolve(false); });
  r.on('error', (e) => { console.log(`[6] WS error: ${e.message}`); resolve(false); });
  r.on('timeout', () => { r.destroy(); console.log('[6] WS timeout'); resolve(false); });
  r.end();
});

console.log(`\nRESULT: ${hop2.status === 200 && hop2.body.includes('__DSH_BOOT__') ? 'PASS' : 'PARTIAL'} (ws=${wsOk})`);
