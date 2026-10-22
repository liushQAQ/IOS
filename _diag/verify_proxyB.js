// 方案 B 落地前对拍：把 proxy.mjs 里的两个函数原样抽出，对 3083 原始 9MB 包实测
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROXY = 'C:/Users/Administrator/.dsh/profiles/desktop/node_modules/dsh-anywhere/lib/proxy.mjs';
const ORIG = 'E:/desktop/所有skill/deepseek-harness-ios/_diag/orig3083.js';

const src = fs.readFileSync(PROXY, 'utf8');
const start = src.indexOf('function buildLookbehindSafeWrapper');
const endMark = src.indexOf('/**', start);
const funcs = src.slice(start, endMark);
console.log('抽出的函数源码长度 =', funcs.length, '| 含 patch =', funcs.includes('function patchLookbehindRegexLiterals'));

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(funcs + '\nthis.__patch = patchLookbehindRegexLiterals; this.__wrap = buildLookbehindSafeWrapper;', ctx);

const js = fs.readFileSync(ORIG, 'utf8');
const t0 = Date.now();
const r = ctx.__patch(js);
const t1 = Date.now();

console.log('原始长度 =', js.length, '-> 改写后 =', r.code.length, '| patched =', r.patched, '| 耗时', (t1 - t0), 'ms');
console.log('改写后残留 /(?<! =', (r.code.match(/\/\(\?<!/g) || []).length, '(期望 0)');
console.log('改写标记 try{return new RegExp(S,F) =', (r.code.match(/try\{return new RegExp\(S,F\)/g) || []).length, '(期望 3)');
console.log('命名捕获组 /(?< =', (r.code.match(/\/\(\?<[A-Za-z>=]/g) || []).length, '(期望 2，原样保留)');

// 语法检查
const tmp = path.join(path.dirname(ORIG), 'patched_b.js');
fs.writeFileSync(tmp, r.code);
try {
  new vm.Script(r.code, { filename: 'patched_b.js' });
  console.log('SYNTAX:', 'OK');
} catch (e) {
  console.log('SYNTAX: FAIL ->', e.message);
}

// 语义对拍：把改写出来的 wrapper 真正求值，和原生 lookbehind 比 exec 结果
const cases = [
  ['(?<!\\S)\\/([\\w-]+)(?!\\S)', 'gu', 'a /skill b /cmd-x c'],
  ['(?<!\\S)\\/([\\w-]+)(?!\\S)', 'gu', '/skill'],
  ['(?<!\\S)\\/([\\w-]+)(?!\\S)', 'gu', 'x/skill y/ skill'],
  ['(?<!\\S)\\/([\\w-]+)(?!\\S)', 'gu', 'a\t/skill\n/cmd'],
  ['(?<!\\S)(@"[^"\\n]+"|@[^\\s]+)', 'gu', 'hi @"a b" @x'],
  ['(?<!\\S)\\/([\\w-]+)(?!\\S)', 'gu', '\u00a0/skill'],
  ['(?<!\\S)\\/([\\w-]+)(?!\\S)', 'gu', ''],
  ['(?<!\\S)\\/([\\w-]+)(?!\\S)', 'gu', '没有斜杠的文本'],
];
let bad = 0;
for (const [s, f, text] of cases) {
  const nat = new RegExp(s, f);
  const wrapped = vm.runInContext(ctx.__wrap(s, f), ctx);
  const a = [], b = [];
  for (const m of text.matchAll(new RegExp(s, f))) a.push(m[0] + '@' + m.index);
  let m2;
  const re2 = new RegExp(wrapped.source, wrapped.flags);
  re2.exec = wrapped.exec;
  while ((m2 = re2.exec(text))) { b.push(m2[0] + '@' + m2.index); if (m2[0] === '') re2.lastIndex++; }
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { bad++; console.log('  MISMATCH', JSON.stringify(text), 'nat=' + JSON.stringify(a), 'wrap=' + JSON.stringify(b)); }
}
console.log('语义对拍: 组数 =', cases.length, '| mismatches =', bad);
