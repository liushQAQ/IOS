# -*- coding: utf-8 -*-
"""v2.2.4 打包收件：解压 CI artifact → 校验 plist/二进制守卫 → 落盘 releases/。
用法: python tools/pkg224_verify.py <artifact_zip> <build号>
只读解析包内容并复制产物，不执行包内任何文件。"""
import sys, os, zipfile, plistlib, hashlib, shutil, re

zip_path, build = sys.argv[1], sys.argv[2]
R = r"E:\desktop\所有skill\deepseek-harness-ios"
work = os.path.join(os.path.dirname(os.path.abspath(zip_path)), "x_" + str(build))
if os.path.isdir(work):
    shutil.rmtree(work)
with zipfile.ZipFile(zip_path) as z:
    z.extractall(work)

cands = [os.path.join(dp, f) for dp, _, fs in os.walk(work) for f in fs
         if f.lower().endswith((".tipa", ".ipa"))]
assert cands, "zip 内无 tipa/ipa"
src = max(cands, key=os.path.getsize)
name = "DSHios-public-2.2.4-%s.tipa" % build
dst = os.path.join(R, "releases", name)
shutil.copyfile(src, dst)
size = os.path.getsize(dst)
md5 = hashlib.md5(open(dst, "rb").read()).hexdigest()

with zipfile.ZipFile(dst) as z:
    names = z.namelist()
    pl = [n for n in names if re.match(r"^Payload/[^/]+\.app/Info\.plist$", n)]
    assert pl, "无 Info.plist"
    d = plistlib.loads(z.read(pl[0]))
    bins = [n for n in names if re.match(r"^Payload/[^/]+\.app/[^/]+$", n)
            and "." not in os.path.basename(n)]
    sel = None
    if bins:
        main = max(bins, key=lambda n: z.getinfo(n).file_size)
        sel = b"setKeyboardDisplayRequiresUserAction:" in z.read(main)

print("file=%s" % name)
print("size=%d md5=%s" % (size, md5))
print("CFBundleShortVersionString=%s" % d.get("CFBundleShortVersionString"))
print("CFBundleVersion=%s" % d.get("CFBundleVersion"))
print("CFBundleIdentifier=%s" % d.get("CFBundleIdentifier"))
print("MinimumOSVersion=%s" % d.get("MinimumOSVersion"))
print("R74_guard_selector_in_binary=%s" % sel)
assert d.get("CFBundleShortVersionString") == "2.2.4", "marketing 版本不符"
assert str(d.get("CFBundleVersion")) == str(build), "build 号不符"
print("PKG_VERIFY_OK")
