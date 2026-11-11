# -*- coding: utf-8 -*-
"""生成 v2.2.4(159) 的 releases/latest.json（UTF-8 无 BOM，json.dumps 保证合法）。用法: python tools/gen_latest_224.py [build]"""
import json, os, hashlib, datetime, sys

R = r"E:\desktop\所有skill\deepseek-harness-ios"
BUILD = int(sys.argv[1]) if len(sys.argv) > 1 else 159
VER = "2.2.4"
TAG = "v2.2.4"
TIPA = "DSHios-public-2.2.4-%d.tipa" % BUILD

p = os.path.join(R, "releases", TIPA)
size = os.path.getsize(p)
md5 = hashlib.md5(open(p, "rb").read()).hexdigest()

changelog = (
    "1. 贴着屏幕右缘上下滑，鲸鱼直接唤出并跟手调高，不用再按住图标拖 (2.2.4)\n"
    "2. 修复安装后打开就闪退的问题：部分机型缺的键盘属性已加安全判断 (2.2.3)\n"
    "3. 键盘必弹根修继续生效：排队发送完再点会话框，键盘照样弹得出 (2.2.2)\n"
    "4. 拆掉键盘上方那条系统辅助条（↑↓完成），正文多出约一行空间 (2.2.2)\n"
    "5. 会话框弹出与收回跟键盘同一条曲线，输入框紧贴键盘顶边 (2.2.2)\n"
    "6. 恢复跟随系统外观：白天自动白、夜间自动黑，页面内手动选主题仍然优先"
)

mirrors = [
    f"https://jsd.onmicrosoft.cn/gh/liushQAQ/IOS@{TAG}/releases/{TIPA}",
    f"https://gcore.jsdelivr.net/gh/liushQAQ/IOS@{TAG}/releases/{TIPA}",
    f"https://testingcf.jsdelivr.net/gh/liushQAQ/IOS@{TAG}/releases/{TIPA}",
    "https://ghfast.top/https://github.com/liushQAQ/IOS/releases/download/%s/%s" % (TAG, TIPA),
    f"https://cdn.jsdmirror.com/gh/liushQAQ/IOS@{TAG}/releases/{TIPA}",
    "https://gh-proxy.com/https://github.com/liushQAQ/IOS/releases/download/%s/%s" % (TAG, TIPA),
    "https://github.com/liushQAQ/IOS/releases/download/%s/%s" % (TAG, TIPA),
    f"https://liu-gw.tail2a9309.ts.net:8443/dl/{TIPA}",
]

doc = {
    "version": VER,
    "build": BUILD,
    "updated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    "title": "v2.2.4(%d) 右缘滑唤鲸鱼 + 安装闪退根治延续" % BUILD,
    "changelog": changelog,
    "tipa_url": mirrors[0],
    "public_tipa_url": mirrors[1],
    "tipa_url_fallback": mirrors[3],
    "tipa_mirrors": mirrors,
    "size_bytes": size,
    "release_url": "https://github.com/liushQAQ/IOS/releases/tag/%s" % TAG,
    "md5": md5,
}

out = os.path.join(R, "releases", "latest.json")
data = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
with open(out, "w", encoding="utf-8", newline="\n") as f:
    f.write(data)

raw = open(out, "rb").read()
assert not raw.startswith(b"\xef\xbb\xbf"), "BOM 残留"
back = json.loads(raw.decode("utf-8"))
assert back["version"] == VER and back["build"] == BUILD and back["md5"] == md5
print("OK version=%s build=%d size=%d md5=%s" % (back["version"], back["build"], back["size_bytes"], back["md5"]))
print("mirrors=%d bytes=%d" % (len(back["tipa_mirrors"]), len(raw)))
