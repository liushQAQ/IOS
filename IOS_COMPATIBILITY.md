# iOS 14 / 15 / 16+ 版本兼容性沉淀（老总令 2026-10-21：低版本高版本兼容是大问题，必须沉淀）

> 立规：2026-10-21 老总令 ——「iOS16-15-14 低版本和高版本兼容问题，这个也是大问题，今天这么久才修复好，要沉淀一下记忆和文档，同步发给 dsh{8040桥}」。
> 本文是 **iOS 版本兼容问题的唯一权威清单**。任何新功能 / 修复 / 发版前必过一遍本文。
> 配套必读：`AGENTS.md`（铁律）、`REGRESSION.md`（R01~R20 问题清单）、`_diag/regression.js`（闸门）。

---

## 一、兼容矩阵与现状

| iOS 版本 | 状态 | 关键差异 |
|---|---|---|
| 14.x | ✅ 支持（MinimumOSVersion 14.0） | ITP 隐私策略最严；WKWebView 老 API 行为；无部分新 CSS |
| 15.x | ✅ 支持 | 同 14，另 Safari 15 部分新 CSS 支持 |
| 16.0~16.3 | ✅ 支持（**要过 R10 改写器**） | **RegExp lookbehind 16.4 才支持**——这是最大白屏源 |
| 16.4+ | ✅ 支持 | lookbehind 原生可用，改写器白名单仍必须工作 |
| 17+ | ✅ 理论通吃 | 未实测，按 16.4+ 对待 |

装机路径：TrollStore（巨魔）安装，iOS 16.3 巨魔冻结老机型是**性能下限基准**（插件 bundle 解析实测 20~40 秒）。

---

## 二、兼容铁律（每条都踩过坑，逐条带案例）

### C1 🔴 RegExp lookbehind —— iOS < 16.4 直接 SyntaxError 白屏（R10，史上最大事故）
- DSH vendor 代码含 lookbehind 正则（如 `(?<=\[)` 邮箱正则），iOS 16.3 的 JavaScriptCore **不支持** → JS 整体解析失败 → **白屏**。
- 解法：电脑端 `dsh-anywhere`（v1.0.6+）代理层通用改写器——未知形态 `stripLookbehinds()` 剥离、`v` flag → `u`；已知形态走 `allowedPrev` 白名单，**白名单必须含 `[`**（vendor 邮箱正则是数组元素写法，漏了就白屏）。
- 红线：
  1. **App 侧只探测、不改写**（改写只允许发生在代理层）；
  2. **grep 判定 lookbehind 不可信**（字符串同形文本误报），必须 `_diag/ast_audit.js`（acorn AST）；
  3. `node_modules/dsh-anywhere` 是符号链接指向源码仓库，改它=改源码，兜底靠 git；
  4. npm 上的 `dsh-anywhere` 不是我们的包，唯一安装方式 `pnpm add github:liushQAQ/dsh-anywhere`。

### C2 🔴 iOS 14 / 15 ITP 隐私策略拦截（局域网 http 加载）
- WKWebView 在低版本 iOS 上 ITP 会拦「跨域本地网络访问」，导致 3081/3083 局域网页加载异常。
- 解法（`ViewController.setupUI()` 已内置，勿删）：
  ```swift
  config.preferences.javaScriptEnabled = true
  config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
  config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
  ```
- 附带：`viewport-fit=cover` 在 WKWebView 不可靠，`env(safe-area-inset-top)` 恒 0 —— 状态栏高度一律走**原生下发**（`publishStatusBarHeight()` → `__dshSetStatusBar` / `--dsh-sb-native`），**绝不信页内 env()**。

### C3 🔴 JS 弹窗在低版本静默丢失
- `WKUIDelegate` 必须实现 `alert` / `confirm` 面板——不实现时 JS `alert()/confirm()` 在部分 iOS 版本**什么都不发生**（点按钮无反应，看起来像「点了没反应」的假 bug）。

### C4 🔴 JS 几何 shim 在真机「某环境整体死亡」
- 实测（v1.0.127 真机实锤）：同一份注入 JS，沙箱全活、真机可能**整体死亡**（原因未完全查明）。
- 对策：**CSS 直修兜底通道**——顶栏等关键布局必须同时有 CSS 注入兜底（`--dsh-sb-native` 公式），JS 死了 CSS 兜底，真机无论哪条通道活着布局都在位。
- 闸门场景 E 专门模拟「只注 CSS、绝不注 JS」。

### C5 🔴 原生层位移闸门测不出（R18，2026-10-20 惨案）
- 闸门跑在浏览器里，`webViewTopConstraint` / contentInset / scrollView 位移、归属判定（`isCurrentServiceDSH`）**永远测不出**——v1.0.125~129 四版白修的根源。
- 对策：凡「沙箱绿、真机错」→ **第一步真机截图逐条带像素对拍**归因；「整页/整块平移」先查原生约束与归属标记。
- 归属红线：任何 `loadURLString` 对 DSH 地址禁传 `markAsDSHService:false`（重试/清缓存已修并自愈）。

### C6 🔴 老机型性能：白屏诊断采样点必须后移
- iOS 16.3 巨魔冻结机型上插件 bundle（约 14MB）解析要 **20~40 秒**——把「解析慢」误判成「白屏」会弹假错误页。
- 对策：`startWhiteScreenDiagnostics()` 采样点 15 / 35 / 70 秒，只有**最后一针**仍空才判白屏；连接超时保护在 `didCommit`（响应头到达）即取消。
- 前置：归属标记被写坏时白屏诊断被整段跳过（R18 连坐）——归属红线同时保诊断。

### C7 🔴 巨魔（TrollStore）安装升级
- App 内检测更新：自建下载通道（**必须跟随重定向**，根治 TrollStore 下载器 301 报错）+ 下载后直调巨魔本地安装。
- 更新清单走 `releases/latest.json`（统计网关 /dl/ 对外）。
- **全部历史构建保留**，严禁覆盖；版本号 = `1.0.x(build)`，build = `github.run_number`。

### C8 🔴 WebKitWebProcess 死循环（版本无关，会连坐）
- DSH 前端偶发死循环烧满 WebKitWebProcess，`evaluateJavaScript` 永久挂起（零注入裸页面也复现，非 App 侧问题）。
- 对策：闸门 `p.evaluate` 30 秒哨兵 + 18 分钟看门狗 + 「无法校验」分类（undefined 绝不能默认成绿）；重启 DSH 后指纹会变（如 `reqq24` → `y75j21`）。

---

## 三、发版前兼容自检清单（照抄执行）

```text
□ 1. dsh-anywhere 改写器在线（lookbehind 全剥离，ast_audit.js 通过）→ 保 16.0~16.3
□ 2. setupUI 的 ITP 三行豁免还在 → 保 14/15
□ 3. WKUIDelegate alert/confirm 实现还在 → 弹窗不丢
□ 4. publishStatusBarHeight 原生下发还在 → 顶栏不依赖 env()
□ 5. CSS 直修通道还在（场景 E 全绿）→ JS 死亡兜底
□ 6. 闸门全绿 + 凭证新鲜（sourceHash/version 匹配）
□ 7. REGRESSION.md R01~R20 逐条过一遍：本次改动会不会让任何一条复发？
□ 8. 修改了归属/加载逻辑？→ R18 红线自查
□ 9. 版本四处同步（AppDelegate/Info.plist/VERSION/关于页文案）
□ 10. 真机（iOS 16.3 基准机）装机验收，截图对拍
```

---

## 四、沉淀规则（为什么写本文）

- **R10（lookbehind 白屏）**与 **R18（原生 +59）**各浪费了数小时到数天，共同点：**问题不在表面那一层**。
- 以后凡兼容类问题修完，必须：① REGRESSION.md 加 R 条目；② 本文加 C 条目（若涉 iOS 版本差异）；③ 同步 DSH（`C:\Users\Administrator\.dsh\AGENTS.md` 追加 + 8040 桥通知）。
- 重复问题零容忍：老总令「已要求处理什么问题，如何解决的，之后不要修改更新版本还出现」——发版前第 7 项自检是硬卡口。

---

*创建：2026-10-21 · v1.0.130(74) 闭环后沉淀 · 维护者：WorkBuddy / DSH 共同遵守*
