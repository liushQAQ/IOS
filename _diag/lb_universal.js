// 通用性验证：把真实改写器取出来，用「会拒绝 lookbehind / v flag 的 FakeRegExp」模拟 iOS 16.3，
// 验证任何形态的 lookbehind 都能改写成老引擎可用的运行期构造，绝不白屏。
const fs = require('fs');
const SRC_PATH = process.argv[2] || 'E:/desktop/所有skill/packages/dsh-anywhere/lib/proxy.mjs';
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
console.log('源文件: ' + SRC_PATH + '\n');

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

const code = [
  sliceFn(SRC, 'stripLookbehinds'),
  sliceFn(SRC, 'punctFixCode'),
  sliceFn(SRC, 'negSpaceFixCode'),
  sliceFn(SRC, 'buildLookbehindSafeWrapper'),
  sliceFn(SRC, 'patchLookbehindRegexLiterals'),
].join('\n') + '\nreturn { patchLookbehindRegexLiterals, buildLookbehindSafeWrapper, stripLookbehinds };';
const api = new Function(code)();

// ---- 模拟 iOS 16.3：拒绝 lookbehind、拒绝 v flag ----
const RealRegExp = RegExp;
function FakeRegExp(src, flags) {
  const s = String(src);
  const f = flags === undefined ? '' : String(flags);
  if (/\(\?<[=!]/.test(s)) throw new SyntaxError('Invalid regular expression: invalid group specifier name');
  if (f.indexOf('v') >= 0) throw new SyntaxError('Invalid regular expression flags');
  return new RealRegExp(s, f);
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  :: ' + extra : '')); }
}

// 把改写后的表达式放到「老引擎」里求值
function evalInOldEngine(jsLiteral) {
  return new Function('RegExp', 'return (' + jsLiteral + ');')(FakeRegExp);
}

console.log('=== 1. 已知形态 A：vendor 邮箱正则（前导 [ ，数组元素写法）===');
{
  const srcJS = 'var A=[[/(https?:\\/\\/|www(?=\\.))([-.\\w]+)([^ \\t\\r\\n]*)/gi,0],[/(?<=^|\\s|\\p{P}|\\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)/gu,1]];';
  const r = api.patchLookbehindRegexLiterals(srcJS);
  ok('命中 1 处', r.patched === 1, 'patched=' + r.patched);
  // 取出改写后的表达式（第二项）
  const m = r.code.match(/\(function\(\)\{var S=[\s\S]*?return r\}\)\(\)/);
  ok('能提取改写表达式', !!m);
  if (m) {
    const re = evalInOldEngine(m[0]);
    const t1 = '张三 zhangsan@example.com 收';
    const got = re.exec(t1);
    const want = /(?<=^|\s|\p{P}|\p{S})([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)/gu.exec(t1);
    ok('语义一致 m[0]=' + (got && got[0]), got && want && got[0] === want[0] && got.index === want.index,
       'got=' + (got && got[0]) + '@' + (got && got.index) + ' want=' + (want && want[0]) + '@' + (want && want.index));
  }
}

console.log('=== 2. 已知形态 B：(?<!\\S) 命令前缀 ===');
{
  const srcJS = 'var b=/(?<!\\S)\\/([\\w-]+)(?!\\S)/gu;';
  const r = api.patchLookbehindRegexLiterals(srcJS);
  ok('命中 1 处', r.patched === 1, 'patched=' + r.patched);
  const m = r.code.match(/\(function\(\)\{var S=[\s\S]*?return r\}\)\(\)/);
  if (m) {
    const re = evalInOldEngine(m[0]);
    const t1 = 'hi /skill next';
    const got = re.exec(t1);
    const want = /(?<!\S)\/([\w-]+)(?!\S)/gu.exec(t1);
    ok('语义一致 -> ' + (got && got[0]), got && want && got[0] === want[0] && got.index === want.index,
       'got=' + (got && got[0]) + '@' + (got && got.index) + ' want=' + (want && want[0]) + '@' + (want && want.index));
  }
}

console.log('=== 3. 未知形态 C：(?<=\\d{3})\\w+ —— 旧版会原样放行导致白屏 ===');
{
  const srcJS = 'var c=/(?<=\\d{3})\\w+/g;';
  const r = api.patchLookbehindRegexLiterals(srcJS);
  ok('命中 1 处（不再放行）', r.patched === 1, 'patched=' + r.patched);
  const m = r.code.match(/\(function\(\)\{var S=[\s\S]*?return r\}\)\(\)/);
  ok('已改写成运行期构造（源码里不再有裸 lookbehind）', !!m && r.code.indexOf('/(?<=') < 0);
  if (m) {
    let threw = null, re = null;
    try { re = evalInOldEngine(m[0]); } catch (e) { threw = e.message; }
    ok('老引擎构造不抛', !threw, threw);
    ok('是可用正则对象', re instanceof RealRegExp);
    if (re) {
      const mm = re.exec('abc123def');
      // 剥离后前导约束消失，首个匹配变成 "abc"（原来要 (?<=\d{3}) 才会命中 "def"）
      ok('能正常匹配（语义已放宽为无前导约束）-> ' + (mm && mm[0]), !!mm);
    }
  }
}

console.log('=== 4. 未知形态 D：(?<!foo)bar ===');
{
  const r = api.patchLookbehindRegexLiterals('var d=/(?<!foo)bar/g;');
  ok('命中 1 处', r.patched === 1, 'patched=' + r.patched);
  const m = r.code.match(/\(function\(\)\{var S=[\s\S]*?return r\}\)\(\)/);
  if (m) {
    let threw = null, re = null;
    try { re = evalInOldEngine(m[0]); } catch (e) { threw = e.message; }
    ok('老引擎构造不抛', !threw, threw);
    ok('仍能匹配 bar', !!re && !!re.exec('xxbar'));
  }
}

console.log('=== 5. v flag 降级（与 lookbehind 同时出现的场景）===');
{
  const r = api.patchLookbehindRegexLiterals('var e=/(?<=\\d)[\\p{L}--[aeiou]]/v;');
  const m = r.code.match(/\(function\(\)\{var S=[\s\S]*?return r\}\)\(\)/);
  ok('v flag + lookbehind 被改写', !!m, 'patched=' + r.patched);
  if (m) {
    let threw = null, re = null;
    try { re = evalInOldEngine(m[0]); } catch (e) { threw = e.message; }
    ok('老引擎构造不抛（v→u 降级生效）', !threw, threw);
    ok('是可用正则对象', re instanceof RealRegExp);
  }
  // 已知边界：纯 v flag（不含 lookbehind）不改写——当前 DSH 前端 0 处，
  // 而按 /v 猜正则开头会误伤 `a / v / b` 这类链式除法，风险大于收益。
  const r2 = api.patchLookbehindRegexLiterals('var f=/[\\p{L}--[aeiou]]/v;');
  ok('纯 v flag 保持原样（已知边界，已记档）', r2.patched === 0, 'patched=' + r2.patched);
}

console.log('=== 6. 混合形态：(?<=a)(?<!\\S)x ===');
{
  const r = api.patchLookbehindRegexLiterals('var f=/(?<=a)(?<!\\S)x/g;');
  ok('命中 1 处', r.patched === 1, 'patched=' + r.patched);
  const m = r.code.match(/\(function\(\)\{var S=[\s\S]*?return r\}\)\(\)/);
  if (m) {
    let threw = null, re = null;
    try { re = evalInOldEngine(m[0]); } catch (e) { threw = e.message; }
    ok('老引擎构造不抛', !threw, threw);
    ok('是可用正则对象', re instanceof RealRegExp);
  }
}

console.log('=== 7. stripLookbehinds 单元校验 ===');
{
  ok('剥离 (?<=\\d)', api.stripLookbehinds('(?<=\\d)\\w+') === '\\w+');
  ok('剥离嵌套 (?<=(a(b)c))x', api.stripLookbehinds('(?<=(a(b)c))x') === 'x');
  ok('不误伤字符类 [(?<=]', api.stripLookbehinds('[(?<=]x') === '[(?<=]x');
  ok('不误伤转义 \\(\\?<=', api.stripLookbehinds('\\(\\?<=x') === '\\(\\?<=x');
  ok('两种都剥离', api.stripLookbehinds('(?<!a)(?<=b)z') === 'z');
}

console.log('\n结果：PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
