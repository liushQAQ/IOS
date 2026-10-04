// 电脑端（后端）深度体检：通过 Pocket 3083 验证 ①静态资源 ②API 全权限（loopback 信任）③会话真实可用
import http from 'node:http';

const HOST = '192.168.215.218';
const PORT = 3083;

function req(path, method = 'GET', body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      ...extraHeaders,
    };
    let data = null;
    if (body) {
      data = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    const r = http.request({ host: HOST, port: PORT, path, method, headers, timeout: 10000 }, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    if (data) r.write(data);
    r.end();
  });
}

// 1. 握手拿 cookie
const hop1 = await req('/');
const cookies = (hop1.headers['set-cookie'] || []).map(c => c.split(';')[0]);
const cookie = cookies.join('; ');
console.log(`[1] 握手: ${hop1.status}, cookie=${cookies.length ? 'OK' : 'MISSING'}`);

// 2. 完整页面
const hop2 = await req('/', 'GET', null, { Cookie: cookie });
console.log(`[2] index.html: ${hop2.status}, ${hop2.body.length}B, __DSH_BOOT__=${hop2.body.includes('__DSH_BOOT__')}`);

// 3. 静态资源（JS 主包 + CSS）
const assets = [...new Set(hop2.body.match(/\/assets\/[a-zA-Z0-9._-]+/g) || [])];
for (const a of assets.slice(0, 4)) {
  const r = await req(a, 'GET', null, { Cookie: cookie });
  console.log(`[3] ${a} -> ${r.status} (${r.body.length}B, ${r.headers['content-type']})`);
}

// 4. API 全权限验证：pluginInventory/list（server-response RPC 格式，走 loopback 信任栅栏）
const rpc = await req('/api/pluginInventory/list', 'POST', {
  type: 'client-request', rpcId: 'healthcheck-1', method: 'pluginInventory/list', payload: { args: {} },
}, { Cookie: cookie, Origin: `http://${HOST}:${PORT}`, Referer: `http://${HOST}:${PORT}/` });
console.log(`[4] pluginInventory/list -> ${rpc.status}`);
if (rpc.status === 200) {
  try {
    const j = JSON.parse(rpc.body);
    const entries = j?.payload?.entries || j?.entries || [];
    const active = entries.filter(e => e.fiberPhase === 'active');
    console.log(`    插件总数=${entries.length}, active=${active.length}${active.length ? ', 含: ' + active.slice(0, 5).map(e => e.name || e.id).join(', ') : ''}`);
    console.log('    ✓ 全权限 API 通行（loopback 信任成立）');
  } catch { console.log('    (非 JSON 响应，前 120 字符: ' + rpc.body.slice(0, 120) + ')'); }
} else {
  console.log('    ✗ API 失败: ' + rpc.body.slice(0, 200));
}

// 5. 再验证一个普通 API：会话列表类
const rpc2 = await req('/api/session/list', 'POST', {
  type: 'client-request', rpcId: 'healthcheck-2', method: 'session/list', payload: { args: {} },
}, { Cookie: cookie, Origin: `http://${HOST}:${PORT}`, Referer: `http://${HOST}:${PORT}/` });
console.log(`[5] session/list -> ${rpc2.status} (${rpc2.body.slice(0, 100).replace(/\s+/g, ' ')})`);
