// 在 app JS bundle 里找 WS 端点路径
import http from 'node:http';

const COOKIE = 'dsh-auth-u1zJcETw8Q74Kp2rKDFmtGK4upxaWlNqc-TTM_793dg=v1.eyJ2ZXJzaW9uIjoxLCJhdXRob3JpdHkiOiIxMjcuMC4wLjE6NDMxMjAiLCJpc3N1ZWRBdCI6MTc5MTA0NDE2OTE0MywiZXhwaXJlc0F0IjoxNzkzNjM2MTY5MTQzfQ.nWNbeESZXfLzyuOSlwd3D4cJhxx6aybU2jtBRtZkH7M';

function get(path) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '192.168.215.218', port: 3083, path, headers: { Cookie: COOKIE }, timeout: 15000 }, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject);
    r.end();
  });
}

const js = await get('/assets/index-5SrrfWpU.js');
console.log('bundle status:', js.status, 'len:', js.body.length);

const eventsPaths = [...new Set(js.body.match(/["'`](\/?api\/[a-zA-Z0-9._\/-]*events[a-zA-Z0-9._\/-]*)["'`]/g) || [])];
console.log('api-events paths:', JSON.stringify(eventsPaths.slice(0, 10)));

const wsRefs = [...new Set(js.body.match(/new WebSocket|WebSocket\(|\/events\.host|events\.host/g) || [])];
console.log('ws refs:', JSON.stringify(wsRefs.slice(0, 10)));

// host event stream 相关
const hostRefs = [...new Set(js.body.match(/["'`][^"'`]*events[^"'`]*["'`]/g) || [])].filter(s => s.length < 60);
console.log('events strings:', JSON.stringify(hostRefs.slice(0, 15)));
