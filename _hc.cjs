const http = require('http');
function get(port, path, cookie) {
  return new Promise(r => {
    const h = {};
    if (cookie) h.cookie = cookie;
    const q = http.get({ host: '127.0.0.1', port, path, headers: h, timeout: 15000 }, res => {
      let b = ''; res.on('data', d => b += d);
      res.on('end', () => r({ s: res.statusCode, len: b.length, sc: (res.headers['set-cookie'] || []).map(c => c.split('=')[0]).join(',') }));
    });
    q.on('error', e => r({ s: 'ERR ' + e.message }));
    q.on('timeout', () => { q.destroy(); r({ s: 'TIMEOUT' }); });
  });
}
(async () => {
  console.log('--- 3081 直连 ---');
  const a = await get(3081, '/');
  console.log('  GET /            : ' + JSON.stringify(a));
  const b = await get(3081, '/api/session');
  console.log('  GET /api/session : ' + JSON.stringify(b));
  console.log('--- 8080 ---');
  const c = await get(8080, '/dsh/');
  console.log('  GET /dsh/        : ' + JSON.stringify(c));
  const d = await get(8080, '/dsh/api/session');
  console.log('  GET /dsh/api/session: ' + JSON.stringify(d));
  console.log('--- 9060 ---');
  const e = await get(9060, '/dsh/?password=' + encodeURIComponent('Liu326766@'));
  console.log('  GET /dsh/?password  : ' + JSON.stringify(e));
  console.log('--- 3083 pocket ---');
  const f = await get(3083, '/');
  console.log('  GET /            : ' + JSON.stringify(f));
})();
