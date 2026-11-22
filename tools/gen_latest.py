# -*- coding: utf-8 -*-
"""统一生成 releases/latest.json（R96 根修 2026-11-22：禁止每版手抄一次性脚本）。

用法: python tools/gen_latest.py <版本> <build> [标题] [changelog文件路径或文本]
例:   python tools/gen_latest.py 2.2.25 182 "v2.2.25(182) 标题" changelog.txt

铁律（R96）:
- 全部 11 条下载地址一律由版本号参数化生成，禁止手写/手抄 URL；
- size/md5 一律实测 releases/DSHios-public-<版本>-<build>.tipa；
- 写盘 UTF-8 无 BOM + LF，json 回读校验；
- 硬断言：11 条 URL 解析出的 版本-build 必须与入参一致，任一不符退出码 1。
"""
import json, os, re, hashlib, datetime, sys

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    ver = sys.argv[1].lstrip("v")
    build = int(sys.argv[2])
    title = sys.argv[3] if len(sys.argv) > 3 else "v%s(%d)" % (ver, build)
    if len(sys.argv) > 4:
        c = sys.argv[4]
        changelog = open(c, encoding="utf-8-sig").read().strip() if os.path.isfile(c) else c
    else:
        changelog = ""

    tag = "v" + ver
    tipa = "DSHios-public-%s-%d.tipa" % (ver, build)
    p = os.path.join(R, "releases", tipa)
    if not os.path.isfile(p):
        print("缺包: %s" % p)
        sys.exit(1)
    size = os.path.getsize(p)
    md5 = hashlib.md5(open(p, "rb").read()).hexdigest()

    mirrors = [
        "https://jsd.onmicrosoft.cn/gh/liushQAQ/IOS@%s/releases/%s" % (tag, tipa),
        "https://gcore.jsdelivr.net/gh/liushQAQ/IOS@%s/releases/%s" % (tag, tipa),
        "https://testingcf.jsdelivr.net/gh/liushQAQ/IOS@%s/releases/%s" % (tag, tipa),
        "https://ghfast.top/https://github.com/liushQAQ/IOS/releases/download/%s/%s" % (tag, tipa),
        "https://cdn.jsdmirror.com/gh/liushQAQ/IOS@%s/releases/%s" % (tag, tipa),
        "https://gh-proxy.com/https://github.com/liushQAQ/IOS/releases/download/%s/%s" % (tag, tipa),
        "https://github.com/liushQAQ/IOS/releases/download/%s/%s" % (tag, tipa),
        "https://liu-gw.tail2a9309.ts.net:8443/dl/%s" % tipa,
    ]

    doc = {
        "version": ver,
        "build": build,
        "updated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "title": title,
        "changelog": changelog,
        "tipa_url": mirrors[0],
        "public_tipa_url": mirrors[1],
        "tipa_url_fallback": mirrors[3],
        "tipa_mirrors": mirrors,
        "size_bytes": size,
        "release_url": "https://github.com/liushQAQ/IOS/releases/tag/%s" % tag,
        "md5": md5,
    }

    # 🔴 R96 硬断言：每条 URL 里的 版本-build 必须与入参一致（防旧地址混入，即本条 R 的根因）
    urls = [doc["tipa_url"], doc["public_tipa_url"], doc["tipa_url_fallback"]] + doc["tipa_mirrors"]
    want = "%s-%d.tipa" % (ver, build)
    bad = []
    for u in urls:
        m = re.search(r"DSHios-public-([\d.]+)-(\d+)\.tipa$", u)
        if not m or (m.group(1), int(m.group(2))) != (ver, build):
            bad.append(u)
    if bad:
        print("R96 断言失败（含旧版地址 %d 条）:" % len(bad))
        for u in bad:
            print("  " + u)
        sys.exit(1)

    out = os.path.join(R, "releases", "latest.json")
    data = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(data)

    raw = open(out, "rb").read()
    assert not raw.startswith(b"\xef\xbb\xbf"), "BOM 残留"
    back = json.loads(raw.decode("utf-8"))
    assert back["version"] == ver and back["build"] == build and back["md5"] == md5
    print("OK version=%s build=%d size=%d md5=%s" % (back["version"], back["build"], back["size_bytes"], back["md5"]))
    print("urls=%d 全部含 %s（R96 断言通过）" % (len(urls), want))


if __name__ == "__main__":
    main()
