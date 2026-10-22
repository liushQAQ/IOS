// AST 级体检：用 acorn 精确找出「正则字面量」里的 lookbehind 与 v 标志
// （字符串里长得像正则的文本不会误报，因为 acorn 走真正的词法分析）
const fs = require('fs');
const path = require('path');
const acorn = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/acorn');

function walk(node, cb) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => walk(n, cb)); return; }
  if (node.type) cb(node);
  for (const k in node) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (v && typeof v === 'object') walk(v, cb);
  }
}

const files = process.argv.slice(2);
let grand = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const name = path.basename(f);
  const hits = [];
  let ast = null, err = null;
  for (const opt of [{ ecmaVersion: 2023, sourceType: 'script' }, { ecmaVersion: 2023, sourceType: 'module' },
                     { ecmaVersion: 2022, sourceType: 'script' }, { ecmaVersion: 2022, sourceType: 'module' }]) {
    try { ast = acorn.parse(src, { ...opt, allowHashBang: true, allowReturnOutsideFunction: true }); err = null; break; }
    catch (e) { err = e; }
  }
  if (!ast) {
    console.log('🔴 [' + name + '] 解析失败: ' + (err && err.message) + ' @' + (err && err.pos));
    grand++;
    continue;
  }
  walk(ast, (n) => {
    if (n.regex) {
      const p = n.regex.pattern || '';
      const fl = n.regex.flags || '';
      const lb = p.indexOf('(?<=') >= 0 || p.indexOf('(?<!') >= 0;
      const vflag = fl.indexOf('v') >= 0;
      if (lb || vflag) {
        const line = src.slice(0, n.start).split('\n').length;
        hits.push({ line, lb, vflag, flags: fl, pattern: p.slice(0, 70) });
      }
    }
  });
  if (hits.length) {
    grand += hits.length;
    console.log('🔴 [' + name + '] 命中 ' + hits.length + ' 处');
    hits.slice(0, 8).forEach(h => console.log('   L' + h.line + ' flags=' + h.flags + (h.lb ? ' [lookbehind]' : '') + (h.vflag ? ' [v-flag]' : '') + '  /' + h.pattern + '/'));
    if (hits.length > 8) console.log('   ... 另有 ' + (hits.length - 8) + ' 处');
  } else {
    console.log('✅ [' + name + '] 干净（无 lookbehind / v 标志正则字面量）');
  }
}
console.log('---\n总命中: ' + grand + ' 处');
