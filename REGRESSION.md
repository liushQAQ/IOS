# DSH iOS 适配 · 问题清单与防复发校验规程

> 立规：2026-10-20 老总令 —— 「重复修复重复问题，那意义在哪里？要列个问题清单：已解决、如何解决、下个版本要校验有没有出现重复问题。」
> **本文件是发版必读。每次出包前，必须照「三、校验 SOP」跑一遍。**

---

## 一、为什么老问题会反复出现（根因，实测不是猜测）

DSH 是第三方闭源前端，我们只能在 App 侧靠注入 CSS/JS 打补丁。**补丁绑在什么东西上，决定了它会不会复发。**

实测（2026-10-20，`_diag/hash_authority.js`）：

| 项目 | 实测值 |
|---|---|
| App 里写死的 CSS Module 哈希类名 | **102 个** |
| 当前 DSH 版本前端资源里**仍存在**的 | 40 个 |
| 当前 DSH 版本前端资源里**彻底消失**的 | **62 个（≈61%）** |

判定方法是扫「实际加载的 CSS + JS 文本」（20.6 MB）而不是某一刻的 DOM —— 只要类名在资源文本里彻底不存在，任何页面状态都救不回来。**六成补丁一直在空转，而且不报任何错。**

所以「修过又复发」= **三层原因叠加**：

1. **锚点层**：补丁写死哈希类名（`ank0OG_headerCorner`、`uWtHQG_add`、`CZPbNW_sidebarCol`…），DSH 每次换版哈希整体漂移 → 选择器静默失效、修复归零。
2. **方法层**：只做单点补丁（1.0.122 仅把顶栏那一个按钮推回 8px），DSH 换个元素就复发。
3. **流程层**：没有发版前机械校验，修没修好、有没有复发全靠老总肉眼发现 —— **复发成本全压在使用者身上**。

**治本三件事**（v1.0.124 起全部落地）：锚点换不变量 → 补丁通用化 → 建立回归闸门。

---

## 二、问题清单（已解决 · 根因 · 解法 · 校验断言）

状态：✅ 已解决并纳入闸门 / ⚠️ 已解决但未纳入闸门（需人工核对）

| # | 症状（老总原话） | 真因 | 解法 | 校验断言（regression.js） |
|---|---|---|---|---|
| R01 | 「打开左侧侧边栏，文字超出侧边栏宽度」 | 抽屉被 App 压到 252px，DSH 内部仍按原生 280px 排布 → 90 个元素右界越界被 `overflow:hidden` 硬裁 | 逐层 `max-width:100%` + `min-width:0` + 单行省略号 | `[抽屉] 内部零出血` |
| R02 | 「设置按钮超出侧边栏范围」 | 齿轮原先以账号行右界 `ar.right`(270) 为基准，超出抽屉 252 | 改以「账号行右界」与「抽屉右界」中**更靠内**者为基准（v1.0.9） | `[齿轮] 位置在抽屉内` |
| R03 | 「底栏重叠一堆」 | 底栏吸底块右界 280 > 抽屉 252；横向溢出 30 个元素 | 同 R01 | `[底栏] 不超抽屉右界` + `[底栏] 子块零重叠` |
| R04 | 会话框按钮（圆圈 / 方框 / + 号 / 发送大圆钮）不居中 | ① 写死哈希类名 `uWtHQG_add` / `ank0OG_composerSeat`，换版后命中数 **0**；② DSH 原生给发送大圆钮加 `transform: translateY(-2px)`（computed = `matrix(1,0,0,1,0,-2)`）；③ 按钮内边距不等 `2px 6px 3px` | `[class*="composerStack"]` 通用锚点 + 强制 `transform:none` + `padding:0` + 运行期按**中位数**对齐 | `[会话框] N 个按钮中心齐平`（离散 ≤ 0.6px） |
| R05 | 抽屉打开时「设置」点不开（v1.0.124 新增） | DSH 自带费用计量浮层 `.cm-peak-alert`（`position:fixed` / `z-index:9999` / 宽 406px）间歇出现，盖住齿轮 —— 实测 `elementFromPoint` 命中的是 `cm-peak-alert-actions` 而非齿轮 | 抽屉打开期间临时收起该浮层，抽屉关掉立刻还原 | `[齿轮] 中心点可命中自身` |
| R06 | 「任何界面都超出屏幕范围」 | 单点补丁只管一个按钮 | 全页通用钳制：遍历 ≤3000 元素，凡 `right > vw+0.5` 且左边在屏内，一律 `translateX` 推回；**六条安全线**防误伤 | `[主页] 零横向出血` + `[抽屉] 页面零出血` + `[主页] 无横向滚动` |
| R07 | 「装着新版还是溢出」 | 钳制只由 MutationObserver 驱动，页面静止时一次都不跑 | 加 3 秒兜底定时器（只装一次） | 闸门内 `openDrawer` 刻意等 3.4s 跨过定时器再断言 |
| R08 | 设置面板顶部被顶栏盖住 | 顶栏钉 `z-index:1020` > 浮层宿主 1000 | 会话页改 999；有浮层时取 `overlayLayer.zIndex - 1` | 暂未纳入（人工核对） |
| R09 | 预设快捷链接「删除直接报错」 | 删掉预设后 `load()` 又把它补回来 → `deleteRows` 与数据条数不符 → UIKit 抛 `invalid number of rows` | 墓碑机制（删掉的默认条目记进 UserDefaults，补齐时跳过）+ `reloadData` 兜底 + 空态提示 | 暂未纳入（Swift 单测/手点） |
| R10 | iOS 16.3 白屏 | DSH vendor 含 RegExp lookbehind，需 iOS 16.4+ | 电脑端 `proxy.mjs` 通用 lookbehind 改写器（App 侧只探测不改写） | 暂未纳入（需在 16.3 真机） |
| R11 | 9009 等自建网页不能上下滑 | DSH 专用「钉高」补丁越界命中仪表盘 | `fixTop()` 加 `#root` 页面类型守卫 | 暂未纳入 |
| R12 | 顶栏被状态栏压住 | 状态栏高度下发给页面时误除 `UIScreen.scale`，59pt 被缩成 20px | CSS 像素在 `width=device-width` 下等于 pt，不再除 | 暂未纳入 |
| R13 | 「底部模型用量那些重叠」（费用明细 / CPU / 内存 / 会话费用 / 下载 / token 环挤成一行互相盖，真机实拍 CPU 的 CP 被盖） | 插件 dock（`VERcba_dock`）是 `flex/row/nowrap/center` 一行容器，几个插件（cost-meter、系统监控）的部件总宽一超 396px 就互相压 | `[class*="composerStack"] [class*="dock"]` 允许 `flex-wrap:wrap` + 行距 3px | `[dock] 插件行可换行` + `[dock] 部件零重叠` |
| R14 | 插件页左上角「打开目录」按钮压住页面标题、且点不动 | ① fab 挂在 `overlayLayer(z=20)` 里，自身 z 出不了该 context，被 `pageHead(z=999)` 盖住（elementFromPoint 命中页头而非 fab）；② fab(14..52) 与 h1(36..190) 相交 | 页头标题右移 `padding-left:56px` 让位 + 页头降 z 到 19（官方桌面层序：浮层在页头之上） | `[插件页] fab 中心可命中自身` + `[插件页] fab 不压页面标题` |
| R15 | 顶栏离状态栏一大截（标题 y≈122，应 ≈47，差值正好 59） | `fixTop()` 只在找到 `<header>` 时才清 frame 的 `padding-top:env(safe-area-inset-top)`（59px）；一旦某类页面没有 header，59px 无人清，整页下坠 | 新增 `fixTopChrome()` 兜底硬钳制：有 frame 就清 padding、有 centerCol 就把列顶校到 `sbHeight-2-TOP_SHIFT`（幂等绝对值），挂 applySidebarInset + 3 秒定时器 | `[主页] 零横向出血` 间接覆盖；页面类型扩展后补专项断言 |

> 说明：R08~R12 之所以「暂未纳入」，是因为闸门当前跑在 3083 单页面 + 无键盘/无真机低版本环境。
> **下一步补齐方向**：设置面板开合、快捷链接增删改、键盘弹起三态。

---

## 三、校验 SOP（每个新版本出包前必做）

### 前置
1. DSH Desktop 必须起来（3083 有响应）：
   ```powershell
   curl --noproxy '*' -o /dev/null -w "%{http_code}" http://127.0.0.1:3083/
   # 不是 200 就：Start-ScheduledTask -TaskName "DSHDesktop-Launch"（约 15~20 秒）
   ```
   ⚠️ DSH 桌面端**只能用计划任务拉起**，沙箱内直接启动一律被回收。

### 跑闸门
```bash
cd E:/desktop/所有skill/deepseek-harness-ios/_diag
env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u all_proxy -u ALL_PROXY \
  NODE_PATH="C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules" \
  "C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" regression.js
```
- 全量跑三尺寸：430×932 / 393×852 / 375×812，共 **30 条断言**。
- `--quick` 只跑 430（调试用，**发版必须跑全量**）。
- 退出码 `0` = 准予打包；`1` = **禁止打包**，按红条定位再修。

🔴 **必清代理环境变量**。否则 Playwright 继承系统代理，`127.0.0.1:3083` 全部 404/403、`#root` 空，会把「代理污染」误判成「DSH 挂了」。

### 资产同步（改了 Swift 里的注入代码后必须重做）
闸门依赖从 Swift 还原出来的两份资产，改完代码要重新生成，否则测的是旧代码：
```bash
cd _diag
python _extract_js.py        # → app_inject.js（从 ViewController.swift 抽 iosCompatShims，CSS 也在里面）
node --check app_inject.js   # 语法体检，不通过就是 Swift 里 \\( 之类的转义又写错了
```
> `app_inject.css` / `app_inject_old.css` 是早期做「修复前/修复后对照图」用的旧资产，闸门不依赖它们。

### 交付
🔴 **视觉类修复必须带修复前后对照图**，不许只说改了。

---

## 四、编码铁律（防止再引入会失效的补丁）

1. 🔴 **禁止写 CSS Module 哈希类名**（`ank0OG_*` / `uWtHQG_*` / `CZPbNW_*` / `NwyCaq_*` / `VYXhfG_*` / `MnhYfG_*` / `_727C8a_*`…）。
   一律用不变量：`[class*="语义片段"]`、`aria-label`、`role`、文本内容、几何关系、`data-*`。
   > DSH 的类名格式还会换形态（实测从 `ank0OG_headerCorner` 变成过 `_button_1rv3m_2`），只有语义片段稳定。
2. 🔴 **禁止单点补丁**。凡是「把某个按钮推回 N px」的写法一律否决，改写成「遍历全页 + 安全线」的通用钳制。
3. 🔴 **绝不用 `margin` 推回溢出元素**：实测 flex 子项上 `margin-right` 会 1:3 放大（加 8px → 退 24px）。一律 `transform: translateX(-Npx)`，纯视觉位移、1:1 精确、幂等。
4. 🔴 **横向收口一律 `overflow-x: clip`，绝不用 `hidden`**：`hidden` 会创建滚动容器、破坏 `position:sticky` 顶栏。
5. 🔴 **自动修复必须自带定时器兜底**：只靠 MutationObserver，页面静止时一次都不跑。
6. 🔴 **每修一个问题，就往闸门加一条断言**。断言缺失 = 下次必然复发。
7. 🔴 **断言只能打不变量**。打哈希类名的断言本身就会随换版失效，等于没有闸门。
8. Swift 多行字符串里 JS 的 `\(` 必须双写成 `\\(`，否则编译失败。

---

## 五、闸门设计说明（为什么这么测）

| 设计 | 原因 |
|---|---|
| 注入 App 的**完整 CSS + JS**（不只是 CSS） | 只注 CSS 测不出运行期钳制（`fixOverlayOverflow` / `alignComposerButtons`），会误报 |
| 溢出只看「左边缘在屏内、右边缘越界」 | 整体在屏外的（右侧面板收起时 `left == vw`、抽屉收起时 `left == -150`）是收起态，本来就该在屏外 |
| 重叠判定用 `elementFromPoint` 采样，不用 bounding box 比对 | 滚动容器的 bounding box 天生覆盖其下方吸底区 —— 曾因此误报「133 对重叠」，实为假警报 |
| 断言锚点只用 `aria-label` / `[class*=]` / 几何 | 哈希类名会漂移（见第一节 62/102） |
| 三尺寸各跑一遍 | 抽屉 252px 在 375 宽屏上占比更大，430 绿不代表 375 绿 |

---

## 六、版本台账

| 版本 | build | CI run | 要点 |
|---|---|---|---|
| 1.0.122 | 61 | `39266712218` | 横向溢出第一轮（单点补丁，后会复发） |
| 1.0.123 | 62 | `39275502511` | 通用出血钳制 + 3 秒兜底定时器 |
| 1.0.124 | 67 | `39351887630` | 抽屉 252 收敛 + 齿轮 v1.0.9 + 会话框按钮居中 + 删除崩溃 + 费用计量浮层遮挡 + **回归闸门建立** |
| 1.0.125 | 本次 | 本次 | 底部插件 dock 换行防重叠（R13）+ 插件页 fab 可点/不压标题（R14）+ 顶栏兜底硬钳制（R15）+ 闸门扩到 34 条 |

## 七、闸门自身踩过的坑（复用必读）

1. **跨 IIFE 作用域调函数 = ReferenceError 被吞**：`num/setP/sbHeight` 定义在 4154 行边界之后的块里，`applySidebarInset` 所在块调不到 —— `fixPageHeadFab` 第一版因此「每 3 秒都跑、却什么都没写进去」。新函数一律**自包含**（局部 `setPI`、就地 parseFloat），并必须实测「内联样式真的写进去了」才算修完。
2. **z-index 出不了别人的 stacking context**：fab z=1000 挂在 overlayLayer(z=20) 里，被根 context 的 pageHead(z=999) 压住 —— 抬 fab 自身没用，要么降对方、要么换宿主。
3. **验证「没修好」先查「跑没跑」再查「对不对」**：先手工复算判定条件确认逻辑无误，再查作用域/调用链，两步定位。
