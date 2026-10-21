# -*- coding: utf-8 -*-
"""CI 发布凭证校验（Verify regression gate）
物理上堵死「没跑闸门 / 闸门没全绿 / 跑完又改代码」三条打包通道：
  1) _diag/gate-result.json 必须存在（没跑闸门 → 没凭证）
  2) ok 必须 true 且 fail 必须 0（跑了但红 → 拒绝）
  3) sourceHash 必须等于现场 DSHios/ViewController.swift 的 sha256
     （跑完闸门后又改代码 → 指纹对不上 → 拒绝）
  4) version 必须等于现场 VERSION（改了版本没重跑 → 拒绝）
退出码非 0 即打包失败。
"""
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def die(msg: str) -> None:
    print("::error::" + msg)
    sys.exit(1)


def sha256_file(p: str) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    f = os.path.join(ROOT, "_diag", "gate-result.json")
    if not os.path.exists(f):
        die("缺少 _diag/gate-result.json —— 必须先本地跑 node _diag/regression.js 且全绿，再提交凭证")
    try:
        g = json.load(open(f, encoding="utf-8"))
    except Exception as e:
        die("gate-result.json 解析失败：%s" % e)

    if g.get("ok") is not True:
        die("回归闸门未通过（fail=%s），禁止打包：%s" % (g.get("fail"), "; ".join((g.get("failures") or [])[:5])))
    if g.get("fail") != 0:
        die("回归闸门存在红项（fail=%s），禁止打包" % g.get("fail"))

    src = os.path.join(ROOT, "DSHios", "ViewController.swift")
    if not os.path.exists(src):
        die("找不到 DSHios/ViewController.swift")
    now = sha256_file(src)
    if g.get("sourceHash") != now:
        die("跑完闸门后 ViewController.swift 又被改动（凭证 %s ≠ 现场 %s）—— 请重跑 node _diag/regression.js 后再提交" % (str(g.get("sourceHash"))[:12], now[:12]))

    ver_path = os.path.join(ROOT, "VERSION")
    ver = open(ver_path, encoding="utf-8").read().strip() if os.path.exists(ver_path) else ""
    if g.get("version") != ver:
        die("凭证版本 %s ≠ 现场 VERSION %s —— 改版本后必须重跑闸门" % (g.get("version"), ver))

    ac = g.get("anchorCritical") or {}
    dead = ac.get("dead") or []
    if dead:
        # v1.0.129：pageHead 只在插件列表页存在。会话页死循环 → 插件页进不去 → 该锚点取不到样。
        # v1.0.131：同为懒挂载锚点的 headerCorner（会话页顶角）也会被同一死循环连坐（零注入裸页面同样复现，
        # Chromium 直连对照确认 DOM 在）。放行条件收紧为：dead 全部属于白名单且 blocked 里逐个有对应登记；
        # 其它任何锚点失效照样硬拒（那是真的 DSH 改版、补丁静默失效）。
        allow = {"pageHead", "headerCorner"}
        blk_txt = " ".join([str(x) for x in (g.get("blocked") or [])])
        if not (set(dead) <= allow and all(a in blk_txt for a in dead)):
            die("关键锚点失效：%s" % ", ".join(dead))
        print("::warning::锚点无法取样（会话页死循环连坐，blocked 已登记）：" + ", ".join(dead))

    # v1.0.129：blocked = 「DSH 前端死循环导致该步跑不到」的无法校验项。
    # 它既不进 pass 也不进 fail，必须逐条打印出来，绝不允许静默通过。
    blk = g.get("blocked") or []
    if blk:
        print("::warning::有 %d 项无法校验（DSH 前端死循环，零注入裸页面同样复现）：" % len(blk))
        for b in blk:
            print("  ⏸️ " + str(b))

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as s:
            s.write("## ✅ 回归闸门凭证\n\n")
            s.write("| 项 | 值 |\n|---|---|\n")
            s.write("| 版本 | %s |\n" % g.get("version"))
            s.write("| 结果 | %s 绿 / %s 红 |\n" % (g.get("pass"), g.get("fail")))
            s.write("| DSH 指纹 | %s (%s 资源) |\n" % (g.get("dshFingerprint"), g.get("dshAssets")))
            s.write("| 锚点健康度 | %s/%s 命中 DSH 自有 CSS |\n" % (g.get("anchorCssAlive"), g.get("anchorTotal")))
            s.write("| 源码指纹 | %s… |\n" % str(g.get("sourceHash"))[:16])
            s.write("| 凭证时间 | %s |\n" % g.get("finishedAt"))
            if blk:
                s.write("\n### ⏸️ 无法校验（不阻断，但必须知情）\n\n")
                for b in blk:
                    s.write("- %s\n" % b)
    print("gate OK: v%s, %s 绿/0 红, DSH 指纹 %s, src %s…" % (g.get("version"), g.get("pass"), g.get("dshFingerprint"), str(g.get("sourceHash"))[:12]))


if __name__ == "__main__":
    main()
