# -*- coding: utf-8 -*-
s = open('_served_2__web_search_client_js__deepseek_ai_dsh_client_ui_plan_client_js_rev_373b1070a451.js', encoding='utf-8', errors='replace').read()

def extract(marker):
    i = s.find(marker)
    a = s.find('"', s.find('const css', i)) + 1
    j = a
    while True:
        j = s.find('";', j)
        if j == -1:
            raise SystemExit('no end')
        k = j - 1
        bs = 0
        while k >= 0 and s[k] == '\\':
            bs += 1
            k -= 1
        if bs % 2 == 0:
            return s[a:j]
        j += 1

for marker, out in [('QueueDock.module.css.mjs', '_queuedock_css.css'), ('GoalBar.module.css.mjs', '_goalbar_css.css')]:
    css = extract(marker)
    res = []
    i2 = 0
    while i2 < len(css):
        c = css[i2]
        if c == '\\' and i2 + 1 < len(css):
            n = css[i2 + 1]
            if n == 'n':
                res.append('\n')
                i2 += 2
                continue
            if n == 't':
                res.append('\t')
                i2 += 2
                continue
            res.append(n)
            i2 += 2
            continue
        res.append(c)
        i2 += 1
    css = ''.join(res)
    open(out, 'w', encoding='utf-8', newline='\n').write(css)
    print(out, len(css))
