// _diag/mirror-bench.mjs —— 外网分发包测速 + 多线路并行分片下载验证
// 用途：① 单线路真实速度 ② 多线路 × 多分片并行能把 4.9MB 包压到多少秒 ③ 拼装后 md5 是否一致
// 跑法：node _diag/mirror-bench.mjs <url1> <url2> ... [--parts 8] [--md5 xxxx] [--out 文件]
// 铁律：必须清代理环境变量再跑，否则测到的是本机代理的假速度。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';

const args = process.argv.slice(2);
// 只把第一个 `--flag` 之前的参数当 URL，避免 --parts 9 / --md5 xxxx 的值被误当成线路
const flagAt = args.findIndex((a) => a.startsWith('--'));
const urls = (flagAt < 0 ? args : args.slice(0, flagAt)).filter(Boolean);
const pick = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const PARTS = parseInt(pick('parts', '8'), 10);
const EXPECT_MD5 = pick('md5', '');
const OUT = pick('out', '');

function getOnce(url, headers = {}, timeoutMs = 45000, redirects = 6) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('http:') ? http : https;
    const req = mod.get(url, { headers, timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        resolve(getOnce(next, headers, timeoutMs, redirects - 1));
        return;
      }
      resolve({ res, url });
    });
    req.on('timeout', () => req.destroy(new Error('timeout ' + timeoutMs + 'ms')));
    req.on('error', reject);
  });
}

async function head(url) {
  const t0 = Date.now();
  const { res } = await getOnce(url, { Range: 'bytes=0-0' }, 15000);
  res.resume();
  const cr = (res.headers['content-range'] || '').match(/\/(\d+)$/);
  const total = cr ? parseInt(cr[1], 10) : parseInt(res.headers['content-length'] || '0', 10);
  return { status: res.statusCode, total, ms: Date.now() - t0, range: res.statusCode === 206 };
}

async function fetchRange(url, start, end) {
  const t0 = Date.now();
  const { res } = await getOnce(url, { Range: `bytes=${start}-${end}` }, 60000);
  if (res.statusCode !== 206 && res.statusCode !== 200) {
    res.resume();
    throw new Error('HTTP ' + res.statusCode);
  }
  const chunks = [];
  let bytes = 0;
  for await (const c of res) {
    chunks.push(c);
    bytes += c.length;
  }
  const ms = Date.now() - t0;
  const buf = Buffer.concat(chunks);
  const want = end - start + 1;
  if (buf.length !== want) throw new Error(`short ${buf.length}/${want}`);
  return { buf, ms, bytes, url, speed: Math.round(bytes / (ms / 1000)) };
}

// ---------- 1. 单线路全量 ----------
console.log('=== ① 单线路全量下载 ===');
const singles = [];
for (const u of urls) {
  try {
    const t0 = Date.now();
    const { res } = await getOnce(u, {}, 60000);
    if (res.statusCode !== 200) {
      res.resume();
      console.log(`  FAIL ${res.statusCode}  ${u}`);
      singles.push({ url: u, ok: false, status: res.statusCode });
      continue;
    }
    const chunks = [];
    let bytes = 0;
    for await (const c of res) {
      chunks.push(c);
      bytes += c.length;
    }
    const ms = Date.now() - t0;
    const buf = Buffer.concat(chunks);
    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    singles.push({ url: u, ok: true, bytes, ms, md5 });
    console.log(`  ${(bytes / 1048576 / (ms / 1000)).toFixed(2)} MB/s  ${bytes}B  ${(ms / 1000).toFixed(2)}s  md5=${md5.slice(0, 8)}  ${u}`);
  } catch (e) {
    console.log(`  ERR ${e.message}  ${u}`);
    singles.push({ url: u, ok: false, err: e.message });
  }
}

// ---------- 2. 探测总长 + Range 支持 ----------
console.log('\n=== ② HEAD / Range 能力 ===');
const usable = [];
for (const u of urls) {
  try {
    const h = await head(u);
    console.log(`  ${h.status} range=${h.range} total=${h.total} ${h.ms}ms  ${u}`);
    if (h.status === 206 && h.total > 0) usable.push({ url: u, total: h.total });
  } catch (e) {
    console.log(`  ERR ${e.message}  ${u}`);
  }
}
if (!usable.length) {
  console.log('无可用 Range 线路，结束');
  process.exit(1);
}
const TOTAL = usable[0].total;

// ---------- 3. 多线路并行分片 ----------
console.log(`\n=== ③ 并行分片：${usable.length} 线路 × ${PARTS} 片（总 ${TOTAL}B）===`);
const chunk = Math.ceil(TOTAL / PARTS);
const jobs = [];
for (let i = 0; i < PARTS; i++) {
  const start = i * chunk;
  const end = Math.min(TOTAL - 1, start + chunk - 1);
  jobs.push({ i, start, end });
}
const t0 = Date.now();
const results = new Array(PARTS);
let rr = 0;
await Promise.all(
  jobs.map(async (job) => {
    const order = [];
    for (let k = 0; k < usable.length; k++) order.push(usable[(rr + k) % usable.length]);
    rr++;
    let lastErr;
    for (const m of order) {
      try {
        const r = await fetchRange(m.url, job.start, job.end);
        results[job.i] = r;
        console.log(`  片${job.i} ${job.start}-${job.end} ${(r.bytes / 1024).toFixed(0)}KB ${(r.speed / 1024).toFixed(0)}KB/s  ${new URL(m.url).host}`);
        return;
      } catch (e) {
        lastErr = e;
        console.log(`  片${job.i} 线路 ${new URL(m.url).host} 失败(${e.message})，换下一线`);
      }
    }
    throw lastErr;
  }),
);
const wall = Date.now() - t0;
const all = Buffer.concat(results.map((r) => r.buf));
const md5 = crypto.createHash('md5').update(all).digest('hex');
console.log(`\n  拼装 ${all.length}B / ${TOTAL}B  ${all.length === TOTAL ? '✅ 长度一致' : '❌ 长度不符'}`);
console.log(`  耗时 ${(wall / 1000).toFixed(2)}s  等效 ${(TOTAL / 1048576 / (wall / 1000)).toFixed(2)} MB/s`);
if (EXPECT_MD5) console.log(`  md5 ${md5}  ${md5 === EXPECT_MD5 ? '✅ 与期望一致' : '❌ 与期望不一致'}`);
else console.log(`  md5 ${md5}`);
if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, all);
  console.log(`  已落盘 ${OUT}`);
}
