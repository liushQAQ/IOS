        (function () {
          var css = [
            '/* ===== v1.0.73 顶栏修复：flex 自然排布（替换 v1.0.70 的绝对定位方案） ===== */',
            '/* v1.0.70 把左侧按钮 position:absolute 钉死坐标，只按「会话页」量测过；',
            '   首页/新会话页 DOM 结构不同，被钉到屏幕边缘外 → 顶栏消失、左右各卡半个按钮。',
            '   现在全部回到文档流，用 flex 对齐，两种页面共用同一套规则。 */',
            '',
            'html body [data-phase] header,',
            'html body .ank0OG_header {',
            '  position: sticky !important;',
            '  top: 0 !important;',
            '  z-index: 1020 !important;',
            '  display: flex !important;',
            '  flex-direction: column !important;',
            '  /* v1.0.104：顶栏纵向位置绝不再用固定像素猜。DSH 自带移动端样式表里',
            '     [data-mobile-nav="frame"]{padding-top:env(safe-area-inset-top)} 之类的规则',
            '     权重比注入样式高，且真机 env() 有值、本地为 0，猜像素必然出错。',
            '     这里只保留结构，纵向位置统一交给运行时几何校正 __dshLayoutFix 实测修正。 */',
            '  padding: 2px 8px 0 8px !important;',
            '  min-height: 0 !important;',
            '  flex: none !important;',
            '  box-sizing: border-box !important;',
            '  max-width: 100vw !important;',
            '  overflow: visible !important;',
            '  background: transparent !important;',
            '}',
            '',
            '/* v1.0.104：顶部 36px 首行内部住着左右两个抽屉开关，绝对不能整块 display:none，',
            '   也不能给 pointer-events:none（会连带把开关点不动）。纵向压缩改由',
            '   __dshLayoutFix 用「标题行负 margin 上提」实现，这里只保证开关可点、无多余外边距。 */',
            'header .ank0OG_headerLeading,',
            '.ank0OG_headerLeading,',
            '[data-conversation-header-leading] {',
            '  pointer-events: auto !important;',
            '  margin: 0 !important;',
            '}',
            '',
            '/* 确保 overlayLayer 挂载层本身透明，杜绝首页与主界面全局发灰变暗 */',
            '.CZPbNW_overlayLayer,',
            '[class*="overlayLayer"] {',
            '  background: transparent !important;',
            '  background-color: transparent !important;',
            '}',
            '',
            '/* 新建会话首页目录按钮（问题 4 彻底修复）：精准位于状态栏下方安全区（54px + 8px = 62px，v1.0.109 起再上移 --dsh-topshift），饱满居中不被截断 */',
            '[data-mobile-nav="fab"] {',
            '  display: inline-flex !important;',
            '  visibility: visible !important;',
            '  opacity: 1 !important;',
            '  position: fixed !important;',
            '  top: calc(var(--dsh-statusbar, 54px) + 8px - var(--dsh-topshift, 0px)) !important;',
            '  left: 14px !important;',
            '  width: 38px !important;',
            '  height: 38px !important;',
            '  padding: 0 !important;',
            '  border: none !important;',
            '  border-radius: 8px !important;',
            '  background: var(--dsw-alias-interactive-bg-hover, rgba(125, 125, 125, 0.16)) !important;',
            '  color: var(--dsw-alias-label-primary, currentColor) !important;',
            '  box-shadow: none !important;',
            '  z-index: 99 !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '}',
            '',
            '/* 会话页时隐藏 fallback 浮动按钮，把空间交给顶栏内置侧栏按钮 */',
            '[data-phase="active"] [data-mobile-nav="fab"] {',
            '  display: none !important;',
            '}',
            '',
            '/* 侧栏收起时彻底隐藏抽屉内部残留的切换按钮，杜绝屏幕左边缘天上露出半个多余小按钮 */',
            '[data-sidebar-collapsed] [class*="WYye1W_toggle"],',
            '[data-sidebar-collapsed] button[aria-label="打开侧边栏"] {',
            '  display: none !important;',
            '  visibility: hidden !important;',
            '}',
            '',
            '[data-phase] header [class*="titleRow"],',
            '.ank0OG_titleRow {',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  height: auto !important;',
            '  min-height: 32px !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  width: 100% !important;',
            '  max-width: 100% !important;',
            '  box-sizing: border-box !important;',
            '  gap: 6px !important;',
            '  overflow: hidden !important;',
            '}',
            '',
            '/* 左侧抽屉开关回到文档流：不再绝对定位，与标题同一行自然排列 */',
            'header button[aria-label="打开目录"],',
            'header button[aria-label="收起目录"],',
            'header button[aria-label="打开侧边栏"],',
            'header button[aria-label="收起侧边栏"],',
            '[data-mobile-nav="toggle"] {',
            '  /* v1.0.83：页面在具体会话里把这颗按钮收成 28px，新建会话页是 38px，两个页面大小不一致。',
            '     统一成页面自带的 38px。 */',
            '  width: 38px !important;',
            '  height: 38px !important;',
            '  min-width: 38px !important;',
            '  min-height: 38px !important;',
            '  position: static !important;',
            '  transform: none !important;',
            '  top: auto !important;',
            '  left: auto !important;',
            '  right: auto !important;',
            '  margin: 0 !important;',
            '  padding: 0 !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  flex: none !important;',
            '  order: -1 !important;',
            '  margin-left: 0 !important;',
            '  z-index: auto !important;',
            '}',
            '/* v1.0.85：侧栏收起后残留的开关按钮滑到屏幕左边外，还露一截。滑出屏幕的隐藏。 */',
            '',
            'html body [data-phase] header [class*="titleCluster"],',
            'html body .ank0OG_titleCluster {',
            '  /* v1.0.75：原来 flex:1 把标题簇拉成 326px，标题只占左边 57px，右边空两百多像素。',
            '     按内容收缩后，margin-left:auto 把空位吃到左边，',
            '     标题、目录、智能体按钮整组靠右，贴近右侧边栏按钮。 */',
            '  flex: 0 1 auto !important;',
            '  width: auto !important;',
            '  margin-left: auto !important;',
            '  min-width: 0 !important;',
            '  height: auto !important;',
            '  min-height: 32px !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  overflow: hidden !important;',
            '  gap: 6px !important;',
            '  margin: 0 !important;',
            '  padding: 0 !important;',
            '}',
            '',
            '[data-phase] header [class*="headerUtilities"],',
            '.ank0OG_headerUtilities {',
            '  min-height: 32px !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  flex: none !important;',
            '  margin-left: 0 !important;',
            '}',
            '[data-phase] header [class*="headerCorner"],',
            '.ank0OG_headerCorner {',
            '  min-height: 32px !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  flex: none !important;',
            '  margin-left: auto !important;',
            '}',
            '/* 新建会话首页无需打开右侧边栏，隐藏右上角无用占位按钮 */',
            'header.ank0OG_headerBlank [class*="headerCorner"],',
            'header.ank0OG_headerBlank .ank0OG_headerCorner {',
            '  display: none !important;',
            '}',
            '',
            '/* v1.0.83：打开目录被挪进标题行后也命中了这条，被压成 32px，',
            '   和页面自带的 38px 按钮叠在一起。把它排除，保留原始尺寸。 */',
            '[data-phase] header [class*="titleRow"] button:not([aria-label="打开目录"]):not([aria-label="收起目录"]):not([aria-label="打开侧边栏"]):not([aria-label="收起侧边栏"]):not([aria-label*="智能体团队"]),',
            '[data-phase] header [class*="titleRow"] [role="button"]:not([aria-label="打开目录"]):not([aria-label="收起目录"]):not([aria-label="打开侧边栏"]):not([aria-label="收起侧边栏"]):not([aria-label*="智能体团队"]),',
            'button[aria-label="更多操作"],',
            'button[aria-label="打开右侧边栏"],',
            'button[aria-label="收起右侧边栏"],',
            'button[aria-label="文件浏览"],',
            '.ank0OG_headerActions button:not([aria-label="打开目录"]):not([aria-label="收起目录"]):not([aria-label="打开侧边栏"]):not([aria-label="收起侧边栏"]):not([aria-label*="智能体团队"]),',
            '.ank0OG_headerCorner button {',
            '  width: 32px !important;',
            '  height: 32px !important;',
            '  min-height: 32px !important;',
            '  min-width: 32px !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  flex: none !important;',
            '}',
            '',
            '/* 彻底消灭与右侧抽屉开关重叠的文件夹图标（包括文件浏览、工作区文件） */',
            'button[aria-label="文件浏览"],',
            'button[title="文件浏览"],',
            'button[aria-label="工作区文件"],',
            'button[aria-label*="文件树"],',
            'button[aria-label*="浏览文件"],',
            '[data-mobile-nav="files"],',
            '.ank0OG_headerCorner button:has(svg path[d*="M20 20a2"]),',
            '.ank0OG_headerCorner button:has(svg path[d*="M4 4h16"]),',
            '.ank0OG_headerCorner button:has(svg [d*="M3 7v10"]),',
            '.ank0OG_headerCorner > button:not([data-sidebar-right-expand]):not([aria-label="打开右侧边栏"]):not([aria-label="收起右侧边栏"]) {',
            '  display: none !important;',
            '  visibility: hidden !important;',
            '  width: 0 !important;',
            '  height: 0 !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  pointer-events: none !important;',
            '}',
            '',
            '/* 智能体团队：左侧留足间距，杜绝最左侧数字被手机屏幕边缘切断，单行水平并排（老总铁律） */',
            'button[aria-label="智能体团队"],',
            'button[aria-label*="智能体团队"] {',
            '  margin-left: 6px !important;',
            '  width: auto !important;',
            '  min-width: max-content !important;',
            '  max-width: none !important;',
            '  white-space: nowrap !important;',
            '  flex: 0 0 auto !important;',
            '  display: inline-flex !important;',
            '  flex-direction: row !important;',
            '  align-items: center !important;',
            '  gap: 5px !important;',
            '  height: 28px !important;',
            '  padding: 0 10px !important;',
            '  position: static !important;',
            '  border-radius: 14px !important;',
            '  word-break: keep-all !important;',
            '}',
            'button[aria-label="智能体团队"] *,',
            'button[aria-label*="智能体团队"] * {',
            '  white-space: nowrap !important;',
            '  overflow: visible !important;',
            '  word-break: keep-all !important;',
            '}',
            '',
            '/* 后台任务胶囊指示器：允许自适应宽度，确保完整显示数字（如 1）杜绝截断为省略号 */',
            'button[aria-label*="后台任务"],',
            '[data-job-indicator] button {',
            '  width: auto !important;',
            '  min-width: 28px !important;',
            '  padding: 0 6px !important;',
            '  white-space: nowrap !important;',
            '}',
            '',
            '[data-phase] header [class*="crumbs"],',
            '.ank0OG_crumbs {',
            '  flex: 0 1 auto !important;',
            '  min-width: 0 !important;',
            '  max-width: 24vw !important;',
            '  min-height: 32px !important;',
            '  height: auto !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '}',
            '',
            '[data-phase] header [class*="tabs"],',
            '.ank0OG_tabs {',
            '  margin-top: 4px !important;',
            '  margin-bottom: 6px !important;',
            '  flex: none !important;',
            '  max-width: 100% !important;',
            '}',
            '',
            '/* 侧栏抽屉三段式布局（老总铁律）：',
            '   1. 顶部顶栏（图片 + deepseek HARNESS 字样 + 新会话 + 插件列表）固定内容；',
            '   2. 底部（余额/今日/柱状图/导出日志 + 齿轮【设置】按钮）固定吸底；',
            '   3. 中间会话列表内容区（regionArea）根据滑块纵向滚动！ */',
            '[class*="sidebarCol"],',
            '.CZPbNW_sidebarCol {',
            '  /* 🔴 v1.0.110：老总「左侧侧边栏打开页面太宽了，缩到现在宽度的70%」。',
            '     真机实测自然宽 360.3pt（占屏 83.8%）× 0.70 = 252pt。',
            '     ⚠️ 这条规则实测**打不过 DSH 原生规则**（沙箱自然宽 374.5pt、DSH max-width 92%，',
            '     命中规则的只有我们这一条却完全不见效）—— 真正生效的是 shim_11 里 applyDrawerWidth()',
            '     写的**内联 !important**。这里同步成同一个值，只为「万一某机型上样式表能赢」时',
            '     不至于又变回 280px / 被 min-width 撑开。 */',
            '  width: 252px !important;',
            '  max-width: 252px !important;',
            '  min-width: 0 !important;',
            '  padding-top: calc(var(--dsh-statusbar, 54px) + 6px - var(--dsh-topshift, 0px)) !important;',
            '  padding-bottom: max(16px, env(safe-area-inset-bottom)) !important;',
            '  height: 100vh !important;',
            '  height: 100dvh !important;',
            '  max-height: 100vh !important;',
            '  max-height: 100dvh !important;',
            '  box-sizing: border-box !important;',
            '  overflow: hidden !important;',
            '  background: var(--dsw-alias-bg-base, #ffffff) !important;',
            '  z-index: 1200 !important;',
            '}',
            '/* 🔴 v1.0.123：抽屉被强制压到 252px 后，DSH 内部内容仍按原始 280px 排布 ——',
            '   实测 90 个元素右边界超出抽屉（bJOniG_root 280 / regionArea 272 / 会话行 256 /',
            '   账号行 270），结果就是：会话标题顶出抽屉右缘被硬切、右侧时间「1分钟」只剩一半、',
            '   齿轮按钮 right=266 被裁掉右半边、底栏右侧漏出主页面输入框。',
            '   三条通用规则把内容真正收进抽屉（一律 [class*="xxx"]，不写任何哈希类名）：',
            '   ① 抽屉内一切元素 max-width 不超过抽屉；② flex 容器允许收缩（min-width:0），',
            '      否则子项按内容撑宽；③ 单行文字一律省略号，绝不顶出抽屉。 */',
            '[class*="sidebarCol"] * {',
            '  max-width: 100% !important;',
            '  box-sizing: border-box !important;',
            '}',
            '[class*="sidebarCol"] [class*="root"],',
            '[class*="sidebarCol"] [class*="Area"],',
            '[class*="sidebarCol"] [class*="List"],',
            '[class*="sidebarCol"] [class*="list"],',
            '[class*="sidebarCol"] [class*="Section"],',
            '[class*="sidebarCol"] [class*="Row"],',
            '[class*="sidebarCol"] [class*="row"],',
            '[class*="sidebarCol"] [class*="Body"] {',
            '  min-width: 0 !important;',
            '}',
            '[class*="sidebarCol"] [class*="sessionRow"],',
            '[class*="sidebarCol"] [class*="projectRow"],',
            '[class*="sidebarCol"] [class*="rowText"],',
            '[class*="sidebarCol"] [class*="label"],',
            '[class*="sidebarCol"] [class*="Label"],',
            '[class*="sidebarCol"] [class*="title"],',
            '[class*="sidebarCol"] [class*="ooter"] {',
            '  min-width: 0 !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '}',
            '[class*="sidebarCol"] [class*="sessionRow"] *,',
            '[class*="sidebarCol"] [class*="projectRow"] * {',
            '  min-width: 0 !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '}',
            '[class*="sidebarCol"] .cm-footer-stack,',
            '[class*="sidebarCol"] .cm-peak-progress,',
            '[class*="sidebarCol"] .cm-foot {',
            '  width: 100% !important;',
            '  max-width: 100% !important;',
            '  min-width: 0 !important;',
            '  overflow: hidden !important;',
            '}',
            '[class*="sidebarCol"] .cm-peak-rail-label {',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '}',
            '@media (prefers-color-scheme: dark) {',
            '  [class*="sidebarCol"],',
            '  .CZPbNW_sidebarCol,',
            '  [class*="WYye1W_root"],',
            '  .WYye1W_root {',
            '    background: #18181b !important;',
            '  }',
            '}',
            '[class*="WYye1W_root"],',
            '.WYye1W_root {',
            '  width: 100% !important;',
            '  height: 100% !important;',
            '  max-height: 100% !important;',
            '  display: flex !important;',
            '  flex-direction: column !important;',
            '  overflow: hidden !important;',
            '  padding: 0 !important;',
            '  box-sizing: border-box !important;',
            '}',
            '[class*="WYye1W_logoRow"],',
            '.WYye1W_logoRow {',
            '  flex: none !important;',
            '  margin: 0 !important;',
            '  padding: 0 10px 10px 10px !important;',
            '  position: static !important;',
            '}',
            '[class*="WYye1W_newSession"],',
            '.WYye1W_newSession {',
            '  flex: none !important;',
            '  margin-bottom: 6px !important;',
            '}',
            '[class*="WYye1W_panelList"],',
            '.WYye1W_panelList {',
            '  flex: none !important;',
            '}',
            '/* 中间会话列表内容区：独立纵向惯性滑动 */',
            '[class*="WYye1W_regionArea"],',
            '.WYye1W_regionArea {',
            '  flex: 1 1 auto !important;',
            '  min-height: 0 !important;',
            '  overflow-y: auto !important;',
            '  -webkit-overflow-scrolling: touch !important;',
            '  overscroll-behavior: contain !important;',
            '}',
            '/* 底部操作区与设置：固定吸底，绝不溢出屏幕外 */',
            '[class*="WYye1W_footArea"],',
            '.WYye1W_footArea {',
            '  flex: none !important;',
            '  margin: 0 !important;',
            '  padding: 10px 10px 0 10px !important;',
            '  border-top: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,0.08)) !important;',
            '  position: static !important;',
            '  background: inherit !important;',
            '}',
            '[class*="WYye1W_newSession"],',
            '[class*="WYye1W_panelRow"] {',
            '  padding-left: 10px !important;',
            '  padding-right: 10px !important;',
            '  font-size: 13px !important;',
            '}',
            '/* 移动端触摸屏隐藏电脑端键盘快捷键 Ctrl+Alt+N，彻底释放“新会话”按钮文字空间 */',
            '[class*="WYye1W_newSessionShortcut"] {',
            '  display: none !important;',
            '}',
            '[class*="WYye1W_newSessionLabelMask"],',
            '[class*="WYye1W_newSessionContent"] {',
            '  width: 100% !important;',
            '  max-width: 100% !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 8px !important;',
            '}',
            '[class*="WYye1W_newSessionLabel"] {',
            '  display: inline-block !important;',
            '  opacity: 1 !important;',
            '  font-size: 13px !important;',
            '  font-weight: 500 !important;',
            '}',
            '[class*="WYye1W_logoRow"] {',
            '  padding: 0 8px !important;',
            '}',
            '',
            '/* 会话消息内容区 (viewArea) 底部常驻充足裕量，避免输入框遮挡 */',
            '[class*="viewArea"],',
            '.ank0OG_viewArea {',
            '  padding-bottom: 160px !important;',
            '  box-sizing: border-box !important;',
            '}',
            '',
            '/* 底部 dock 统计条与操作栏：UI 页面布局不改，保持原有自然结构，随整页上移自然完整呈现 */',
            '[data-slot="conversation.composer.dock"],',
            '.z4IYsq_root,',
            '[data-composer-stats="true"] {',
            '  margin-bottom: 8px !important;',
            '}',
            '',
            '/* 输入框底栏容器：底栏紧随整体上移，下方保留充足舒适的两行呼吸空间 */',
            '[class*="ank0OG_footArea"],',
            '[class*="footArea"],',
            '.ank0OG_footArea,',
            '[data-conversation-footer],',
            '[class*="inputContainer"],',
            '[class*="promptInputArea"] {',
            '  padding-bottom: max(16px, env(safe-area-inset-bottom)) !important;',
            '  box-sizing: border-box !important;',
            '}',
            '',
            '/* ===== 🔴 v1.0.110 撤销「键盘弹起时隐藏统计/费用条」这条老规则 =====',
            '   老总 2026-10-16：「键盘弹出会话框，下面的插件显示用量/token/上下文的插件不显示，为什么。宽度是够的，预留了」。',
            '   真因（三态复现 _probe_kbattr.cjs）：原生侧 keyboardFrameWillChange 在键盘弹起时会给 body 打上',
            '   data-keyboard-open="true"（ViewController.swift 第 4138 行），而下面这几条规则一撞，',
            '   就把整个 dock 槽位 display:none —— 而该槽位里装的正好是整排「用量/token/上下文」：',
            '     · [data-slot="conversation.composer.dock"] 的 innerText 实测 =',
            '       「1 轮 32 步·303 tok/s | 2.2M tok·缓存命中 79% | 费用明细 | CPU 52.19% · 内存 48.70% |',
            '        本会话 ¥3.3461 · 命中 78.6% · 输入 472K · 缓存 1.7M · 输出 4.2K | gemini-gateway:...」',
            '   实测三态（430x932 dsf3，会话页 vh=592，v1.0.109 构建）：',
            '     ① 未打标记 → .cm-stat-dock y468..490 / .cm-session-cost y493..513 / .cm-model-top y516..536，display 正常；',
            '     ② 打上标记 → 三者全部 y=0 h=0（最近 display:none 祖先 = DIV），',
            '                  [data-slot="conversation.composer.dock"] 与 .z4IYsq_root 双双 display:none；',
            '     ③ 摘掉标记 → 三者原样恢复（y468..536）。',
            '   这条规则的历史意图是「杜绝穿透键盘完成条」，而那个问题早已由 shim_16 的键盘两态 + 座位钉底解决，',
            '   现在它只剩副作用。老总明确要求显示，故整块撤销。',
            '   （保留下面两条不带键盘前缀的规则：它们只在「费用明细」细展浮层里命中，与键盘无关。） */',
            '[class*="costMeter"][class*="detail"],',
            '.dsh-cost-meter-bar button {',
            '  display: none !important;',
            '}',
            '/* 聊天主界面底栏（输入框外层容器）：适度紧凑上移，消除多余虚假空白 */',
            '.ank0OG_inputRoot,',
            '[class*="ank0OG_inputRoot"],',
            '[class*="inputRoot"] {',
            '  margin-bottom: max(6px, calc(env(safe-area-inset-bottom) + 2px)) !important;',
            '}',
            '',
            '/* ===== v1.0.108 会话页「底栏床垫」（老总 2026-10-16：会话记录穿过聊天框从底部露出）=====',
            '   会话页 seat 下沿到屏幕底那 46pt 必须有实心底色，否则滚动的消息就从缝里顶出来。',
            '   底色/厚度都由 shim_14 的 fixBottom 运行时实测写入（--dsh-pagebg 取 DSH 自己的页面底色，',
            '   亮/暗主题自动跟随），这里只留一条属性选择器做兜底：',
            '   React 重渲染会把 seat 的内联样式整条抹掉，而 data-dsh-bed 属性 + CSS 变量不会 ——',
            '   有这条规则，抹掉之后到下一趟校正（≤320ms）之间也不会突然漏光。 */',
            '[data-dsh-bed="1"] {',
            '  bottom: 0 !important;',
            '  padding-bottom: var(--dsh-bed, 46px) !important;',
            '  background-color: var(--dsh-pagebg, transparent) !important;',
            '}',
            '',
            '/* ===== v1.0.115 设置页开关被拉成「通栏白条」（老总 2026-10-18）=====',
            '   老总原话：「显示代码工作视图，下面一长条白色。这里应该是按钮吧，暗黑模式下应该是灰色按钮开关？」',
            '   🔴 这不是我们注入层引入的，是 **DSH 官方自己的移动端适配规则**把开关拉满了',
            '     （_diag_switch_rule.cjs 全量扫命中清单，只有它带 !important）：',
            '       @media (max-width:1023px){',
            '         [aria-modal="true"] [class$="_section"] [class$="_row"] > :last-child {',
            '           width:100% !important; max-width:none !important; } }',
            '     它本意是让「行内最后一个控件」在手机上通栏（对下拉/按钮是合理的），',
            '     但 `:last-child` 把开关也一起吃了 ⇒ 36px 的开关撑成整行 390px 的白条。',
            '   🔴 尺寸/配色 A/B 铁证（_cmp_switch.cjs，同一份 DSH）：',
            '     桌面 1280 暗色（官方）：36x20，轨道 rgb(249,250,251)、滑块 rgb(15,17,21)',
            '     桌面 1280 亮色（官方）：36x20，轨道 rgb(15,17,21)、滑块 rgb(255,255,255)',
            '     手机 430  暗色（官方）：**390x20**（就是老总看到的那条），父行 flex/column/align:stretch',
            '     ⇒ 颜色本来就是主题相关变量、暗色下官方就是白轨道，**颜色一个字都不许改**；',
            '       真正错的只有宽度，而窄屏下桌面那套 flex/row 变成了 column+stretch。',
            '   修法：把宽度锁回官方桌面口径 36x20。⚠️ 特异性必须压过官方那条 (0,4,0)：',
            '     本组第一条照抄它的形状（4 属性 + 1 元素 = (0,4,1)）才能赢；',
            '     只写 `button[role="switch"]`（0,1,1）**打不过** —— 实测仍然 390px。',
            '   效果：宽度锁死后 stretch 对它失效，自动左对齐，与上方「字号大小」输入框、',
            '         「工作步骤展示」下拉按钮同一竖线。 */',
            '[aria-modal="true"] [class$="_section"] [class$="_row"] > button[role="switch"],',
            '[class$="_row"] > button[role="switch"],',
            'button[role="switch"] {',
            '  flex: 0 0 auto !important;',
            '  width: 36px !important;',
            '  min-width: 36px !important;',
            '  max-width: 36px !important;',
            '  height: 20px !important;',
            '  min-height: 20px !important;',
            '  max-height: 20px !important;',
            '}',
          ].join('\n');
          function inject() {
            var root = document.head || document.documentElement;
            if (!root) { setTimeout(inject, 30); return; }
            var old = document.getElementById('dsh-ios-header-fix');
            if (old && old.parentNode) old.parentNode.removeChild(old);
            var style = document.createElement('style');
            style.id = 'dsh-ios-header-fix';
            style.textContent = css;
            root.appendChild(style);
          }
          inject();
          // 🔴 v1.0.109：老总 2026-10-16「顶栏距离 iOS 系统状态栏还有空间，整体 UI 从顶栏开始上移一格文字间距」。
          //   量测依据（老总真机截图 1290x2796 = 430x932@3x，逐行像素剖面 _prof.cjs / _linepitch.cjs）：
          //     · 安全区 top = 59pt；他的系统状态栏（状态栏增强主题）文字最下沿 = y45.0pt
          //       （「周五 10/16 九月初七」那一行，实测带 y105..135px）；
          //     · 我们的顶栏顶 = 57pt → 中间空出 12pt 纯色带（亮色主题下是一条肉眼明显的白富余）。
          //   取值 12pt：正好吃掉这段空白；顶栏内图标（x 11.7..38.3pt）落到 48..71pt，
          //   与状态栏文字（止于 45pt）仍留 3pt 呼吸、零重叠。
          //   ⚠️ 不能取「一整格正文行距」的 22pt（实测正文行距 = 22.0pt）—— 那会把顶栏图标
          //      直接压到「周五 10/16 九月初七」上（对照图已附）。
          //   值定义在这里（而不是 shim_14）：因为 __dshSetStatusBar 给抽屉/面板写的是**内联**
          //   padding-top，样式表压不过它，必须在这一处统一扣减，shim_14 再从全局读。
          //
          // 🔴 v1.0.110：老总 2026-10-16 再提「顶栏还可以上移一刚文字间距。距离 iOS 顶栏还有空间。」
          //   同一坐标系复量（老总新截图 clipboard-...e77b7b14.jpg，x40..130 窗口 _linepitch.cjs）：
          //     · iOS 状态栏日期行「周六 10/17 九月初八」像素带 y101..125px（全宽）/ 103..121px（左窗）
          //       → 内容下沿 125px = 41.7pt；
          //     · 我们的顶栏图标绘制带 y186..227px = 62.0..75.7pt
          //       （🔴 同一窗口跑沙箱 v1.0.109 会话页渲染图 v110_sess_kbdown.png 得 186..227px，
          //        与老总截图**逐像素一致** → 证明老总运行的确实就是 v1.0.109，下面的差值可直接换算）；
          //     · 当前间隙 = 186 − 125 = 61px = 20.3pt（确实还有空间，老总判断正确）。
          //   🔴 v1.0.111（老总 2026-10-17 07:21，附微信顶栏截图对比）：「顶栏太靠上了。需要下移半格文字高度吧。」
          //   「一格」在 v1.0.109 时已与老总对齐为 12pt（他当时认可 12pt 的位移量），故「半格」= 6pt。
          //   TOP_SHIFT 24 → 18（顶栏顶 33 → 39pt；图标带 150..191px → 168..209px，实测）。
          //   上移量→间隙对照（1pt = 3px，图标带/间隙均为实测或按实测等比外推）：
          //     TOP_SHIFT=0                  → 顶栏顶 57pt（= v1.0.108，与 iOS 安全区底 59pt 基本齐平）
          //     TOP_SHIFT=12（v1.0.109）      → 图标带 186..227px，间隙 61px = 20.3pt  ← 老总说「还有空间」
          //     TOP_SHIFT=18（v1.0.111 本轮） → 图标带 168..209px，间隙 43px = 14.3pt  ← 老总说「下移半格」
          //     TOP_SHIFT=24（v1.0.110）      → 图标带 150..191px，间隙 25px =  8.3pt  ← 老总说「太靠上」
          //     TOP_SHIFT=30                 → 图标带 132..173px，间隙  7px =  2.3pt  ← 安全极限
          //     TOP_SHIFT=36（反例）          → 图标带 114..155px，**重叠 11px = 3.7pt**，压到「九月初八」底缘
          //   修改这一个值即可全局联动（fixTop 的 col.margin-top / fixFab 的 top /
          //   抽屉与右侧面板的内联 padding-top / --dsh-topshift CSS 变量），无需改别处。
          window.__dshTopShift = 18;
          // v1.0.76：原生侧把状态栏高度（CSS 像素）下发到这里。
          // 写成 CSS 变量，顶栏 padding 用它，换机型、转屏都跟着变。
          window.__dshSetStatusBar = function (px) {
            var h = Math.max(0, px || 0);
            document.documentElement.style.setProperty('--dsh-statusbar', h + 'px');
            // 🔴 v1.0.128：原生专属状态栏变量。DSH 自己也会写 --dsh-statusbar 且写得偏大（实测 75），
            //   CSS 直修的列顶公式必须用原生下发的这份，绝不能被 DSH 的值带偏。
            document.documentElement.style.setProperty('--dsh-sb-native', h + 'px');
            // v1.0.109：把整体上移量也广播成 CSS 变量，让样式表那几处 calc() 一起跟随。
            var shift = (typeof window.__dshTopShift === 'number') ? window.__dshTopShift : 0;
            document.documentElement.style.setProperty('--dsh-topshift', shift + 'px');
            // 原生下发的才是真·安全区高度（iPhone 14 Pro Max = 59）。DSH 自己也会写同名
            // 变量、而且写得比我们大（实测 75），会把几何校正的目标带偏，所以这里单独存一份。
            window.__dshNativeStatusBar = h;
            // v1.0.104：顶栏纵向位置禁止在这里写死（旧版写 margin-top:4px 会覆盖运行时几何校正，
            // 而且真机多出来的那段空白根本不是 header 撑的，写死必然对不上）。
            var headers = document.querySelectorAll('header');
            for (var i = 0; i < headers.length; i++) {
              // 🔴 v1.0.115：只把**主顶栏**清透明（治顶栏发灰）。住在滚动容器里的页面内
              //   吸顶条（如插件页 pageHead）必须保留底色，否则滚上去的内容会从它下面透出来。
              if (headers[i].dataset && headers[i].dataset.dshPageHead === '1') continue;
              var hp = headers[i].parentElement;
              if (hp) {
                var hpcs = null;
                try { hpcs = getComputedStyle(hp); } catch (e) {}
                if (hpcs && (hpcs.overflowY === 'auto' || hpcs.overflowY === 'scroll')) continue;
              }
              headers[i].style.setProperty('background', 'transparent', 'important');
            }
            if (window.__dshLayoutFix) { try { window.__dshLayoutFix(); } catch (e) {} }
            // 侧栏外层让出状态栏高度，内部子容器（.dMHGga_panel、.YdIzba_header 等）严禁重复叠加 padding-top，保持顶栏高度不变！
            var cols = document.querySelectorAll('[class*="sidebarCol"], .CZPbNW_sidebarCol, [class*="rightbarCol"], .CZPbNW_rightbarCol');
            for (var j = 0; j < cols.length; j++) {
              cols[j].style.setProperty('padding-top', (h + 6 - shift) + 'px', 'important');
            }
            // 清理子容器可能叠加的多余 padding-top，保证打开文件页面时顶栏与主会话绝对平齐！
            var subCols = document.querySelectorAll('.dMHGga_session, .dMHGga_panel, .YdIzba_header');
            for (var sj = 0; sj < subCols.length; sj++) {
              subCols[sj].style.setProperty('padding-top', '0px', 'important');
            }
            // 🔴 v1.0.108 撤销「把 body / 空标签容器 / frame / root 全部清成透明」这条老逻辑。
            //    A/B 实测（2026-10-16，430x932 dsf3 iPhone UA，暗色）：
            //      官方原版：body / [data-mobile-nav=frame] / .ank0OG_root / .CZPbNW_frame 四层**都自带
            //                rgb(21,21,23)**（页面底色由 DSH 自己铺），全屏均匀、无接缝；
            //      我们的构建：这四层被清成 rgba(0,0,0,0)，而顶栏几何校正把 .ank0OG_root 整体下推 57px
            //                （fixTop 的 margin-top），于是 0..57 那条（状态栏下方）没有任何元素铺色，
            //                直接透出 WebView 自身的底色 → 本机 Edge 是 #121212、真机 iOS 是近纯黑，
            //                与页面底色 #151517 之间出现一条**横向色阶断层**。
            //                实测实拍：老总截图 y0..55 = #010103（纯黑）、y60 起 = #16151a（DSH 页面底）。
            //    这正是老总 2026-10-16 报的「暗黑模式下颜色灰色不是和背景一致的黑色，有分层，不好看」。
            //    结论：这几层的底色是 DSH 的原生皮肤，**绝不能替它清掉**；一律交还 DSH 自己管。
            //    （历史遗留注释说「新建会话页的灰是 body 和空标签容器的底色」——真凶不是这几层，
            //      已由 A/B 证伪：官方同处就是同一个灰，属 DSH 皮肤色。）
          };
          // 确保 overlayLayer 挂载层全透明，杜绝首页全局暗淡发灰
          function ensureSidebarOverlay() {
            var layers = document.querySelectorAll('[class*="overlayLayer"]');
            for (var i = 0; i < layers.length; i++) {
              layers[i].style.setProperty('background', 'transparent', 'important');
              layers[i].style.setProperty('background-color', 'transparent', 'important');
            }
          }
          // ===== 🔴 v1.0.113 右侧面板顶部留白：把官方重复的那一段压掉 =====
          //   老总 2026-10-17 09:20「留白问题也要修复」（承接上一轮「具体截图看看」，
          //   说明图 v1.0.111_右侧面板顶部留白_具体说明.png）。
          //   实测链（沙箱 430x932 dsf3 iPhone UA + __dshSetStatusBar(59)，进会话 → 开右侧面板；
          //   面板在手机上以**全屏浮层**呈现：width:100vw、data-sidebar-right-panel="fullscreen"）：
          //     [data-dockkit-surface="true"]             padding-top: 65px  ← 状态栏让位（59+6），**必须保留**
          //       └ [role="tablist"][data-dockkit-strip]  padding-top: 65px  ← 重复的一段，纯浪费
          //           └ [data-dockkit-strip-tabs]「开始」   y = 116pt
          //   ⇒ 两段 65 叠在一起，状态栏（59pt）到「开始」那一行之间空了 57pt，这就是老总看到的那块空白。
          //   A/B 矩阵实测（_probe_panel_matrix.cjs，1:1 线性）：
          //     surface 65→12 / 65→20 ：把 _surface 的状态栏让位也一起压掉了（strip 的 65 会顶上来）
          //       →「开始」落到 63 / 71，63 < 我们顶栏底 115 ⇒ 内容钻进状态栏/顶栏下面，❌ 不可取
          //     strip   65→12        ：「开始」116 → **71pt** ✅（= 状态栏 59 + 12pt 呼吸，正合适）
          //       （strip 的盒高会跟着缩，所以不是 65+12=77，实测就是 71）
          //   ⇒ 取 **strip 的 padding-top = 12px**，_surface 的 65 原样不动。
          //   🔴 定位用 **data-* 语义属性**（data-dockkit-*），不依赖 CSS Modules 哈希类名；
          //      用 [data-sidebar-right-panel] 限定在右侧面板内，避免误伤其它 tablist；找不到静默跳过。
          //   🔴 幂等：只在「读回内联值 ≠ 目标」时才写（读内联属性不触发布局重算），
          //      绝不重蹈旧 fixBottom「读回自己写的值再算一次」的累加覆辙。
          var PANEL_STRIP_PT = 12;
          function tightenRightPanelTop() {
            try {
              var strips = document.querySelectorAll('[data-sidebar-right-panel] [role="tablist"][data-dockkit-strip]');
              for (var i = 0; i < strips.length; i++) {
                var el = strips[i];
                if (el.style.getPropertyValue('padding-top') === PANEL_STRIP_PT + 'px' &&
                    el.style.getPropertyPriority('padding-top') === 'important') continue;
                el.style.setProperty('padding-top', PANEL_STRIP_PT + 'px', 'important');
              }
            } catch (e) {}
          }
          // ===== 🔴 v1.0.115 一：弹层/面板内不许横向溢出（老总 2026-10-18）=====
          //   老总原话：「打开设置，里面的页面还是可以左右滑动超出屏幕范围。需要固定。
          //             任何弹出页面内容，滑动不许超出屏幕范围。」
          //   实测根因（_probe_settings_overflow.cjs / _probe_settings_dom.cjs，430x932 dsf3 iPhone UA）：
          //     设置面板 [class*="options"] 的 scrollWidth=450 > clientWidth=414 → 出现横向滚动条，能左右滑。
          //     450 是这么来的：每行 [class*="rowText"] 计算宽 390px，但它是 **content-box**，
          //     又带 padding-right:48px → 实际占位 390+48 = **438px**，比父级 row(390) 宽 48px，
          //     7 行叠加把 section 撑到 438，再加面板左右 padding 就变成 450。
          //   ⇒ 修法（_fix_probe_r1.cjs 实测）：只要把「content-box + 有横向 padding」改成 border-box，
          //     横向滚动条**自然消失**（越界元素 7 → 0，可横滑容器 1 → 0），布局肉眼零变化
          //     （收掉的只是那 48px 不可见的留白），不需要 overflow:hidden 强裁。
          //   🔴 范围限定在「浮层根」内（position fixed/absolute 且宽≈视口），绝不碰主界面。
          //   🔴 幂等：读回内联值才写；同一根 700ms 内不重扫（性能铁律：先收集、扫完统一写）。
          var __dshOverlayScanAt = (typeof WeakMap === 'function') ? new WeakMap() : null;
          var __dshOverlayLastRun = 0;
          function fixOverlayOverflow() {
            try {
              // 🔴 性能铁律：本函数由 applySidebarInset 驱动，而后者在 MutationObserver
              //   （流式输出时每 300ms 一次）里也会跑。候选池要上百次 getComputedStyle
              //   → 必须整体节流，不能只节流单根，否则每 300ms 白扫一遍。
              var now0 = Date.now();
              if (now0 - __dshOverlayLastRun < 400) return;
              __dshOverlayLastRun = now0;
              // ===== 🔴 v1.0.122：全局横向收口（老总 2026-10-19「任何界面都超出屏幕范围」）=====
              //   之前只在「浮层根」内做 border-box 修正，主界面和表头右侧那 4px 没人管。
              //   `overflow-x: clip` 与 `hidden` 的关键区别：**clip 不创建滚动容器**，
              //   所以不会把 html/body 变成 scroll container、也不会破坏 sticky 顶栏；
              //   DSH 主界面本来就靠内部滚动容器，html 自己不滚，这条只裁横向。
              //   一次性注入 + id 去重，幂等。
              try {
                if (!document.getElementById('__dsh-xclip')) {
                  var __xs = document.createElement('style');
                  __xs.id = '__dsh-xclip';
                  __xs.textContent = 'html, body { overflow-x: clip !important; max-width: 100vw !important; }';
                  (document.head || document.documentElement).appendChild(__xs);
                }
              } catch (e) {}
              // ===== 🔴 v1.0.123：通用「右侧出血」钳制（取代 1.0.122 只盯 headerCorner 的补丁）=====
              //   老总 2026-10-19：「1.0.122 已经是这个包了，还是有 UI 溢出屏幕的问题」。
              //   1.0.122 只把顶栏那个按钮推回来 8px，别的元素出血没人管 —— DSH 一换版，
              //   只要把别的按钮/角标/浮标放到 right > 视口，就又是一次「超出屏幕」。
              //   这里改成通用扫描：**任何** 元素只要「左边在视口内、右边超出视口」，一律推进来。
              //   🔴 五条安全线，绝不误伤（逐条都是踩过的坑）：
              //     ① left < 0 不管 —— 抽屉收起态就是 left:-150，属正常离屏；
              //     ② left >= vw 不管 —— 右侧面板收起态就是 left:vw，属正常离屏；
              //     ③ width > vw 不管 —— 横向滚动容器/超宽图，推进来会真的错乱；
              //     ④ 祖先里有 overflow-x: auto/scroll 不管 —— 可横滑区域，越界是本意；
              //     ⑤ transform 不是纯位移矩阵不管 —— 带 scale/rotate 的元素直接改会毁掉原效果；
              //     ⑥ 出血量 > 120px 不管 —— 那是刻意的飞出动画，不是 4~8px 的贴边出血。
              //   🔴 位移一律 transform: translateX（margin 在 flex 里会 1:3 放大，1.0.122 实测）。
              //   🔴 幂等：位移量从当前 computed matrix 累加，收敛后 ov=0 自然不再动。
              //   🔴 性能：全表扫描很贵，1.5 秒最多一次；且先收集、后统一写，读写绝不交错。
              try {
                var __bleedNow = Date.now();
                if (!window.__dshBleedAt || __bleedNow - window.__dshBleedAt > 1500) {
                  window.__dshBleedAt = __bleedNow;
                  var __vw = window.innerWidth || 430;
                  var __all = document.body ? document.body.getElementsByTagName('*') : [];
                  var __hits = [];
                  var __n = __all.length;
                  if (__n > 3000) __n = 3000;
                  for (var __bi = 0; __bi < __n; __bi++) {
                    var __el = __all[__bi];
                    if (!__el || __el.nodeType !== 1) continue;
                    var __bq = __el.getBoundingClientRect();
                    if (__bq.width < 8 || __bq.height < 8) continue;
                    var __ov = __bq.right - __vw;
                    if (__ov <= 0.5) continue;
                    // ① ② ③ ⑥
                    if (__bq.left < 0 || __bq.left >= __vw - 1) continue;
                    if (__bq.width > __vw) continue;
                    if (__ov > 120) continue;
                    var __bcs = getComputedStyle(__el);
                    if (__bcs.display === 'none' || __bcs.visibility === 'hidden') continue;
                    // ⑤ 只接受纯位移矩阵
                    var __bt = __bcs.transform;
                    var __btx = 0;
                    if (__bt && __bt !== 'none') {
                      // ⚠️ Swift 多行字符串里「反斜杠 + 左圆括号」是插值起始语法，
                      //   正则里的圆括号反斜杠必须双写，否则会被当成表达式求值而编译失败。
                      var __bm = __bt.match(/^matrix\(([^)]*)\)$/);
                      if (!__bm) continue;
                      var __bp = __bm[1].split(',');
                      if (__bp.length < 6) continue;
                      var __okT = Math.abs(parseFloat(__bp[0]) - 1) < 0.01 && Math.abs(parseFloat(__bp[1])) < 0.01
                               && Math.abs(parseFloat(__bp[2])) < 0.01 && Math.abs(parseFloat(__bp[3]) - 1) < 0.01;
                      if (!__okT) continue;
                      __btx = parseFloat(__bp[4]) || 0;
                    }
                    // ④ 祖先可横滑则放行
                    var __par = __el.parentElement;
                    var __scrollable = false;
                    var __depth = 0;
                    while (__par && __par !== document.body && __depth < 12) {
                      var __pcs = getComputedStyle(__par);
                      if (__pcs.overflowX === 'auto' || __pcs.overflowX === 'scroll') { __scrollable = true; break; }
                      __par = __par.parentElement;
                      __depth++;
                    }
                    if (__scrollable) continue;
                    __hits.push([__el, __ov, __btx]);
                  }
                  for (var __hj = 0; __hj < __hits.length; __hj++) {
                    var __h = __hits[__hj];
                    __h[0].style.setProperty('transform', 'translateX(' + (__h[2] - __h[1]) + 'px)', 'important');
                  }
                  window.__dshBleedN = __hits.length;
                }
              } catch (e) {}
              var vw = window.innerWidth || 430;
              var hosts = document.querySelectorAll('[class*="overlayLayer"], body > div');
              // 🔴 候选池必须**同时包含挂载层自身**：实测设置面板的根 [class*="overlay"]
              //   就是 body > div 的直接子级（position:fixed、430 宽、全屏），
              //   只扫 children 会全部落到它的 static 子容器上，一个根都找不出来 → 修复静默失效。
              var pool = [];
              for (var hp = 0; hp < hosts.length; hp++) {
                pool.push(hosts[hp]);
                var hc = hosts[hp].children;
                for (var hq = 0; hq < hc.length; hq++) pool.push(hc[hq]);
              }
              var roots = [];
              for (var i = 0; i < pool.length; i++) {
                var c = pool[i];
                if (!c || c.nodeType !== 1) continue;
                var cs;
                try { cs = getComputedStyle(c); } catch (e) { continue; }
                if (cs.display === 'none' || cs.visibility === 'hidden') continue;
                if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
                var cr = c.getBoundingClientRect();
                if (cr.width >= vw - 2 && cr.height > 200) roots.push(c);
              }
              if (!roots.length) return;
              var now = Date.now();
              for (var k = 0; k < roots.length; k++) {
                var root = roots[k];
                if (__dshOverlayScanAt) {
                  var last = __dshOverlayScanAt.get(root) || 0;
                  if (now - last < 700) continue;
                  __dshOverlayScanAt.set(root, now);
                }
                // 先收集（只读），再统一写 —— 避免 DOM 读写交错触发反复重排
                var targets = [];
                var all = root.querySelectorAll('*');
                for (var m = 0; m < all.length; m++) {
                  var el = all[m];
                  if (el.dataset && el.dataset.dshBoxFixed === '1') continue;
                  var s;
                  try { s = getComputedStyle(el); } catch (e) { continue; }
                  if (s.display === 'none') continue;
                  var pl = parseFloat(s.paddingLeft) || 0;
                  var pr = parseFloat(s.paddingRight) || 0;
                  if (s.boxSizing !== 'content-box' || (pl + pr) <= 0) continue;
                  targets.push(el);
                }
                for (var t = 0; t < targets.length; t++) {
                  var e2 = targets[t];
                  e2.style.setProperty('box-sizing', 'border-box', 'important');
                  if (e2.dataset) e2.dataset.dshBoxFixed = '1';
                }
                // 兜底：改完还超宽的横向滚动容器（官方故意留的横滑区），一律禁横向滑
                var scrollers = root.querySelectorAll('[class*="options"], [class*="row"], [class*="section"]');
                for (var sc = 0; sc < scrollers.length; sc++) {
                  var se = scrollers[sc];
                  if (se.scrollWidth <= se.clientWidth + 2) continue;
                  var scs;
                  try { scs = getComputedStyle(se); } catch (e) { continue; }
                  if (scs.overflowX !== 'auto' && scs.overflowX !== 'scroll') continue;
                  se.style.setProperty('overflow-x', 'hidden', 'important');
                }
              }
            } catch (e) {}
          }
          // ===== 🔴 v1.0.115 二：页面内 header 被压扁，标题/按钮压住下面的卡片（老总 2026-10-18）=====
          //   老总原话：「打开 插件 按钮。弹出页面和按钮选项重叠。」（配图 2/3张）
          //   实测（_ab_plugins_head.cjs 官方 vs 注入 A/B）：
          //     官方原版：插件页 <header class="u9Hv6q_pageHead"> height=**60px**，min-height=auto → 正常
          //     全量注入：同一个 header height=**8px**，min-height=**0px** → 塌成只剩 padding-top 8px
          //     而它里面住着「插件」标题 + 说明 + 添加插件按钮（实测内容高 100px，52+16+32），
          //     且 sticky + z=19 → 这 100px 全部浮在滚动列表上方 ⇒ 与「官方/已安装」卡片重叠。
          //   机制：父级 [class*="page"] 是 display:flex; flex-direction:column; overflow:auto，
          //     内容 2012px 远超 893px → 所有 item 按 flex-shrink 压缩，pageHead 是 flex:0 1 auto；
          //     官方靠 min-height:auto（=内容高，不可压），我们的 `min-height:0` 让它能被压到 0。
          //   ⇒ 修法（_probe_head_mechanism.cjs 四个候选实测，1/2/3/4 全部把 8px → 108px，卡片顶 109 → 209，零重叠）：
          //     min-height:fit-content + flex-shrink:0。
          //   🔴 只救「住在滚动容器里的 header」，主顶栏不在滚动容器内 → 天然不受影响，绝不误伤。
          function restorePageHeadHeight() {
            try {
              var heads = document.querySelectorAll('header');
              for (var i = 0; i < heads.length; i++) {
                var hd = heads[i];
                var par = hd.parentElement;
                if (!par) continue;
                var pcs;
                try { pcs = getComputedStyle(par); } catch (e) { continue; }
                var scrollable = (pcs.overflowY === 'auto' || pcs.overflowY === 'scroll');
                if (!scrollable) continue;               // 主顶栏：父级不可滚 → 跳过
                if (hd.dataset) hd.dataset.dshPageHead = '1';   // 打标：__dshSetStatusBar 见标即跳过
                if (hd.style.getPropertyValue('min-height') !== 'fit-content' ||
                    hd.style.getPropertyPriority('min-height') !== 'important' ||
                    hd.style.getPropertyValue('flex-shrink') !== '0') {
                  hd.style.setProperty('min-height', 'fit-content', 'important');
                  hd.style.setProperty('flex-shrink', '0', 'important');
                }
                // 🔴 v1.0.115 补：这类 header 是**吸顶条**，必须有底色。
                //   实测（_cmp_scroll_115.cjs 三态滚动截图）：高度修好后往下滑，
                //   卡片文字仍会从吸顶条区域**透上来**（「在本机使用 SenseVoice 转写录音…」
                //   浮在「插件」标题行里）—— 因为 __dshSetStatusBar 里那条
                //   `header { background: transparent }` 是为**主顶栏**写的（治顶栏发灰），
                //   却把所有 <header> 都清了。主顶栏确实要透明，页面内吸顶条不行。
                //   取页面底色（上溯第一个不透明祖先），让滚动内容被真正挡住。
                var bgOk = hd.style.getPropertyPriority('background-color') === 'important' &&
                           hd.style.getPropertyValue('background-color') !== '' &&
                           hd.style.getPropertyValue('background-color') !== 'transparent';
                if (!bgOk) {
                  var bg = null;
                  var n = par;
                  while (n && n !== document.documentElement) {
                    var ncs;
                    try { ncs = getComputedStyle(n); } catch (e) { break; }
                    var bc = ncs.backgroundColor;
                    if (bc && bc !== 'transparent' && bc !== 'rgba(0, 0, 0, 0)') { bg = bc; break; }
                    n = n.parentElement;
                  }
                  if (bg) hd.style.setProperty('background-color', bg, 'important');
                }
              }
            } catch (e) {}
          }
          // ===== 🔴 v1.0.115 三（通用版）：官方「行尾控件通栏」规则成片误伤小控件 =====
          //   老总 2026-10-18：「只能改 ios app 里面。不止这一个按钮这种情况。要通用性」
          //   起因只是「显示代码工作视图」的开关被拉成 390x20 通栏白条，但深挖发现
          //   **同一条官方规则一共误伤了 9 个控件**（_cmp_controls.cjs，430x932 dsf3）：
          //     完全权限 110 / 中文 82 / 字号 14px 95 / 简洁 82 / 应用内侧边栏 138 /
          //     排队发送 110 / 详细 82 / 开关 x2 = 36x20
          //   —— 这 9 个宽度是**桌面 1280 官方原版实测值**，手机 430 下全部被拉成 390。
          //   真凶（全量扫 CSSOM，唯一带 !important 的尺寸规则；MODE=official A/B 同样 390，
          //   ⇒ 不是我们注入层引入的，是 DSH 自己的移动端适配缺陷）：
          //     @media (max-width:1023px){
          //       [aria-modal="true"] [class$="_section"] [class$="_row"] > :last-child {
          //         width:100% !important; max-width:none !important; } }
          //   它本意对「文本框 / 长按钮」通栏是合理的，但 `:last-child` 把胶囊下拉、开关、
          //   数字输入组一起吃了。
          //
          //   🔴 通用修法分两层，**主路径是运行时判定，不是 CSS 一刀切**：
          //     ① `findFullWidthSelectors()` 运行时遍历 CSSOM，动态抓出「width:100% !important
          //        + max-width:none」的规则并取其 selectorText —— 官方以后改哈希类名/改结构，
          //        这里自动跟随，绝不写死 `_section` / `_row` 这些类名；
          //     ② `fixStretchedControls()` 对命中元素逐个判：只有**可交互控件**才复位宽度，
          //        纯文本块一律放过。
          //   🔴 为什么不能用 CSS 一刀切（踩过的坑）：官方同一条规则对 `<row> > :first-child`
          //     **也**写了 width:100%，而 first-child 是「标签 + 说明」的文本块，
          //     给它 fit-content 会把「繁忙时的发送行为」的描述挤到两行（实测 44 → 62px 高）。
          //     ⇒ 用 CSS 只会把文本块和控件一起改，必须按元素性质分流。
          //   🔴 判据「可交互」（_classify_stretch.cjs 实测，9 行首 vs 9 行尾）：
          //     行首文本块：自身**无任何属性**（无 role/tabindex/aria），子元素只有 DIV，固有宽 76~433；
          //     行尾控件  ：自身或**内部**有 button/input（胶囊下拉内部是 BUTTON、数字框内部是 INPUT），
          //                 固有宽 20~138（占行宽 5%~35%）。
          //     ⇒ 「自身或内部存在可交互元素」是唯一能干净分开两者的判据（单看宽度会误判
          //       「语言」那一行：它的文本块固有宽只有 76px，比任何控件都窄）。
          //   🔴 值取 fit-content 实测像素：实测 9/9 精确等于桌面 1280 官方宽度。
          //   🔴 幂等：dataset.dshCtl 打标 + 读回宽度判「已不通栏」即跳过。
          //   🔴 性能：读写严格分离（统一写 → 统一读 → 统一裁决），全程只触发一次重排。
          function findFullWidthSelectors() {
            var out = [];
            function scan(rules) {
              for (var i = 0; i < rules.length; i++) {
                var r = rules[i];
                // 4 = @media，12 = @supports：都要钻进去找
                if ((r.type === 4 || r.type === 12) && r.cssRules) { scan(r.cssRules); continue; }
                if (!r.selectorText || !r.style) continue;
                if (r.style.getPropertyValue('width') !== '100%') continue;
                if (r.style.getPropertyPriority('width') !== 'important') continue;
                if (r.style.getPropertyValue('max-width') !== 'none') continue;
                if (out.indexOf(r.selectorText) < 0) out.push(r.selectorText);
              }
            }
            var sheets = document.styleSheets || [];
            for (var s = 0; s < sheets.length; s++) {
              var rs = null;
              try { rs = sheets[s].cssRules; } catch (e) { continue; }   // 跨域样式表直接跳过
              if (rs) { try { scan(rs); } catch (e) {} }
            }
            return out;
          }
          // ── 🔴 v1.0.116：两条「坑」的根治（老总：不可能解决不了）─────────────────
          //   坑 A「CSS 一刀切会连行首文本块一起改」
          //     → 改用 **`:has()`** 精确分流：只在「内部真的有控件」时才命中。
          //       行首文本块内部只有 DIV ⇒ `:has(button)` 天然不匹配 ⇒ 不再需要任何
          //       JS 逐元素判定。「要通用性」= CSS 天生通用，不枚举任何控件类型。
          //   坑 B「写死像素会量到偏小（108 而官方 110）」
          //     → **根本不量**。值固定 `fit-content`，由浏览器按当时字体/字号/语言实时算。
          //       桌面 1280 官方就是 flex row + align-items:center 的 shrink-to-fit，
          //       与 `fit-content` 数学等价（_cmp_controls.cjs 实测 9/9 精确相等）。
          //       既然不测量，就永远不受「字体还没加载完」影响，也不会过时。
          //   🔴 为什么这套比 JS 逐元素判定更强：
          //     ① 零 JS、零重排（不动任何 el.style，只插一个 <style>）；
          //     ② 零时机依赖 —— 官方 CSS 晚 append 也自动落进同一条 cascade；
          //     ③ 纯 CSS 生效，MutationObserver 反复触发也不抖（内容未变即不重建）。
          //   🔴 特异性：`html body` 前缀 + `:has()` 参数 → 实测压过官方 (0,4,0)；
          //     `:has()` 不支持时整条规则被浏览器丢弃 ⇒ 自动退回官方原样，绝不更坏，
          //     此时由 fallback（老 JS 判定）接管，两条路径互不干扰。
          //   🔴 兼容：`:has()` 需 Safari/iOS 15.4+；本项目最低 iOS 16.4。
          var __dshHasOk = false;
          try { __dshHasOk = !!(window.CSS && CSS.supports && CSS.supports('selector(:has(*))')); } catch (e) {}
          var __dshStretchCssAt = 0;
          // 「行尾到底该不该通栏」的唯一判据：**里面有真控件**，或者自身就是控件。
          var __dshCtlHas = [':has(button)', ':has(input)', ':has(select)', ':has(textarea)',
                             ':has(a[href])', ':has([role])', ':has([tabindex])', ':has([aria-haspopup])'];
          var __dshCtlSelf = ':is(button,input,select,textarea,a[href],[role],[tabindex],[aria-haspopup])';
          function buildStretchFixCss() {
            var sels = findFullWidthSelectors();
            if (!sels.length) return null;          // 官方 CSS 还没注入 → 不写任何兜底规则
            var out = [];
            for (var i = 0; i < sels.length; i++) {
              var parts = String(sels[i]).split(',');
              for (var j = 0; j < parts.length; j++) {
                var p = parts[j].replace(/\s+/g, ' ').trim();
                if (!p) continue;
                for (var h = 0; h < __dshCtlHas.length; h++) out.push('html body ' + p + __dshCtlHas[h]);
                // 自身即控件（行尾直接放 button/input 的情况）：剥掉末尾 child 伪类再套 :is()
                var q = p.replace(/:(last|first)-child$/, '');
                if (q && /[a-zA-Z\]\)]/.test(q)) out.push('html body ' + q + __dshCtlSelf);
              }
            }
            if (!out.length) return null;
            return '@media (max-width: 1023px) {\n' + out.join(',\n') + ' {\n' +
                   '  width: -webkit-fit-content !important;\n' +
                   '  width: fit-content !important;\n' +
                   '  max-width: none !important;\n' +
                   '} }';
          }
          function refreshStretchFixCss() {
            try {
              var now = Date.now();
              if (now - __dshStretchCssAt < 600) return;
              __dshStretchCssAt = now;
              var text = buildStretchFixCss();
              if (!text) return;
              var id = 'dsh-ios-stretch-fix';
              var old = document.getElementById(id);
              if (old && old.textContent === text) return;        // 幂等：内容一致不重建
              if (old && old.parentNode) old.parentNode.removeChild(old);
              var st = document.createElement('style');
              st.id = id;
              st.textContent = text;
              (document.head || document.documentElement).appendChild(st);
            } catch (e) {}
          }
          var __dshStretchAt = 0;
          // 🔴 fallback：仅当浏览器不支持 `:has()` 时才走（本项目不会触发，纯保险）
          function fixStretchedControlsFallback() {
            try {
              // 节流与宽屏判定已由主入口 fixStretchedControls 统一处理
              var sels = findFullWidthSelectors();
              if (!sels.length) return;                  // 官方 CSS 还没注入，下一轮再来
              // ── ① 收集（纯只读）──────────────────────────────────────────
              var seen = [];
              for (var s = 0; s < sels.length; s++) {
                var list;
                try { list = document.querySelectorAll(sels[s]); } catch (e) { continue; }
                for (var i = 0; i < list.length; i++) {
                  if (seen.indexOf(list[i]) < 0) seen.push(list[i]);
                }
              }
              var todo = [];
              for (var k = 0; k < seen.length; k++) {
                var el = seen[k];
                if (!el || el.nodeType !== 1) continue;
                var tag = el.tagName;
                // 排除「通栏是官方本意」的文本输入类
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') continue;
                var role = el.getAttribute('role');
                if (role === 'textbox' || role === 'searchbox') continue;
                if (role === 'switch') continue;         // switch 走上面那条专用 36x20 规则
                if (el.hasAttribute('contenteditable')) continue;
                // 🔴 核心判据：可交互控件才复位；纯文本块（行首标签）绝不动
                var interactive = false;
                try {
                  interactive = el.matches('button,input,select,textarea,a[href],[role],[tabindex],[aria-haspopup]') ||
                    !!el.querySelector('button,input,select,textarea,a[href],[role],[tabindex],[aria-haspopup]');
                } catch (e) { continue; }
                if (!interactive) continue;
                var par = el.parentElement;
                if (!par) continue;
                var pw = par.getBoundingClientRect().width;
                if (!(pw > 40)) continue;
                var w = el.getBoundingClientRect().width;
                if (w < pw - 8) continue;                // 已经不通栏 → 幂等跳过
                if (el.dataset && el.dataset.dshCtl === '1') continue;
                todo.push({ el: el, pw: pw });
              }
              if (!todo.length) return;
              // ── ② 统一写 fit-content（写）─────────────────────────────────
              for (var a = 0; a < todo.length; a++) {
                var e1 = todo[a].el;
                e1.style.setProperty('width', '-webkit-fit-content', 'important');
                e1.style.setProperty('width', 'fit-content', 'important');
                e1.style.setProperty('max-width', 'none', 'important');
              }
              // ── ③ 统一读回固有宽度（读，一次重排）────────────────────────
              //   这一步只用于「裁决」，不作为最终值。
              for (var b = 0; b < todo.length; b++) {
                todo[b].fw = Math.round(todo[b].el.getBoundingClientRect().width);
              }
              // ── ④ 统一裁决（写）────────────────────────────────────────────
              for (var c = 0; c < todo.length; c++) {
                var it = todo[c];
                var rat = it.fw / it.pw;
                // 固有宽度本来就接近满宽（≥85%）或测不出 → 说明它确实该占满，交还官方 100%
                if (!(it.fw >= 12) || rat > 0.85) {
                  it.el.style.removeProperty('width');
                  it.el.style.removeProperty('max-width');
                  continue;
                }
                // 🔴 终值**必须保持 fit-content，绝不写死像素**：实测写死会在字体加载完成前
                //   量到偏小的值（108 而官方 110 / 80 而 82 / 135 而 138），
                //   一旦写死就再也回不来；fit-content 由浏览器按当时内容算，字体/字号/语言
                //   变化都会自动跟随，且实测精确等于桌面 1280 官方宽度。
                if (it.el.dataset) it.el.dataset.dshCtl = '1';
              }
            } catch (e) {}
          }
          // 主入口：统一节流 + 宽屏判定，再按能力分流（CSS `:has()` 优先，JS 兜底）
          function fixStretchedControls() {
            try {
              var now = Date.now();
              if (now - __dshStretchAt < 600) return;
              __dshStretchAt = now;
              // 官方那条规则住在 @media (max-width:1023px) 里，宽屏下不生效 → 宽屏直接跳过，
              // 绝不在宽屏上写任何宽度（那会把官方本来正确的布局改坏）；顺手撤掉我们的样式表。
              if ((window.innerWidth || 0) > 1023) {
                var oldW = document.getElementById('dsh-ios-stretch-fix');
                if (oldW && oldW.parentNode) oldW.parentNode.removeChild(oldW);
                return;
              }
              if (__dshHasOk) { refreshStretchFixCss(); return; }   // 主路径：纯 CSS
              fixStretchedControlsFallback();                        // 兜底：老 JS 判定
            } catch (e) {}
          }
          function scheduleStretchFix() {
            // 官方 CSS 可能晚于 documentStart 注入（hydration 后才 append），
            // 故 DOMContentLoaded 后补几拍；稳态由 applySidebarInset（MutationObserver 驱动）兜底。
            var step = function (i) {
              if (i > 3) return;
              setTimeout(function () {
                try { fixStretchedControls(); } catch (e) {}
                step(i + 1);
              }, i === 0 ? 120 : (i === 1 ? 600 : 1400));
            };
            step(0);
          }
          try {
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', scheduleStretchFix);
            } else {
              scheduleStretchFix();
            }
          } catch (e) {}
          // ===== 🔴 v1.0.124：会话框底部按钮「圆圈 / 方框 / +号」垂直对齐校准 =====
          //   老总：「以前版本修改了的按钮（圆圈，方框，+号）不居中问题又出现了」。
          //   两层原因：
          //   ① 旧修复写的是 .uWtHQG_add 这类 CSS Module 哈希类名，DSH 换版后命中数=0（已换 CSS 修掉）；
          //   ② 就算图标自身居中了，按钮之间仍然错位：实测 DSH 的原生行容器 padding 是
          //      「上 2 / 下 6」，而发送大圆按钮（34px）是贴行顶锚定的，小按钮（28px）是按内容区
          //      居中的 → 两者中心恒定差 2px，肉眼就是「圆圈比 + 号高一点」。
          //   这里用纯视觉位移 translateY 校准：目标中心取本行所有按钮中心的中位数，
          //   逐个把偏差补平。幂等（偏差 < 0.5px 就撤掉 transform，不再动），
          //   不做任何布局改动，也不写死任何像素（换版/换机型自适应）。
          function alignComposerButtons() {
            try {
              var host = document.querySelector('[class*="composerStack"]');
              if (!host) return;
              var rows = host.querySelectorAll('[class*="_row"]');
              for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                var list = [];
                var bs = row.getElementsByTagName('button');
                for (var i = 0; i < bs.length; i++) {
                  var b = bs[i];
                  var bcs = getComputedStyle(b);
                  if (bcs.display === 'none' || bcs.visibility === 'hidden') continue;
                  var q = b.getBoundingClientRect();
                  if (q.width < 14 || q.width > 80 || q.height < 14 || q.height > 80) continue;
                  /* v1.0.129：扣掉已有 translateY，用「净几何」参与分组与对齐，否则已校准的
                     按钮会带着旧位移参加下一轮中位数计算，越算越歪（幂等性被破坏） */
                  var ty = 0;
                  var tf = bcs.transform || '';
                  if (tf.indexOf('matrix') === 0) {
                    var lp = tf.indexOf('('), rp = tf.indexOf(')');
                    if (lp > 0 && rp > lp) {
                      var ps = tf.substring(lp + 1, rp).split(',');
                      ty = parseFloat(ps[5]) || 0;
                    }
                  }
                  list.push([b, { y: q.y - ty, height: q.height }]);
                }
                if (list.length < 2) continue;
                /* 🔴 v1.0.129（底排防挤爆定案）：换行放行后，一个 _row 容器里可能出现上下两行按钮。
                   绝不能再整容器取中位数 —— 否则上行按钮会被 translateY 硬拽到下行中线，
                   直接压到模型选择器上（实测 优化 被拽 +11px）。改为：
                   ① 先用「未加 transform 的几何」按视觉行分组（纵向相交算同组）；
                   ② 每组各自取中位数各自对齐；跨组互不干扰。
                   ③ 分组/对齐一律用去 transform 几何，幂等不漂移。 */
                /* 分组判据＝中心间距：同行按钮的中心差 ≤2px（v1.0.127 实测 0.6px），
                   跨行至少差一个按钮高（≥22px）。按中心排序后遇到 >10px 的空档就切组。
                   （早期用「纵向矩形相交」分组在行距 8px、按钮高 28px 时必然把两行串成一组，
                   优化 被拽 +18px 直压模型选择器 —— 已废弃。） */
                var groups = [];
                var sorted = list.slice(0).sort(function (a, b) {
                  return (a[1].y + a[1].height / 2) - (b[1].y + b[1].height / 2);
                });
                for (var gi = 0; gi < sorted.length; gi++) {
                  var cy2 = sorted[gi][1].y + sorted[gi][1].height / 2;
                  if (!groups.length || cy2 - groups[groups.length - 1].cy > 10) {
                    groups.push({ cy: cy2, items: [] });
                  }
                  groups[groups.length - 1].cy =
                    (groups[groups.length - 1].cy * groups[groups.length - 1].items.length + cy2) /
                    (groups[groups.length - 1].items.length + 1);
                  groups[groups.length - 1].items.push(sorted[gi]);
                }
                for (var gk = 0; gk < groups.length; gk++) {
                  var items = groups[gk].items;
                  if (items.length < 2) continue;
                  var cys = [];
                  for (var j = 0; j < items.length; j++) cys.push(items[j][1].y + items[j][1].height / 2);
                  cys.sort(function (x, y) { return x - y; });
                  var target = cys[Math.floor(cys.length / 2)];
                  for (var k = 0; k < items.length; k++) {
                    var el = items[k][0], eq = items[k][1];
                    var d = Math.round((eq.y + eq.height / 2 - target) * 10) / 10;
                    if (Math.abs(d) < 0.5) {
                      if (el.style.getPropertyValue('transform') &&
                          el.style.getPropertyValue('transform').indexOf('translateY') >= 0) {
                        el.style.removeProperty('transform');
                      }
                      continue;
                    }
                    el.style.setProperty('transform', 'translateY(' + (-d) + 'px)', 'important');
                  }
                }
              }
            } catch (e) {}
          }
          /* 🔴 v1.0.127：composer 底排按钮「越界钳制」——通用兜底，不依赖任何哈希类名。
             CSS 那条（button[aria-label*="选择模型"]）只管模型选择器这一种；
             这里按几何判据兜住未来变体：composerStack 里任何 button 只要右缘越过
             父容器右缘 >1px 且父容器不是横向滚动容器 → max-width:100% 钳回父宽。
             与 fixOverlayOverflow 同一哲学：不做单点补丁，做通用钳制，DSH 换版不复发。 */
          function fixComposerClamp() {
            try {
              var host = document.querySelector('[class*="composerStack"]');
              if (!host) return;
              var bs = host.querySelectorAll('button, [role="button"]');
              for (var i = 0; i < bs.length; i++) {
                var b = bs[i];
                var par = b.parentElement;
                if (!par || par === host) continue;
                var pq = par.getBoundingClientRect();
                var bq = b.getBoundingClientRect();
                if (bq.width < 20 || pq.width < 20) continue;
                if (bq.right <= pq.right + 1) continue;   // 没越界，不动（天然幂等）
                var pcs = null;
                try { pcs = getComputedStyle(par); } catch (e2) { continue; }
                if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') continue; // 滚动容器是设计意图
                b.style.setProperty('max-width', '100%', 'important');
                b.style.setProperty('min-width', '0', 'important');
                b.style.setProperty('box-sizing', 'border-box', 'important');
                var spans = b.querySelectorAll('span');
                for (var k = 0; k < spans.length; k++) {
                  var scs = null;
                  try { scs = getComputedStyle(spans[k]); } catch (e3) { continue; }
                  if (scs.display === 'none') continue;
                  spans[k].style.setProperty('min-width', '0', 'important');
                  spans[k].style.setProperty('overflow', 'hidden', 'important');
                  spans[k].style.setProperty('text-overflow', 'ellipsis', 'important');
                  spans[k].style.setProperty('white-space', 'nowrap', 'important');
                }
                var svgs = b.querySelectorAll('svg');
                for (var m = 0; m < svgs.length; m++) svgs[m].style.setProperty('flex', '0 0 auto', 'important');
              }
            } catch (e) {}
          }
          /* 🔴 v1.0.124：DSH 电脑端自带的「费用计量」浮层卡片 .cm-peak-alert 是间歇出现的
             （峰时 / 平价提醒）。它 position:fixed + z-index:9999 + 宽 406px 横跨整屏，
             一旦出现就把抽屉底部「余额 / 今日 / 平价 / 账号行」整片盖住，
             连我们注入的设置齿轮也被压住 —— 实测 elementFromPoint 在齿轮中心命中的是
             cm-peak-alert-actions 而不是齿轮，点「设置」直接点空。
             它属于 DSH 原生内容，不能删；只在抽屉打开期间临时收起，抽屉关掉立刻还原。 */
          function guardPeakAlert() {
            try {
              var alerts = document.querySelectorAll('.cm-peak-alert');
              if (!alerts.length) return;
              var sb = document.querySelector('[class*="sidebarCol"]');
              var open = false;
              if (sb) {
                var q = sb.getBoundingClientRect();
                open = (q.x > -60 && q.width > 120 && q.height > 200);
              }
              for (var i = 0; i < alerts.length; i++) {
                var el = alerts[i];
                if (open) el.style.setProperty('display', 'none', 'important');
                else if (el.style.getPropertyValue('display') === 'none') el.style.removeProperty('display');
              }
            } catch (e) {}
          }
          /* 🔴 v1.0.125：非会话页（插件页 / 设置页等）左上角 fixed「打开目录」按钮与页面自己的
             页头（g9WTEG_pageHead，语义锚 [class*="pageHead"]）相撞 —— 实测（430x932 暗色，
             抽屉关闭，triage6_1020.js）：
               fab   = (14..52, 42..80) z=99 position:fixed
               h1    = (36..190, 42..70)「插件」
             两矩形在 x36..52 相交 → 按钮压住标题；更狠的是 elementFromPoint 在 fab 中心
             命中的是 pageHead 本身（isFab=false）→ **按钮被页头盖住，点不动**。
             官方桌面版没这个问题（侧栏常驻，标题跟在侧栏右边）。
             修法与桌面版对齐：页头标题整体右移 56px 给 fab 让位（padding-left），
             同时把 fab 的 z-index 抬到页头之上，保证可点。不相交时全部还原（幂等，不污染会话页）。 */
          function fixPageHeadFab() {
            try {
              /* 🔴 作用域铁律：本函数与 setP/num/sbHeight 隔着一个 IIFE 边界（4154 行），
                 绝不能直接调它们 —— ReferenceError 会被 try/catch 静默吞掉，
                 实测表现为「函数每 3 秒都跑、却什么都没写进去」。全部自包含。 */
              var setPI = function (el, prop, val) { try { el.style.setProperty(prop, val, 'important'); } catch (e) {} };
              var ph = document.querySelector('[class*="pageHead"]');
              if (!ph) return;
              var fab = null;
              var cands = document.querySelectorAll('button');
              for (var i = 0; i < cands.length; i++) {
                var b = cands[i];
                var cs = getComputedStyle(b);
                if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
                var q = b.getBoundingClientRect();
                if (q.width < 10 || q.height < 10 || q.x > 100 || q.y > 220) continue;
                var lb = b.getAttribute('aria-label') || '';
                if (lb.indexOf('目录') >= 0 || lb.indexOf('侧边栏') >= 0) { fab = b; break; }
              }
              if (!fab) { if (ph.style.paddingLeft) ph.style.removeProperty('padding-left'); return; }
              var fq = fab.getBoundingClientRect(), pq = ph.getBoundingClientRect();
              var overlap = !(fq.right < pq.x + 4 || fq.x > pq.right - 4 || fq.bottom < pq.y + 4 || fq.y > pq.bottom - 4);
              if (overlap) {
                setPI(ph, 'padding-left', '56px');
                /* 🔴 fab 点不动的真凶（实测 diag_z.js）：fab 挂在 MnhYfG_overlayLayer（z=20）里，
                   它自己的 z=1000 被关在这个 stacking context 内出不来；而 pageHead z=999
                   直接参与根 context → 20 < 999，pageHead 永远盖住 fab。
                   抬 fab 没用，必须把 pageHead 降到 overlayLayer(20) 之下。
                   pageHead 只需要盖住滚动内容（z=auto），19 足够；overlayLayer 里的浮层
                   （fab、弹出菜单）本来就设计在页头之上 —— 这正是官方桌面版的层序。 */
                setPI(ph, 'z-index', '19');
              } else {
                if (ph.style.paddingLeft) ph.style.removeProperty('padding-left');
                if (ph.style.zIndex) ph.style.removeProperty('z-index');
              }
            } catch (e) {}
          }
          /* 🔴 v1.0.125：顶栏兜底硬钳制。fixTop() 只在找到 <header> 时才清
             [data-mobile-nav="frame"] 的 padding-top（DSH 官方塞的是 env(safe-area-inset-top)，
             真机 59px）—— 一旦某类页面没有 header（DSH 换版随时可能出现），59px 就没人清，
             整页内容连同左上角按钮一起下坠 59px，表现就是「顶栏离状态栏一大截、按钮压标题」
             （老总 2026-10-20 截图实测：标题 y≈122，正常应 ≈47，差值正好 59）。
             这里与 fixTop 解耦：只要有 frame 就清 padding，有 centerCol 就把列顶硬校到
             want = 状态栏高 - 2 - TOP_SHIFT。公式是绝对值（幂等），谁来都不会越校越偏。 */
          function fixTopChrome() {
            try {
              /* 🔴 同上：跨 IIFE 边界，setP/num/sbHeight 一律不可用，全自包含。 */
              var setPI = function (el, prop, val) { try { el.style.setProperty(prop, val, 'important'); } catch (e) {} };
              /* 🔴 v1.0.126：遍历**所有** frame 清 padding——真机取证（老总 2026-10-20 会话页截图
                 像素对拍：tab 下划线 172pt vs 沙箱 113pt，差 58.6pt ≈ 恰好一个状态栏 59）
                 表明存在「清了又被 React 重挂载刷回」的拉锯，querySelector 只取第一个会漏。
                 dsh-anywhere 代理层的 env() padding（唯一源头）已删，这里是 App 侧兜底。 */
              var frames = document.querySelectorAll('[data-mobile-nav="frame"]');
              for (var fi = 0; fi < frames.length; fi++) {
                var fpt = '0px';
                try { fpt = getComputedStyle(frames[fi]).paddingTop; } catch (e2) {}
                if (fpt !== '0px') setPI(frames[fi], 'padding-top', '0px');
              }
              var col = document.querySelector('[class*="centerCol"]');
              if (!col) return;
              /* 🔴 v1.0.128 页面隔离：centerCol 必须住在 DSH 移动框架里才动手。
                 WorkBuddy 等其它 React 应用若恰好有同名语义类，绝不能被我们推移
                 （真机实锤：fixTop 在 WorkBuddy 页做手术 → 子任务面板与标题重叠）。 */
              var inFrame = null;
              try { inFrame = col.closest ? col.closest('[data-mobile-nav="frame"]') : null; } catch (e6) {}
              if (!inFrame) return;
              var sb = parseFloat(window.__dshNativeStatusBar);
              if (!(sb > 0)) {
                /* 🔴 v1.0.128：优先读原生专属变量 --dsh-sb-native；DSH 自己会写
                   --dsh-statusbar 且偏大（实测 75），直接用它会把目标带偏低估。 */
                var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-sb-native'));
                if (!(v > 0)) v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-statusbar'));
                sb = v > 0 ? v : 59;
              }
              var shift = (typeof window.__dshTopShift === 'number') ? window.__dshTopShift : 18;
              var want = sb - 2 - shift;
              /* 🔴 v1.0.126：先清掉我们上一轮写的 margin 再量自然位置，然后写绝对差。
                 增量法在外部又加了 padding 时会拿脏值累加；清-量-设每次都从干净基线出发，
                 无论 padding 被刷回多少次都能精确抵消，幂等。 */
              if (col.dataset && col.dataset.dshMt === '1') { try { col.style.removeProperty('margin-top'); } catch (e3) {} }
              var cur = col.getBoundingClientRect().top;
              if (!(cur > -600 && cur < 1200)) return;
              var d = want - cur;
              if (Math.abs(d) > 0.5) {
                setPI(col, 'margin-top', d + 'px');
              }
              if (col.dataset) col.dataset.dshMt = '1';
            } catch (e) {}
          }
          /* 🔴 v1.0.126（老总 2026-10-20：「打开插件按钮，侧边栏和返回按钮还是遮挡」）：
             插件**详情**页没有 <header> 也没有 pageHead（实测 hdrTop=null），fixTop /
             fixPageHeadFab 在这类页面全部提前 return → 整页零修复。
             实测铁证（430x932 模拟 env=59）：返回行（aria-label="返回插件"，全宽
             x=24..406, y=67..83）与 [data-mobile-nav="fab"]（fixed x=14..52, y=47..85）
             重叠 28x16 —— fab 正好盖住返回箭头左半。
             修法：fab 是浮动按钮，把它垂直下移到该行下方 8px（只动 fab 一个元素的内联
             top，不碰 DSH 文档流）；列表页 fab 与 pageHead 标题并排、不与全宽行重叠，
             完全不受影响。内联 !important 压过代理层样式表的 top: calc(env()+12px)。 */
          function fixFabRows() {
            try {
              var setPI = function (el, prop, val) { try { el.style.setProperty(prop, val, 'important'); } catch (e) {} };
              var fab = document.querySelector('[data-mobile-nav="fab"]');
              if (!fab) return;
              var cs = null;
              try { cs = getComputedStyle(fab); } catch (e1) { return; }
              if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position !== 'fixed') return;
              var fq = fab.getBoundingClientRect();
              if (fq.width < 8 || fq.y > 220) return;
              var rows = document.querySelectorAll('button, [role="button"], a');
              for (var i = 0; i < rows.length; i++) {
                var el = rows[i];
                var ecs = null;
                try { ecs = getComputedStyle(el); } catch (e4) { continue; }
                if (ecs.display === 'none' || ecs.visibility === 'hidden' || ecs.position === 'fixed') continue;
                var q = el.getBoundingClientRect();
                if (q.width < 200 || q.left > 60 || q.y > 220) continue;
                var ox = Math.min(fq.right, q.right) - Math.max(fq.x, q.x);
                var oy = Math.min(fq.bottom, q.bottom) - Math.max(fq.y, q.y);
                if (ox > 6 && oy > 6) {
                  setPI(fab, 'top', (q.bottom + 8) + 'px');
                  return;
                }
              }
            } catch (e) {}
          }
          
function applySidebarInset() {
            ensureSidebarOverlay();
            try { tightenRightPanelTop(); } catch (e) {}
            try { restorePageHeadHeight(); } catch (e) {}
            try { alignComposerButtons(); } catch (e) {}
            try { fixComposerClamp(); } catch (e) {}   // v1.0.127 底排按钮越界钳制
            try { guardPeakAlert(); } catch (e) {}
            try { fixPageHeadFab(); } catch (e) {}
            try { fixTopChrome(); } catch (e) {}
            try { fixFabRows(); } catch (e) {}
            try { fixOverlayOverflow(); } catch (e) {}
            // 🔴 v1.0.123：出血钳制不能只靠 MutationObserver 驱动 —— 页面静止不变化时
            //   一次都不会再跑，刚进页面那一下的出血就一直留在屏幕上（老总看到的就是这个）。
            //   装一个 3 秒兜底定时器（只装一次），保证任何静态页面也会收敛。
            try {
              if (!window.__dshBleedT) {
                window.__dshBleedT = setInterval(function () {
                  try { guardPeakAlert(); } catch (e) {}
                  try { fixPageHeadFab(); } catch (e) {}
                  try { fixTopChrome(); } catch (e) {}
                  try { fixFabRows(); } catch (e) {}
                  try { fixComposerClamp(); } catch (e) {}
                  try { fixOverlayOverflow(); } catch (e) {}
                }, 3000);
              }
            } catch (e) {}
            try { fixStretchedControls(); } catch (e) {}   // v1.0.115 通用：行内控件被通栏
            // 🔴 v1.0.110 性能：优先读原生下发的缓存值 window.__dshNativeStatusBar，
            //   避免在 MutationObserver 回调（流式输出时每 300ms 一次）里调 getComputedStyle
            //   —— 那会强制样式重算，属老总明令禁止的「注入层拖慢页面」。
            var h = (typeof window.__dshNativeStatusBar === 'number') ? window.__dshNativeStatusBar
                  : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-statusbar'));
            if (!(h > 0)) return;
            // 🔴 v1.0.110 修一个隐患：这里原先是 `(h + 6)`，**没有扣减 __dshTopShift**。
            //   __dshSetStatusBar 写的是 `h + 6 - shift`，而本函数在 DOMContentLoaded / 观察器
            //   回调里也会跑，一旦跑在 __dshSetStatusBar 之后，就会用 `h + 6` 把正确值覆盖掉
            //   → 抽屉顶部比顶栏矮一整个 shift（v1.0.109 是 12pt，v1.0.110 是 24pt，v1.0.111 起是 18pt）。
            //   现在统一按 `h + 6 - shift` 写，并改用「读回内联值」判等（比 dataset 鲁棒：
            //   React 复用元素只改 style 时 dataset 残留、dataset 判等会漏写，而读回不会）。
            var shift = (typeof window.__dshTopShift === 'number') ? window.__dshTopShift : 0;
            var padTop = (h + 6 - shift) + 'px';
            var cols = document.querySelectorAll('[class*="sidebarCol"], .CZPbNW_sidebarCol, [class*="rightbarCol"], .CZPbNW_rightbarCol');
            for (var i = 0; i < cols.length; i++) {
              if (cols[i].style.getPropertyValue('padding-top') !== padTop ||
                  cols[i].style.getPropertyPriority('padding-top') !== 'important') {
                cols[i].style.setProperty('padding-top', padTop, 'important');
              }
            }
            var subCols = document.querySelectorAll('.dMHGga_session, .dMHGga_panel, .YdIzba_header');
            for (var si = 0; si < subCols.length; si++) {
              subCols[si].style.setProperty('padding-top', '0px', 'important');
            }
          }
          // ===== 🔴 v1.0.110 左侧抽屉宽度：缩到「现在宽度的 70%」（老总 2026-10-16）=====
          //   老总原话：「左侧侧边栏打开页面太宽了，缩到现在宽度的70%」。
          //   「现在的宽度」量测（老总真机截图 clipboard-...0cd2aa15.jpg，横向扫描 _hscan.cjs，
          //     y=1200px 与 y=1800px 两处一致）：右边界 x = 1081px = 360.3pt，占屏宽 430pt 的 83.8%。
          //   ⚠️ 为什么必须走内联 !important：我们样式表里本来就写着
          //     `[class*="sidebarCol"] { width: 280px !important; }`，但实测**完全打不过 DSH**
          //     （沙箱 430x932 实测自然宽 374.5pt、max-width 395.6px=92%，命中规则只有我们那一条
          //      却不见效）—— DSH 原生规则的权重/来源更高。唯一稳压的办法就是运行时写内联 !important
          //     （和 shim_11 处理 fab 的 z-index 是同一套路）。
          //   取值：真机自然宽 360.3pt × 0.70 = 252.2 → 取 252px（= 屏宽的 58.6%）。
          //     用固定 px 而不是「自然宽 × 0.7」的动态算法，是为了**幂等**：每次写入都是同一个值，
          //     绝不可能像旧 fixBottom 那样「读回自己写的值再乘一次」把抽屉越缩越小。
          //     （换机型时按 252/430 的比例缩放即可，注释里给了换算依据。）
          //   幂等实现：只在「读回的内联值 ≠ 目标值」时才写（读内联属性不触发布局重算）。
          var DRAWER_W = 252;   // = 360.3pt(实测自然宽) × 0.70
          function applyDrawerWidth() {
            try {
              var els = document.querySelectorAll('[class*="sidebarCol"], .CZPbNW_sidebarCol');
              for (var i = 0; i < els.length; i++) {
                var el = els[i];
                // v1.0.131 玩家兼容守卫：仅当抽屉是 overlay 定位（absolute/fixed）时才强制 252。
                //   旧版 DSH 前端（如 172.16.0.74）抽屉是 push 布局参与者（static）—— 强制 252
                //   会与原生宽打架，主内容被推出右屏裁 24pt（玩家截图实锤：侧栏 276=252+24
                //   padding，发送钮切半；Safari 无注入 300 自然宽一切正常，与 iOS 版本无关）。
                //   push 态一律跳过本轮保持原生宽；样式未加载时 position 暂为 static 同样跳过，
                //   下轮复判。新版前端抽屉 absolute 照旧收敛 252，行为零变化。
                var __dshDrawerPos = "";
                try { __dshDrawerPos = getComputedStyle(el).position; } catch (e) {}
                if (__dshDrawerPos !== "absolute" && __dshDrawerPos !== "fixed") continue;
                if (el.style.getPropertyValue('width') === DRAWER_W + 'px' &&
                    el.style.getPropertyPriority('width') === 'important') continue;
                el.style.setProperty('width', DRAWER_W + 'px', 'important');
                el.style.setProperty('min-width', DRAWER_W + 'px', 'important');
                el.style.setProperty('max-width', DRAWER_W + 'px', 'important');
                window.__dshDrawerW = DRAWER_W;
              }
            } catch (e) {}
          }
          function shiftTitleCluster() {
            try { applySidebarInset(); } catch (e) {}
            try { applyDrawerWidth(); } catch (e) {}
            // v1.0.104：绝不能再隐藏顶部首行（leading）——左右两个抽屉开关就住在里面，
            // 隐藏它等于把"打开侧边栏/文件"的入口一起干掉。纵向压缩交给 __dshLayoutFix 的负 margin。
            var rows = document.querySelectorAll('[class*="titleRow"]');
            for (var i = 0; i < rows.length; i++) {
              var row = rows[i];
              var cluster = row.querySelector('[class*="titleCluster"]');
              var header = row.closest('header') || row;
              var dir = header.querySelector('button[aria-label="打开目录"], button[aria-label="收起目录"], button[aria-label="打开侧边栏"], button[aria-label="收起侧边栏"]');
              // 目录按钮保持在顶栏左侧最前，不插入到 cluster 内部挤压标题与智能体团队
              if (dir && row && row.firstChild !== dir && dir.parentNode !== cluster) {
                row.insertBefore(dir, row.firstChild);
              }
              if (dir && dir.dataset.dshDirStyled !== '1') {
                dir.dataset.dshDirStyled = '1';
                dir.style.setProperty('margin-left', '0', 'important');
                dir.style.setProperty('margin-right', '6px', 'important');
                dir.style.setProperty('flex', 'none', 'important');
              }
              if (cluster && cluster.dataset.dshClusterStyled !== '1') {
                cluster.dataset.dshClusterStyled = '1';
                cluster.style.setProperty('flex', '1 1 auto', 'important');
                cluster.style.setProperty('width', 'auto', 'important');
                cluster.style.setProperty('padding-left', '0', 'important');
                cluster.style.setProperty('display', 'flex', 'important');
                cluster.style.setProperty('align-items', 'center', 'important');
                cluster.style.setProperty('justify-content', 'center', 'important');
                cluster.style.setProperty('margin', '0 auto', 'important');
                cluster.style.setProperty('gap', '6px', 'important');
              }
            }
            var stray = document.querySelectorAll('button[aria-label="打开侧边栏"], button[aria-label="收起侧边栏"]');
            for (var s = 0; s < stray.length; s++) {
              var off = stray[s].getBoundingClientRect().right < 0;
              var targetVis = off ? 'hidden' : '';
              if (stray[s].dataset.dshVis !== targetVis) {
                stray[s].dataset.dshVis = targetVis;
                stray[s].style.setProperty('visibility', targetVis, 'important');
              }
            }
            var filesBtns = document.querySelectorAll('[data-mobile-nav="files"], button[aria-label="工作区文件"], button[aria-label="文件浏览"]');
            for (var f = 0; f < filesBtns.length; f++) {
              if (filesBtns[f].parentNode) filesBtns[f].parentNode.removeChild(filesBtns[f]);
            }
            // 确保右上角区域内只有唯一右侧抽屉开关，移除其它重叠子节点
            var corners = document.querySelectorAll('.ank0OG_headerCorner, [class*="headerCorner"]');
            for (var c = 0; c < corners.length; c++) {
              var btns = corners[c].querySelectorAll('button');
              if (btns.length > 1) {
                for (var b = 0; b < btns.length - 1; b++) {
                  btns[b].style.setProperty('display', 'none', 'important');
                }
              }
            }
          }
          shiftTitleCluster();
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', shiftTitleCluster, { once: true });
          }

          // 🔴 v1.0.110 抽屉宽度/内边距的对外桥 + 持续兜底。
          //   本 IIFE 与后面那个「顶栏智能体修复」IIFE 是各自独立的闭包，后者访问不到
          //   applyDrawerWidth / applySidebarInset，所以在这里挂一个 window 入口给它调。
          //   另外补三种触发时机，覆盖 React 重建（会抹掉内联样式）：
          //     ① 观察器（由后面那个 IIFE 的 MutationObserver 驱动，见 __dshApplyDrawerWidth 调用）；
          //     ② 任意点击后 350ms（老总点 fab 展开抽屉，滑入动画约 300ms 完成）；
          //     ③ 60 秒内的低频兜底（1s × 60），确保冷启动阶段万无一失。
          window.__dshApplyDrawerWidth = function () {
            try { applySidebarInset(); } catch (e) {}
            try { applyDrawerWidth(); } catch (e) {}
          };
          try {
            document.addEventListener('click', function () {
              setTimeout(function () { try { window.__dshApplyDrawerWidth(); } catch (e) {} }, 350);
            }, true);
          } catch (e) {}
          (function drawerTicks() {
            var n = 0;
            var t = setInterval(function () {
              try { window.__dshApplyDrawerWidth(); } catch (e) {}
              if (++n >= 60) clearInterval(t);
            }, 1000);
          })();

          // v1.0.83：锁屏与后台切回毫秒级自愈支持 (搭配 dsh-anywhere)
          window.__dshFastResume = function () {
            try {
              // 触发一次合成点击与按键事件，打通挂起的微任务队列
              window.dispatchEvent(new Event('pageshow'));
              window.dispatchEvent(new Event('focus'));
              document.dispatchEvent(new Event('visibilitychange'));
            } catch (e) {}
          };
        })();

        // ===== v1.0.106 顶栏「智能体」按钮与标题重叠修复 =====
        // 实测（430x932 iPhone 视口 + 真机 UA，会话页）：DSH 官方把标题 .ank0OG_crumbs 绝对定位到
        // left:54px、横跨 256px（实测 x66~322），而左侧那排图标按钮排在 x56~180 ——
        // 标题直接把「1 个子智能体」徽标（容器仅 32px，内部文字实测 70px 溢出到 x35~105）
        // 和「智能体团队」按钮（x94~134）整排压住，视觉上一团糊。
        // 老总方案：标题不动；智能体按钮右移；「智能体」三个字隐藏。
        // 一律用内联 !important —— DSH 原生样式权重更高，写在 <style> 里打不过。
        (function () {
          if (window.__dshHeaderAgentFix) return;
          window.__dshHeaderAgentFix = 1;

          // 「智能体」三个字隐藏：顶栏动作区里那个 "1 个子智能体" 徽标，容器只有 32px，
          // 文字却要 70px → 溢出到标题底下。藏掉文字（保留徽标与其中箭头，不影响点击）。
          function hideAgentBadgeText() {
            try {
              var header = document.querySelector('header');
              if (!header) return;
              var acts = header.querySelector('[class*="headerActions"]');
              if (!acts) return;
              var spans = acts.querySelectorAll('button > span');
              for (var i = 0; i < spans.length; i++) {
                var sp = spans[i];
                var t = (sp.textContent || '').trim();
                if (!t || t.indexOf('子智能体') === -1) continue;
                if (sp.dataset.dshAgentTxtHidden === '1') continue;
                sp.dataset.dshAgentTxtHidden = '1';
                sp.style.setProperty('display', 'none', 'important');
              }
            } catch (e) {}
          }

          // 智能体按钮右移：脱离标题行文档流，落到标题右侧（实测标题文字止于 x293），
          // 紧贴右侧抽屉开关（32px）左边并留 10px 间距。
          function shiftAgentButtonRight() {
            try {
              var header = document.querySelector('header');
              if (!header) return;
              var btns = header.querySelectorAll('button[aria-label*="智能体团队"]');
              for (var j = 0; j < btns.length; j++) {
            var wrap = btns[j].parentElement;
              if (!wrap) continue;
              if (window.__dshMobilePolish) return;   // shim_16 已接管顶栏摆位，避免两边互相覆盖
              if (wrap.dataset.dshAgentMoved === '1') continue;
                wrap.dataset.dshAgentMoved = '1';
                wrap.style.setProperty('position', 'absolute', 'important');
                wrap.style.setProperty('left', 'auto', 'important');
                wrap.style.setProperty('right', '44px', 'important');
                wrap.style.setProperty('top', '50%', 'important');
                wrap.style.setProperty('transform', 'translateY(-50%)', 'important');
                wrap.style.setProperty('margin', '0', 'important');
                wrap.style.setProperty('z-index', '6', 'important');
              }
            } catch (e) {}
          }

          function fixHeaderAgent() {
            hideAgentBadgeText();
            shiftAgentButtonRight();
          }

          fixHeaderAgent();
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fixHeaderAgent);
          }
          window.addEventListener('load', fixHeaderAgent);

          // DSH 是 React 应用，切换会话时 header 会被整棵重建（内联样式一并丢失），
          // 因此必须持续兜底：MutationObserver 去抖 + 启动阶段额外补 30 秒。
          // 🔴 v1.0.107 修正一个「从来就没生效过」的静默缺陷：本脚本在 documentStart 执行，
          //    此刻 document.documentElement 还是 null（实测 de=false / readyState=loading），
          //    直接 observe 会抛 TypeError: parameter 1 is not of type 'Node' 并被下面的 catch 吞掉
          //    → 观察器从头到尾没装上（实测 fires=0）。必须等 documentElement 就绪再观察
          //    （shim_00 的 watchdog 早就用同样的等待模式修过，shim_11/14/15/16 当年漏了）。
          var pending = 0;
          (function startObserve() {
            if (!document.documentElement) { setTimeout(startObserve, 16); return; }
            try {
              new MutationObserver(function () {
                if (pending) return;
                pending = setTimeout(function () {
                  pending = 0;
                  fixHeaderAgent();
                  // v1.0.110：抽屉宽度/内边距一起兜底（React 重建会连内联样式一并抹掉）
                  try { if (window.__dshApplyDrawerWidth) window.__dshApplyDrawerWidth(); } catch (e) {}
                }, 300);
              }).observe(document.documentElement, { childList: true, subtree: true });
            } catch (e) {}
          })();
          var ticks = 0;
          var iv = setInterval(function () {
            fixHeaderAgent();
            try { if (window.__dshApplyDrawerWidth) window.__dshApplyDrawerWidth(); } catch (e) {}
            if (++ticks >= 30) clearInterval(iv);
          }, 1000);
        })();