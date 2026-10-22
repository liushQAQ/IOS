// 专项：强制走「降级」分支，验证 m[0] / m.index / 捕获组编号 与原 lookbehind 完全一致
const orig = new RegExp('(?<=^|\\s|\\p{P}|\\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)', 'gu');
const deg  = new RegExp('(?:^|\\s|\\p{P}|\\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)', 'gu');
const ex = deg.exec;
deg.exec = function (t) {
  var m = ex.call(this, t);
  if (m && typeof m[0] === 'string' && m[0].length > 0 && m.length > 2) {
    var d = m[0].length - (String(m[1] || '').length + 1 + String(m[2] || '').length);
    if (d > 0) { m[0] = m[0].slice(d); m.index = m.index + d; }
  }
  return m;
};
const cases = ['a@b.com', 'hi a@b.com', '（a@b.com）', '+a@b.cc', 'xa@b.com',
  'say: x.y+z@mail.co.uk end', '  a@b.com', 'a@b.com and c@d.cn', '，x@y.z；q@w.e',
  '!!!a@b.com???c@d.com', '【a@b.com】'];
let ok = 0, bad = 0;
for (const t of cases) {
  const a = [], b = [];
  orig.lastIndex = 0; let m;
  while ((m = orig.exec(t))) { a.push([m[0], m[1], m[2], m.index].join('|')); if (!m[0].length) orig.lastIndex++; }
  deg.lastIndex = 0; let n;
  while ((n = deg.exec(t))) { b.push([n[0], n[1], n[2], n.index].join('|')); if (!n[0].length) deg.lastIndex++; }
  const same = JSON.stringify(a) === JSON.stringify(b);
  same ? ok++ : bad++;
  console.log((same ? '✅' : '🔴') + ' ' + JSON.stringify(t));
  if (!same) console.log('     原: ' + JSON.stringify(a) + '\n     降: ' + JSON.stringify(b));
}
console.log('\n降级路径一致 ' + ok + ' / 不一致 ' + bad);
