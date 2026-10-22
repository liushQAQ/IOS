const fs = require('fs');
const list = JSON.parse(fs.readFileSync('js_list.json', 'utf8'));
(async () => {
  let i = 0;
  for (const it of list) {
    const r = await fetch(it.u);
    const t = await r.text();
    const f = 'js_' + (i++) + '.js';
    fs.writeFileSync(f, t);
    console.log(f, String(t.length).padStart(9), r.status, it.u.slice(-62));
  }
})();
