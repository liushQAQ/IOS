// 从 proxy.mjs 抽出真实的 buildLookbehindSafeWrapper + patchLookbehindRegexLiterals 来测
const fs = require('fs');
const SRC = fs.readFileSync('C:/Users/Administrator/.dsh/profiles/desktop/node_modules/dsh-anywhere/lib/proxy.mjs', 'utf8');

function sliceFn(s, name) {
  const key = 'function ' + name + '(';
  const st = s.indexOf(key);
  if (st < 0) throw new Error('找不到 ' + name);
  let i = s.indexOf('{', st), depth = 0;
  for (; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) return s.slice(st, i + 1); }
  }
  throw new Error('大括号不闭合');
}
const code = sliceFn(SRC, 'buildLookbehindSafeWrapper') + '\n' + sliceFn(SRC, 'patchLookbehindRegexLiterals') + '\nreturn { patchLookbehindRegexLiterals, buildLookbehindSafeWrapper };';
const api = new Function(code)();

// ---- 用例 1：真实 vendor.js 里的邮箱正则（数组元素写法，前面是 [ ）----
const original = '(?<=^|\\s|\\p{P}|\\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)';
const flags = 'gu';
const srcJS = 'var A=[[/(https?:\\/\\/|www(?=\\.))([-.\\w]+)([^ \\t\\r\\n]*)/gi,0],[/(?<=^|\\s|\\p{P}|\\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)/gu,1]];';
const r = api.patchLookbehindRegexLiterals(srcJS);
console.log('改写命中处数 patched =', r.patched);
console.log('改写后片段:', r.code.slice(0, 120) + ' ...');

// 执行改写后的代码，取回正则
const re = new Function(r.code + '; return A[1][0];')();
console.log('取回对象类型:', re instanceof RegExp ? 'RegExp' : typeof re);

// ---- 用例 2：语义等价对拍（原正则 vs 降级包装）----
const cases = ['a@b.com', 'hi a@b.com', '（a@b.com）', '+a@b.cc', 'xa@b.com', 'say: x.y+z@mail.co.uk end', '  a@b.com'];
const orig = new RegExp(original, flags);
console.log('\n--- 语义对拍（原 lookbehind vs 降级包装）---');
let ok = 0, bad = 0;
for (const t of cases) {
  const a = [];
  orig.lastIndex = 0; let m;
  while ((m = orig.exec(t))) { a.push(m[1] + '@' + m[2] + '@' + m.index); if (m[0].length === 0) orig.lastIndex++; }
  const b = [];
  re.lastIndex = 0; let m2;
  while ((m2 = re.exec(t))) { b.push(m2[1] + '@' + m2[2] + '@' + m2.index); if (!m2[0] || m2[0].length === 0) re.lastIndex++; }
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (same) ok++; else bad++;
  console.log((same ? '✅' : '🔴') + ' ' + JSON.stringify(t) + '\n     原: ' + JSON.stringify(a) + '\n     新: ' + JSON.stringify(b));
}
console.log('\n一致 ' + ok + ' / 不一致 ' + bad);
