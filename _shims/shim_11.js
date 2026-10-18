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
          function applySidebarInset() {
            ensureSidebarOverlay();
            try { tightenRightPanelTop(); } catch (e) {}
            try { restorePageHeadHeight(); } catch (e) {}
            try { fixOverlayOverflow(); } catch (e) {}
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