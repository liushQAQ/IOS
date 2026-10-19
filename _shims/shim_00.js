        (function() {
          var style = document.createElement('style');
          style.id = 'dsh-ios-glass-enhancement';
          style.textContent = [
            ':root {',
            '  --dsw-menu-surface-fill: rgba(255, 255, 255, 0.98) !important;',
            '  --dsw-specific-menu: rgba(255, 255, 255, 0.98) !important;',
            '  --dsw-menu-backdrop-filter: blur(20px) saturate(140%) !important;',
            '}',
            'body[data-ds-dark-theme] {',
            '  --dsw-menu-surface-fill: rgba(20, 22, 26, 0.98) !important;',
            '  --dsw-specific-menu: rgba(20, 22, 26, 0.98) !important;',
            '  --dsw-menu-backdrop-filter: blur(20px) saturate(140%) !important;',
            '}',
            '/* 覆盖所有弹窗、Token用量面板、模型选择、会话列表、设置浮层，彻底告别半透明重叠 */',
            '._7aoaqW_panel,',
            '.lHqH9G_panel,',
            '.fxu7oq_panel,',
            '.VYXhfG_menu,',
            '[data-menu-material="translucent"],',
            '[data-menu-material],',
            '[role="menu"],',
            '[role="listbox"],',
            '[role="dialog"],',
            '.ZiQlkq_panel,',
            '.ZKHwIG_dialog {',
            '  background-color: var(--dsw-menu-surface-fill) !important;',
            '  backdrop-filter: var(--dsw-menu-backdrop-filter) !important;',
            '  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter) !important;',
            '  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--dsw-elevation-stroke-color, rgba(255, 255, 255, 0.12)) !important;',
            '}',
            '/* Token用量弹层(_7aoaqW_panel)内部文字与进度条增强 */',
            '._7aoaqW_panel {',
            '  z-index: 10060 !important;',
            '  color: var(--dsw-alias-label-primary) !important;',
            '}',
            '._7aoaqW_panel:before, .lHqH9G_panel:before, .fxu7oq_panel:before {',
            '  background: var(--dsw-menu-surface-fill) !important;',
            '}',
            '.VYXhfG_modelName,',
            '.VYXhfG_cellLabel,',
            '.VYXhfG_cellValue {',
            '  font-weight: 500 !important;',
            '  opacity: 1 !important;',
            '}',
            '/* 全局触控与滚动平滑加速（对齐原生体验） */',
            '* {',
            '  -webkit-tap-highlight-color: transparent;',
            '}',
            '.scrollable, [data-scrollable], [role="menu"], [role="listbox"], pre, code {',
            '  -webkit-overflow-scrolling: touch !important;',
            '}',
            '/* 保证模型选择弹层、视图选项（工作区/时间排序菜单）在软键盘弹出与收起时拥有固定层级与平滑交互，并且支持触摸滚动 */',
            '.VYXhfG_menu,',
            '[role="menu"],',
            '[data-menu-material],',
            '.tPVXea_viewOptionsMenu,',
            '[class*="viewOptionsMenu"],',
            '[class*="_portal_"] {',
            '  -webkit-overflow-scrolling: touch !important;',
            '  z-index: 10050 !important;',
            '  max-height: min(480px, 85vh) !important;',
            '  transform: translateZ(0);',
            '}',
            '.VYXhfG_groups {',
            '  -webkit-overflow-scrolling: touch !important;',
            '  max-height: min(380px, 72vh) !important;',
            '  transform: translateZ(0);',
            '}',
            '/* 提示词优化与思考强度设置浮层弹窗移动端适配，防止超出屏幕 */',
            '.dsh-po-modal-container {',
            '  max-height: 80vh !important;',
            '  overflow-y: auto !important;',
            '  -webkit-overflow-scrolling: touch !important;',
            '  box-sizing: border-box !important;',
            '}',
            '@media (max-width: 600px) {',
            '  .dsh-po-modal-container {',
            '    position: fixed !important;',
            '    left: 12px !important;',
            '    right: 12px !important;',
            '    bottom: 60px !important;',
            '    width: auto !important;',
            '    max-width: calc(100vw - 24px) !important;',
            '    max-height: calc(85vh - 70px) !important;',
            '    z-index: 10050 !important;',
            '  }',
            '}',
            '/* 移动端全级别菜单、弹窗、二级/三级插件浮层通用防溢出与自适应安全边界约束 */',
            '@media (max-width: 768px) {',
            '  [role="menu"],',
            '  [role="listbox"],',
            '  [role="dialog"],',
            '  [data-menu-material],',
            '  [data-menu-surface],',
            '  .VYXhfG_menu,',
            '  [class*="menu"],',
            '  [class*="modal"],',
            '  [class*="Modal"],',
            '  [class*="popup"],',
            '  [class*="Popup"],',
            '  [class*="dropdown"],',
            '  [class*="Dropdown"],',
            '  [class*="dialog"],',
            '  [class*="Dialog"] {',
            '    max-width: calc(100vw - 20px) !important;',
            '    max-height: calc(100vh - 40px) !important;',
            '    box-sizing: border-box !important;',
            '    overflow-y: auto !important;',
            '    -webkit-overflow-scrolling: touch !important;',
            '  }',
            '  /* 原生 HTML5 <dialog>（如费用明细、会话统计弹窗）严格遵守 iOS 顶部状态栏与底部安全区，严禁超高压顶 */',
            '  dialog,',
            '  dialog[open],',
            '  dialog[role="dialog"] {',
            '    position: fixed !important;',
            '    top: max(56px, calc(env(safe-area-inset-top, 0px) + 16px)) !important;',
            '    bottom: max(16px, env(safe-area-inset-bottom, 0px)) !important;',
            '    left: 12px !important;',
            '    right: 12px !important;',
            '    margin: 0 !important;',
            '    width: calc(100vw - 24px) !important;',
            '    max-width: calc(100vw - 24px) !important;',
            '    max-height: calc(100vh - max(56px, calc(env(safe-area-inset-top, 0px) + 16px)) - max(16px, env(safe-area-inset-bottom, 0px))) !important;',
            '    box-sizing: border-box !important;',
            '    overflow-y: auto !important;',
            '    -webkit-overflow-scrolling: touch !important;',
            '  }',
            '}',
            '/* 优化一级、二级、三级菜单与弹层移动端层叠排版，消除相互遮挡 */',
            '.VYXhfG_cell {',
            '  min-height: 40px !important;',
            '  padding: 8px 12px !important;',
            '}',
            '.VYXhfG_option {',
            '  min-height: 38px !important;',
            '}',
            '/* 二级与三级侧边/抽屉菜单适配 */',
            '[data-slot="sidebar.right"], [data-slot="sidebar.left"] {',
            '  z-index: 10040 !important;',
            '}',
            '/* 大图预览弹窗 (ImageLightbox) 关闭按钮严格固定在屏幕安全视口右上角，严禁被缩放图片移出屏外 */',
            '[role="dialog"][aria-modal="true"] button[class*="close"],',
            '.ImageLightbox_close,',
            '[class*="ImageLightbox"] button {',
            '  position: fixed !important;',
            '  top: max(20px, calc(env(safe-area-inset-top, 0px) + 12px)) !important;',
            '  right: max(20px, calc(env(safe-area-inset-right, 0px) + 12px)) !important;',
            '  z-index: 100000 !important;',
            '  width: 38px !important;',
            '  height: 38px !important;',
            '  background: rgba(0, 0, 0, 0.65) !important;',
            '  color: #ffffff !important;',
            '  border: 1px solid rgba(255, 255, 255, 0.3) !important;',
            '  border-radius: 999px !important;',
            '  backdrop-filter: blur(10px) !important;',
            '  -webkit-backdrop-filter: blur(10px) !important;',
            '  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;',
            '}',
            '[data-phase] header,',
            '.ank0OG_header {',
            '  position: sticky !important;',
            '  top: 0 !important;',
            '  z-index: 1020 !important;',
            '  background: var(--dsw-alias-bg-base, #ffffff) !important;',
            '  box-sizing: border-box !important;',
            '  display: flex !important;',
            '  flex-direction: column !important;',
            '  min-height: 0 !important;',
            '  padding: 8px 10px 0 10px !important;',
            '  flex: none !important;',
            '}',
            'body[data-ds-dark-theme] [data-phase] header,',
            'body[data-ds-dark-theme] .ank0OG_header {',
            '  background: var(--dsw-alias-bg-base, #151517) !important;',
            '}',
            '.ank0OG_headerLeading {',
            '  display: none !important;',
            '}',
            '/* 隐藏顶栏 Windows/桌面系统文件资源管理器打开图标 */',
            '.ank0OG_header .PPCmka_menuAnchor,',
            '.ank0OG_header .PPCmka_split,',
            '[data-slot="conversation.session.header.utilities"] {',
            '  display: none !important;',
            '}',
            '/* 彻底隐藏所有运行命令/执行步骤/文件路径后面的“复制”按钮 */',
            '[data-mobile-nav="copy-file"],',
            'button[data-mobile-nav="copy-file"] {',
            '  display: none !important;',
            '  visibility: hidden !important;',
            '  width: 0 !important;',
            '  height: 0 !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  pointer-events: none !important;',
            '}',
            '[data-phase] header .ank0OG_titleRow,',
            '.ank0OG_titleRow {',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  height: 32px !important;',
            '  min-height: 32px !important;',
            '  padding: 0 2px !important;',
            '  margin: 0 !important;',
            '  box-sizing: border-box !important;',
            '  width: 100% !important;',
            '  gap: 6px !important;',
            '}',
            '/* v1.0.83：不再把左侧目录按钮钉成 28px。页面自带 38px，钉小后进了具体会话就变小，',
            '   还和另一颗叠在一起。尺寸交给页面自己，位置回归正常排列。 */',
            '[data-mobile-nav="toggle"] {',
            '  position: static !important;',
            '  transform: none !important;',
            '  top: auto !important;',
            '  left: auto !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  border-radius: var(--dsw-radius-sm, 6px) !important;',
            '  z-index: 100 !important;',
            '}',
            '[data-mobile-nav="toggle"] svg {',
            '  width: 16px !important;',
            '  height: 16px !important;',
            '  display: block !important;',
            '  margin: auto !important;',
            '}',
            '[data-mobile-nav="files"] {',
            '  display: none !important;',
            '}',
            '/* 顶栏会话标题与成员按钮同步右移，严禁与左侧侧边栏按钮重叠 */',
            '/* v1.0.75：flex:1 会把标题簇拉满整行，标题文字仍贴在最左边、右边空出两百多像素。',
            '   改成按内容收缩并用 margin-left:auto 把空位吃到左边，整组靠右贴近右侧边栏按钮。 */',
            '/* 顶栏会话标题居中排布（老总定版）：',
            '   左侧目录按钮靠左，会话标题在屏幕正中居中显示并平滑截断，右侧操作组靠右排列！ */',
            '.ank0OG_titleRow,',
            '[data-phase] header [class*="titleRow"] {',
            '  position: relative !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  justify-content: space-between !important;',
            '  width: 100% !important;',
            '  box-sizing: border-box !important;',
            '}',
            '.ank0OG_crumbs,',
            '[data-phase] header [class*="crumbs"],',
            '[data-phase] header [class$="_crumbs"] {',
            '  position: absolute !important;',
            '  left: 54px !important;',
            '  right: 96px !important;',
            '  margin: 0 auto !important;',
            '  display: flex !important;',
            '  justify-content: center !important;',
            '  align-items: center !important;',
            '  text-align: center !important;',
            '  max-width: calc(100% - 150px) !important;',
            '  min-width: 0 !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  pointer-events: auto !important;',
            '}',
            '.ank0OG_crumbs *,',
            '[data-phase] header [class*="crumbs"] *,',
            '.ank0OG_crumb,',
            '.ank0OG_crumbCurrent,',
            '.ank0OG_crumbSeg {',
            '  text-align: center !important;',
            '  max-width: 100% !important;',
            '  min-width: 0 !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  display: inline-block !important;',
            '  word-break: keep-all !important;',
            '  font-weight: 600 !important;',
            '  font-size: 15px !important;',
            '  line-height: 22px !important;',
            '  padding: 2px 4px !important;',
            '}',
            '.ank0OG_titleCluster,',
            '[data-phase] header [class*="titleCluster"],',
            '.ank0OG_headerActions {',
            '  margin-left: auto !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  gap: 6px !important;',
            '}',
            '/* 智能体团队及顶栏操作按钮：强制绝对抗挤压、不收缩、不折行、完整保持横排药丸 */',
            '[class*="titleCluster"] > :not([class*="crumbs"]):not([class$="_crumbs"]),',
            '[class*="titleCluster"] button,',
            '.ank0OG_titleCluster button,',
            'button[aria-label="智能体团队"],',
            'button[aria-label*="智能体团队"],',
            'button[title*="智能体团队"],',
            '[class*="agentTeam"],',
            '[data-agent-team-button] {',
            '  flex: 0 0 auto !important;',
            '  flex-shrink: 0 !important;',
            '  white-space: nowrap !important;',
            '  min-width: max-content !important;',
            '  word-break: keep-all !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '}',
            '.ank0OG_headerActions {',
            '  height: 32px !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '}',
            '.ank0OG_headerCorner {',
            '  height: 32px !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  margin-left: auto !important;',
            '}',
            '/* 统一右侧按钮尺寸为 32x32。v1.0.83：目录按钮也在 headerActions 里，',
            '   排除它，保留页面自带的 38px，避免进了具体会话就变小。 */',
            '.ank0OG_headerCorner button,',
            '.ank0OG_headerCorner [role="button"],',
            '.ank0OG_headerActions button:not([data-mobile-nav="toggle"]),',
            '.ank0OG_headerActions [role="button"]:not([data-mobile-nav="toggle"]) {',
            '  height: 32px !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '}',
            '.ank0OG_crumbs,',
            '[data-phase] header [class*="crumbs"] {',
            '  flex: 0 1 auto !important;',
            '  flex-shrink: 1 !important;',
            '  min-width: 0 !important;',
            '  max-width: 22vw !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  height: 32px !important;',
            '}',
            '.ank0OG_crumbSeg {',
            '  min-width: 0 !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '}',
            '.ank0OG_crumb,',
            '.ank0OG_crumbCurrent {',
            '  max-width: 100% !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  display: inline-block !important;',
            '  word-break: keep-all !important;',
            '  font-weight: 600 !important;',
            '  font-size: 15px !important;',
            '  line-height: 22px !important;',
            '  padding: 2px 4px !important;',
            '}',
            '/* 调整标签页切换行 */',
            '.ank0OG_tabs {',
            '  margin-top: 4px !important;',
            '}',
            '/* 思考块(ReasoningRow)在移动端流式输出时单行自适应省略，防止文字折行溢出碰撞下方命令与步骤 */',
            '.w_X3iW_root {',
            '  overflow: hidden !important;',
            '}',
            '.w_X3iW_row {',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  flex-wrap: nowrap !important;',
            '  white-space: nowrap !important;',
            '  overflow: hidden !important;',
            '}',
            '.w_X3iW_summary,',
            '.w_X3iW_summaryText {',
            '  white-space: nowrap !important;',
            '  overflow: hidden !important;',
            '  text-overflow: ellipsis !important;',
            '  display: inline-block !important;',
            '  max-width: 100% !important;',
            '}',
            '/* 保证对话消息流内边距舒适居中与滚动自适应 */',
            '.X6jxGq_scroll {',
            '  padding: 16px 16px 24px 16px !important;',
            '}',
            '.X6jxGq_column {',
            '  max-width: 100% !important;',
            '  width: 100% !important;',
            '  margin: 0 auto !important;',
            '}',
            '.ank0OG_headerActions {',
            '  flex: 0 0 auto !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '}',
            '._1Ihh1G_root,',
            '._1Ihh1G_trigger {',
            '  max-width: none !important;',
            '  overflow: visible !important;',
            '  white-space: nowrap !important;',
            '  padding: 0 4px !important;',
            '}',
            '/* 移动端顶栏隐藏智能体按钮右侧孤立的数字徽标(如数字 1)，消除视觉杂音，保持纯净图标 */',
            '._1Ihh1G_count,',
            '[class*="_1Ihh1G_count"] {',
            '  display: none !important;',
            '  visibility: hidden !important;',
            '  width: 0 !important;',
            '  height: 0 !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '}',
            '.ank0OG_headerCorner {',
            '  margin-left: 2px !important;',
            '  margin-right: 0px !important;',
            '  flex: 0 0 auto !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '}',
            '.ank0OG_headerCorner button,',
            'button[aria-label="打开右侧边栏"],',
            '.iFjIhq_button {',
            '  width: 28px !important;',
            '  height: 28px !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '}',
            '.ank0OG_headerCorner button svg,',
            'button[aria-label="打开右侧边栏"] svg,',
            '.iFjIhq_button svg {',
            '  width: 16px !important;',
            '  height: 16px !important;',
            '  display: block !important;',
            '  margin: auto !important;',
            '}',
            '.dMHGga_iconButton,',
            'button[aria-label="收起右侧边栏"] {',
            '  top: 12px !important;',
            '  height: 28px !important;',
            '  width: 28px !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '}',
            /* 2. 修复右侧边栏(文件/终端/浏览器/文档预览/Diff代码对比)在移动端展开后遮挡且缺乏状态栏避让 */
            '[class*="rightbarCol"],',
            '.CZPbNW_rightbarCol,',
            '[data-slot="sidebar.right"],',
            '.dMHGga_session,',
            '[class*="dMHGga_root"],',
            '.dMHGga_panel,',
            '.YdIzba_header,',
            '[class*="YdIzba_root"],',
            '[data-dockkit-surface],',
            '[data-dockkit-strip],',
            '[data-aionui-preview-col] {',
            '  padding-top: calc(var(--dsh-statusbar, 54px) + 6px - var(--dsh-topshift, 0px)) !important;',
            '  box-sizing: border-box !important;',
            '}',
            '[class*="rightbarCol"],',
            '.CZPbNW_rightbarCol {',
            '  padding-bottom: max(16px, env(safe-area-inset-bottom)) !important;',
            '  height: 100vh !important;',
            '  height: 100dvh !important;',
            '  max-height: 100vh !important;',
            '  max-height: 100dvh !important;',
            '  overflow: hidden !important;',
            '}',
            '@media (max-width: 1023px) {',
            '  .CZPbNW_rightbarCol, [class*="rightbarCol"] {',
            '    position: fixed !important;',
            '    inset: 0 !important;',
            '    width: 100vw !important;',
            '    max-width: 100vw !important;',
            '    height: 100vh !important;',
            '    height: 100dvh !important;',
            '    z-index: 10040 !important;',
            '    background: var(--dsw-alias-bg-base, #18181b) !important;',
            '    box-sizing: border-box !important;',
            '    transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease !important;',
            '    transform: translateX(105%) !important;',
            '    opacity: 0 !important;',
            '    pointer-events: none !important;',
            '  }',
            '  .CZPbNW_rightbarCol:has([data-sidebar-right-open="true"]),',
            '  [class*="rightbarCol"]:has([data-sidebar-right-open="true"]) {',
            '    transform: none !important;',
            '    opacity: 1 !important;',
            '    pointer-events: auto !important;',
            '  }',
            '  .dMHGga_panel {',
            '    width: 100% !important;',
            '    height: 100% !important;',
            '    display: flex !important;',
            '    flex-direction: column !important;',
            '  }',
            '}',
            '.dMHGga_panel[data-sidebar-right-open] {',
            '  pointer-events: auto !important;',
            '  z-index: 10040 !important;',
            '}',
            '/* 右侧边栏展开时移动端半透明背景遮罩（点击即可收起退出） */',
            '.dsh-mobile-sidebar-backdrop {',
            '  position: fixed;',
            '  inset: 0;',
            '  background: rgba(0, 0, 0, 0.45);',
            '  backdrop-filter: blur(4px);',
            '  -webkit-backdrop-filter: blur(4px);',
            '  z-index: 10035;',
            '  opacity: 0;',
            '  pointer-events: none;',
            '  transition: opacity 0.2s ease;',
            '}',
            '.dsh-mobile-sidebar-backdrop.active {',
            '  opacity: 1;',
            '  pointer-events: auto;',
            '}',
            '/* v1.0.78：不再注入「返回对话」蓝按钮和右上角「✕」，旧版本残留的直接隐藏 */',
            '.dsh-mobile-back-to-chat-btn,',
            '.dsh-mobile-panel-close-btn,',
            '.dsh-mobile-panel-nav {',
            '  display: none !important;',
            '}',
            '/* 全面排查：图片大图灯箱预览（ImageLightbox）、模态弹窗与所有全屏浮层的关闭按钮，严禁插入 iOS 系统状态栏 */',
            '._close_1hos8_29,',
            'button[aria-label="关闭"]._close_1hos8_29,',
            '[class*="_close_1hos8_"],',
            '._close_o6lrb_87,',
            '[class*="_close_o6lrb_"] {',
            '  top: max(54px, calc(env(safe-area-inset-top) + 12px)) !important;',
            '  right: max(16px, calc(env(safe-area-inset-right) + 12px)) !important;',
            '  z-index: 20050 !important;',
            '}',
            '/* v1.0.78：返回按钮已移除，面板标题栏不再为其让出左右内边距 */',
            '/* 移动端文件预览【保存/分享到手机】高亮主按钮与电脑端打开降级 */',
            '.dsh-mobile-save-file-btn {',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  gap: 6px !important;',
            '  height: 36px !important;',
            '  padding: 0 16px !important;',
            '  border-radius: 18px !important;',
            '  background: #007aff !important;',
            '  color: #ffffff !important;',
            '  font-size: 14px !important;',
            '  font-weight: 600 !important;',
            '  border: none !important;',
            '  box-shadow: 0 2px 8px rgba(0, 122, 255, 0.35) !important;',
            '  cursor: pointer !important;',
            '  margin-bottom: 8px !important;',
            '}',
            'body[data-ds-dark-theme] .dsh-mobile-save-file-btn {',
            '  background: #0a84ff !important;',
            '  color: #ffffff !important;',
            '  box-shadow: 0 2px 8px rgba(10, 132, 255, 0.4) !important;',
            '}',
            '/* 暗黑模式下精细化适配新增的分享、下载与关闭按钮，彻底杜绝泛白 */',
            'body[data-ds-dark-theme] .dsh-mobile-share-btn {',
            '  background: rgba(255, 255, 255, 0.12) !important;',
            '  color: #64d2ff !important;',
            '  border: 1px solid rgba(255, 255, 255, 0.1) !important;',
            '}',
            'body[data-ds-dark-theme] .dsh-mobile-download-btn {',
            '  background: #0a84ff !important;',
            '  color: #ffffff !important;',
            '  border: none !important;',
            '  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4) !important;',
            '}',
            'body[data-ds-dark-theme] .dsh-mobile-menu-close-btn {',
            '  background: rgba(255, 255, 255, 0.18) !important;',
            '  color: rgba(255, 255, 255, 0.85) !important;',
            '  border: 1px solid rgba(255, 255, 255, 0.15) !important;',
            '}',
            'body[data-ds-dark-theme] .dsh-mobile-panel-close-btn {',
            '  background: rgba(40, 40, 44, 0.75) !important;',
            '  color: #ffffff !important;',
            '  border: 1px solid rgba(255, 255, 255, 0.15) !important;',
            '}',
            '/* 电脑端打开按钮在移动端降级为次要轮廓样式并标注来源 */',
            '.PPCmka_split[data-open-target="file"] .PPCmka_main {',
            '  font-size: 12px !important;',
            '  opacity: 0.8 !important;',
            '}',
            '/* 暗黑模式高对比度强化 */',
            'body[data-ds-dark-theme] .YdIzba_empty,',
            'body[data-ds-dark-theme] [data-textpreview-unsupported] {',
            '  color: #e5e7eb !important;',
            '}',
            'body[data-ds-dark-theme] .YdIzba_emptyLine {',
            '  color: #e5e7eb !important;',
            '  font-size: 14px !important;',
            '  font-weight: 500 !important;',
            '}',
            '/* 3. 修复设置主弹层与二/三级弹层(API Key、模型配置、二次确认)的层级深度冲突 */',
            '.ZiQlkq_overlay {',
            '  z-index: 10000 !important;',
            '}',
            '.ZiQlkq_panel {',
            '  z-index: 10001 !important;',
            '}',
            '/* 确保下级模态弹窗、确认框、快捷选择框永远压在设置面板之上，不再被遮挡在底部 */',
            '[role="dialog"]:not(.ZiQlkq_panel),',
            '[aria-modal="true"]:not(.ZiQlkq_panel),',
            '.ZKHwIG_dialog,',
            '.p2h2LG_card,',
            '.bqwvaa_menu,',
            '[data-portal-menu],',
            '[data-floating-ui-portal] > * {',
            '  z-index: 10050 !important;',
            '}',
            '/* 3.1 移动端软键盘弹出时，约束 @ / / / + 候选菜单高度与滚动，顶部留出充足安全边距，绝不顶出屏幕之外 */',
            '.bqwvaa_menu,',
            '[data-trigger-menu] {',
            '  max-height: min(180px, 38vh) !important;',
            '  overflow-y: auto !important;',
            '  -webkit-overflow-scrolling: touch !important;',
            '  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.25) !important;',
            '  z-index: 10050 !important;',
            '}',
            '.bqwvaa_viewport {',
            '  max-height: calc(min(180px, 38vh) - 8px) !important;',
            '  overflow-y: auto !important;',
            '  -webkit-overflow-scrolling: touch !important;',
            '}',
            '/* 3.2 全局模态弹窗、确认框、AI问答/选择题卡片、下拉菜单全局安全规范：',
            '   1. 严格避让状态栏与灵动岛（top >= var(--dsh-statusbar, 54px) + 8px）；',
            '   2. 严格避让底部安全区（bottom >= env(safe-area-inset-bottom, 16px) + 8px）；',
            '   3. 限制最大高度（最大不超过 calc(100vh - var(--dsh-statusbar, 54px) - 80px)），内部强制开启平滑惯性滚动，绝不顶出状态栏、绝不超出底栏！ */',
            '[class*="NwyCaq_card"],',
            '.NwyCaq_card,',
            '[class*="QuestionComposer_card"],',
            '[data-choice-dialog],',
            '[class*="questionDialog"],',
            '[class*="questionCard"],',
            '[class*="choiceDialog"],',
            '[class*="choicePanel"],',
            '[class*="optionsPanel"],',
            '[class*="choiceContainer"],',
            '[class*="PlanReviewPanel_card"] {',
            '  max-height: calc(100vh - var(--dsh-statusbar, 54px) - 80px) !important;',
            '  max-height: calc(100dvh - var(--dsh-statusbar, 54px) - 80px) !important;',
            '  display: flex !important;',
            '  flex-direction: column !important;',
            '  overflow: hidden !important;',
            '  box-sizing: border-box !important;',
            '}',
            '[class*="NwyCaq_body"],',
            '.NwyCaq_body,',
            '[class*="NwyCaq_options"],',
            '.NwyCaq_options,',
            '[class*="questionBody"],',
            '[class*="choiceBody"] {',
            '  flex: 1 1 auto !important;',
            '  min-height: 0 !important;',
            '  overflow-y: auto !important;',
            '  -webkit-overflow-scrolling: touch !important;',
            '  overscroll-behavior: contain !important;',
            '  padding-bottom: max(16px, env(safe-area-inset-bottom)) !important;',
            '  box-sizing: border-box !important;',
            '}',
            '/* 浮动菜单与弹出层（@ / / / + / 模型选择 / 更多操作等）：同样绝不冲破状态栏与底栏 */',
            '.bqwvaa_menu,',
            '[data-trigger-menu],',
            '[data-portal-menu],',
            '.p2h2LG_card,',
            '.ZKHwIG_dialog,',
            '[role="dialog"]:not(.ZiQlkq_panel) {',
            '  max-height: calc(100vh - var(--dsh-statusbar, 54px) - 80px) !important;',
            '  max-height: calc(100dvh - var(--dsh-statusbar, 54px) - 80px) !important;',
            '  overflow-y: auto !important;',
            '  -webkit-overflow-scrolling: touch !important;',
            '  overscroll-behavior: contain !important;',
            '  box-sizing: border-box !important;',
            '}',
            '/* 4. 暗黑模式按钮与交互控件对比度强化（老总铁律：杜绝灰白底+白字看不清） */',
            'body[data-ds-dark-theme] .NwyCaq_option,',
            'body[data-ds-dark-theme] [class*="NwyCaq_option"],',
            '@media (prefers-color-scheme: dark) {',
            '  .NwyCaq_option, [class*="NwyCaq_option"] {',
            '    background: #1c1c1e !important;',
            '    border: 1px solid rgba(255, 255, 255, 0.12) !important;',
            '    color: #f2f2f7 !important;',
            '  }',
            '  .NwyCaq_option .NwyCaq_number, [class*="NwyCaq_option"] [class*="NwyCaq_number"] {',
            '    background: #2c2c2e !important;',
            '    color: #e5e5ea !important;',
            '  }',
            '  .NwyCaq_option .NwyCaq_optionLabel, [class*="NwyCaq_option"] [class*="NwyCaq_optionLabel"] {',
            '    color: #ffffff !important;',
            '    font-weight: 500 !important;',
            '  }',
            '  .NwyCaq_option .NwyCaq_description, [class*="NwyCaq_option"] [class*="NwyCaq_description"] {',
            '    color: #a1a1a6 !important;',
            '  }',
            '  .NwyCaq_optionSelected, [class*="NwyCaq_optionSelected"],',
            '  .NwyCaq_option:hover:not(:disabled) {',
            '    background: #0a84ff !important;',
            '    border-color: #0a84ff !important;',
            '    color: #ffffff !important;',
            '  }',
            '  .NwyCaq_optionSelected .NwyCaq_number, [class*="NwyCaq_optionSelected"] [class*="NwyCaq_number"] {',
            '    background: rgba(255, 255, 255, 0.25) !important;',
            '    color: #ffffff !important;',
            '  }',
            '  .NwyCaq_optionSelected .NwyCaq_optionLabel, [class*="NwyCaq_optionSelected"] [class*="NwyCaq_optionLabel"],',
            '  .NwyCaq_optionSelected .NwyCaq_description, [class*="NwyCaq_optionSelected"] [class*="NwyCaq_description"] {',
            '    color: #ffffff !important;',
            '  }',
            '  .NwyCaq_customRow, [class*="NwyCaq_customRow"], [class*="NwyCaq_customBlock"] {',
            '    background: #1c1c1e !important;',
            '    border: 1px dashed rgba(255, 255, 255, 0.25) !important;',
            '  }',
            '  .NwyCaq_customRow input, [class*="NwyCaq_customRow"] input,',
            '  .NwyCaq_fieldInput, [class*="NwyCaq_fieldInput"] {',
            '    color: #ffffff !important;',
            '    background: transparent !important;',
            '  }',
            '  [data-mobile-nav="session-log"], button[data-mobile-nav="session-log"] {',
            '    background: #242426 !important;',
            '    color: #e5e5ea !important;',
            '    border: 1px solid rgba(255, 255, 255, 0.12) !important;',
            '  }',
            '  [data-mobile-nav="session-log"]:hover {',
            '    background: #2c2c2e !important;',
            '    color: #ffffff !important;',
            '  }',
            '  button.NwyCaq_waitButton, [class*="NwyCaq_waitButton"],',
            '  .PlanReviewPanel_card button, [class*="PlanReviewPanel_card"] button {',
            '    border-color: rgba(255, 255, 255, 0.2) !important;',
            '    color: #ffffff !important;',
            '  }',
            '}',
            '/* 5. 修复底部 token 用量及统计胶囊在手机端过宽溢出、需要横向滑动的严重体验问题 */',
            '/* 支持自动折行/多行展示，字体与边距精细化自适应，保证所有指标 100% 完整可见无需滑块 */',
            '.uWtHQG_dock {',
            '  flex-wrap: wrap !important;',
            '  gap: 3px 6px !important;',
            '  justify-content: center !important;',
            '  width: 100% !important;',
            '  max-width: 100% !important;',
            '  box-sizing: border-box !important;',
            '  overflow: visible !important;',
            '  padding: 2px 8px !important;',
            '}',
            '.z4IYsq_root, [data-composer-stats] {',
            '  flex-wrap: wrap !important;',
            '  gap: 3px 6px !important;',
            '  justify-content: center !important;',
            '  max-width: 100% !important;',
            '  box-sizing: border-box !important;',
            '  overflow: visible !important;',
            '}',
            '.z4IYsq_anchor {',
            '  max-width: 100% !important;',
            '  flex: 0 1 auto !important;',
            '}',
            '.z4IYsq_pill {',
            '  font-size: 11px !important;',
            '  padding: 2px 6px !important;',
            '  gap: 4px !important;',
            '  max-width: 100% !important;',
            '  white-space: normal !important;',
            '  word-break: break-all !important;',
            '  text-align: center !important;',
            '  line-height: 15px !important;',
            '  display: inline-block !important;',
            '}',
            '.z4IYsq_pill svg {',
            '  width: 12px !important;',
            '  height: 12px !important;',
            '  flex-shrink: 0 !important;',
            '}',
            '._7aoaqW_root {',
            '  max-width: 100% !important;',
            '  flex: 0 1 auto !important;',
            '}',
            '._7aoaqW_trigger {',
            '  font-size: 11px !important;',
            '  padding: 2px 6px !important;',
            '  gap: 4px !important;',
            '  line-height: 15px !important;',
            '  white-space: normal !important;',
            '}',
            '._7aoaqW_trigger svg {',
            '  width: 12px !important;',
            '  height: 12px !important;',
            '  flex-shrink: 0 !important;',
            '}',
            '/* 底部对话输入框与会话流留出移动端底部操作与安全区边距，紧凑贴合底部 */',
            ':root {',
            '  --dsh-composer-dock-inset: 2px !important;',
            '}',
            '.uWtHQG_root {',
            '  padding-bottom: max(6px, env(safe-area-inset-bottom)) !important;',
            '}',
            '.ank0OG_composerSeat {',
            '  padding-bottom: 2px !important;',
            '}',
            '/* 会话框 + 号对齐居中，防止图标偏下或未居中 */',
            '.uWtHQG_add {',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  padding: 0 !important;',
            '  width: 28px !important;',
            '  height: 28px !important;',
            '  box-sizing: border-box !important;',
            '}',
            '.uWtHQG_add svg {',
            '  display: block !important;',
            '  margin: auto !important;',
            '  width: 14px !important;',
            '  height: 14px !important;',
            '}',
            '/* 原生语音输入按钮样式与动画 */',
            '.dsh-mobile-voice-btn {',
            '  width: 28px !important;',
            '  height: 28px !important;',
            '  border-radius: 50% !important;',
            '  display: inline-flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  border: none !important;',
            '  background: transparent !important;',
            '  color: var(--dsw-alias-label-secondary, #666) !important;',
            '  cursor: pointer !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  flex: 0 0 28px !important;',
            '  transition: all 0.2s ease !important;',
            '}',
            '.dsh-mobile-voice-btn.recording {',
            '  background: #ff3b30 !important;',
            '  color: #ffffff !important;',
            '  box-shadow: 0 0 10px rgba(255, 59, 48, 0.6) !important;',
            '  animation: dshVoicePulse 1.2s infinite ease-in-out !important;',
            '}',
            '@keyframes dshVoicePulse {',
            '  0% { transform: scale(1); }',
            '  50% { transform: scale(1.12); }',
            '  100% { transform: scale(1); }',
            '}',
            '/* 移动端底部操作行防挤压重叠与紧凑布局 */',
            '.uWtHQG_row {',
            '  display: flex !important;',
            '  justify-content: space-between !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  flex-wrap: nowrap !important;',
            '  width: 100% !important;',
            '  box-sizing: border-box !important;',
            '}',
            '.uWtHQG_tools {',
            '  flex: 0 0 auto !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 3px !important;',
            '}',
            '.uWtHQG_trailing {',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  min-width: 0 !important;',
            '  flex: 1 1 auto !important;',
            '  justify-content: flex-end !important;',
            '}',
            '.uWtHQG_standardControls {',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  gap: 4px !important;',
            '  min-width: 0 !important;',
            '  flex: 0 1 auto !important;',
            '  overflow: hidden !important;',
            '}',
            '.dsh-po-capsule {',
            '  flex-shrink: 1 !important;',
            '  min-width: 0 !important;',
            '}',
            '.VYXhfG_trigger {',
            '  max-width: min(115px, 28vw) !important;',
            '  min-width: 0 !important;',
            '  flex-shrink: 1 !important;',
            '  padding: 0 4px !important;',
            '}',
            '.VYXhfG_triggerLabel {',
            '  text-overflow: ellipsis !important;',
            '  white-space: nowrap !important;',
            '  overflow: hidden !important;',
            '  min-width: 0 !important;',
            '}',
            '/* 发送/停止/暂停圆形按钮纯正几何居中（消除文字/下箭头重叠穿透与偏移歪斜） */',
            '.uWtHQG_primary {',
            '  flex: 0 0 28px !important;',
            '  width: 28px !important;',
            '  height: 28px !important;',
            '  border-radius: 50% !important;',
            '  display: flex !important;',
            '  align-items: center !important;',
            '  justify-content: center !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  transform: none !important;',
            '  box-sizing: border-box !important;',
            '}',
            '.uWtHQG_primary svg {',
            '  display: block !important;',
            '  margin: 0 !important;',
            '  width: 14px !important;',
            '  height: 14px !important;',
            '  flex-shrink: 0 !important;',
            '}'
          ].join('\n');
          function attach() {
            if (!document.head) { setTimeout(attach, 10); return; }
            if (!document.getElementById('dsh-ios-glass-enhancement')) {
              document.head.appendChild(style);
            }
          }
          attach();

          // v1.0.120 页面类型自适应布局锁（彻底废除 :has() 选择器，iOS 14/15/16 全兼容）
          // 1. DSH 主控页（DOM 内存在 #root 且加载 /assets/ 打包脚本）→ 锁定 html/body 为视口固定布局，
          //    与 1.0.70 黄金基线逐字一致，保证 DSH 首屏布局绝不回退；
          // 2. 自建仪表盘（9009 等）/外部网页 → 立刻注入解锁样式，恢复 100% 原生纵向滚动，绝不锁死；
          // 3. 顺带补齐首屏底色：暗黑模式直接铺 #151517 深色底，绝不再出现刺眼白屏。
          (function adaptPageLayoutLock() {
            var LOCK_ID = 'dsh-ios-page-lock';
            var UNLOCK_ID = 'dsh-ios-page-unlock';
            var LOCK_CSS = 'html, body { overflow: hidden !important; overscroll-behavior: none !important; position: fixed !important; inset: 0 !important; width: 100% !important; height: 100% !important; }';
            var UNLOCK_CSS = 'html, body { overflow: auto !important; overscroll-behavior: auto !important; position: static !important; inset: auto !important; width: auto !important; height: auto !important; min-height: 100% !important; }';
            var decided = false;
            var tries = 0;

            function isPublicWebHost() {
              var h = (location.hostname || '').toLowerCase();
              var keys = ['aliyun.com', 'baidu.com', 'doubao.com', 'moonshot.cn', 'tencent.com',
                          'openai.com', 'chatgpt.com', 'claude.ai', 'google.com', 'grok.com',
                          'xfyun.cn', 'chatglm.cn', 'zhipuai.cn', 'minimax.chat', 'deepseek.com',
                          'volces.com', 'bigmodel.cn', 'qianwen.com'];
              for (var i = 0; i < keys.length; i++) { if (h.indexOf(keys[i]) !== -1) return true; }
              return false;
            }

            function isOwnPage() {
              // 公网大模型网页一律按外部网页处理，绝不锁定、绝不注入任何 DSH 布局补丁
              if (isPublicWebHost()) return false;
              // DSH 单页应用固定挂载在 #root 上；自建仪表盘（9009 等）与外部网页没有 #root
              return !!document.getElementById('root');
            }

            function put(id, css) {
              var head = document.head || document.documentElement;
              if (!head) return;
              var el = document.getElementById(id);
              if (!el) {
                el = document.createElement('style');
                el.id = id;
                el.textContent = css;
                head.appendChild(el);
              } else if (document.head && el.parentNode !== document.head) {
                document.head.appendChild(el);
              }
            }

            function apply() {
              var own = isOwnPage();
              var drop = document.getElementById(own ? UNLOCK_ID : LOCK_ID);
              if (drop && drop.parentNode) drop.parentNode.removeChild(drop);
              if (own) { put(LOCK_ID, LOCK_CSS); } else { put(UNLOCK_ID, UNLOCK_CSS); }
              return own;
            }

            // 加载期底色统一：DSH 首屏在 React 挂载前是「无样式白底」，
            // 暗黑模式下极为刺眼。这里在挂载前按系统深浅色铺 html/body 底色，
            // 一旦 #root 真正挂载就立刻撤掉覆盖，完全交还给 DSH 自己的主题样式。
            function paintPageBackground() {
              var html = document.documentElement;
              var body = document.body;
              if (!html) return;
              var rootEl = document.getElementById('root');
              var mounted = !!(rootEl && rootEl.children && rootEl.children.length > 0);
              if (mounted) {
                try { html.style.removeProperty('background-color'); } catch (e0) {}
                if (body) { try { body.style.removeProperty('background-color'); } catch (e1) {} }
                return true;
              }
              var dark = false;
              try {
                dark = !!(body && body.hasAttribute && body.hasAttribute('data-ds-dark-theme'));
              } catch (e2) { dark = false; }
              if (!dark) {
                try { dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e3) {}
              }
              var color = dark ? '#151517' : '#ffffff';
              try { html.style.setProperty('background-color', color, 'important'); } catch (e4) {}
              if (body) { try { body.style.setProperty('background-color', color, 'important'); } catch (e5) {} }
              return false;
            }

            function watchTheme() {
              var ticks = 0;
              (function loop() {
                var done = paintPageBackground();
                if (done) return;                 // 已挂载：撤掉覆盖，停止轮询
                if (++ticks > 480) return;        // 最长 4 分钟，之后交给页面自身
                setTimeout(loop, 500);
              })();
            }

            function tick() {
              if (decided) return;
              if (!document.documentElement) { setTimeout(tick, 20); return; }
              if (apply()) { decided = true; watchTheme(); return; }
              // 普通网页 / 仪表盘：已立刻解锁原生滚动；3 秒内若确认是 DSH 页面则自动切换为锁定态。
              if (++tries > 120) { decided = true; return; }
              setTimeout(tick, 25);
            }
            tick();
          })();

          // 修复 iOS 移动端输入框与搜索框自动聚焦导致键盘弹窗问题：
          // 1. 切换会话时，Lexical 编辑器会自动调用 focusDraftEditor，导致切换会话直接弹出虚拟键盘；
          // 2. 模型快捷选择面板打开时，搜索框会自动 focus，导致软键盘遮挡弹层并引发 blur 误关；
          // 3. 点击会话框 + 号展开命令/文件弹窗时，禁止自动聚焦输入框弹出虚拟键盘；并为命令菜单右上角添加快捷 ✕ 关闭按钮；
          // 4. 保护移动端文本光标与选择自由：严禁在用户点击、滑动或打字时强行重置 Selection，
          //    让用户可以在输入框内任意滑动光标、选择文字、移动插入点！
          (function fixMobileInputAndSearchFocus() {
            var origFocus = HTMLElement.prototype.focus;
            var allowUserTouchFocus = false;
            var touchResetTimer = null;

            function handleUserTouch(e) {
              var target = e.target;
              if (!target) return;

              // 如果用户点击的是 + 号按钮、命令弹窗菜单内部、或者模型快捷选择按钮/菜单，严禁唤起虚拟键盘
              if (target.closest('.uWtHQG_add') || target.closest('[data-trigger-menu]') || target.closest('.bqwvaa_menu') || target.closest('.VYXhfG_trigger') || target.closest('.VYXhfG_root')) {
                // 特殊：只有真正直接点在模型搜索框 input 本身上才允许键盘，点外层/触发按钮绝对不准唤醒输入框
                if (!target.classList.contains('VYXhfG_search') && target.getAttribute('role') !== 'searchbox') {
                  allowUserTouchFocus = false;
                  return;
                }
              }

              var inputEl = target.closest('.uWtHQG_input') ||
                            target.closest('[contenteditable="true"]') ||
                            target.closest('textarea') ||
                            target.closest('.VYXhfG_search') ||
                            target.closest('input[role="searchbox"]') ||
                            target.closest('input:not([type="button"]):not([type="submit"]):not([type="radio"]):not([type="checkbox"])');

              // 如果正在显示模型选择菜单，严禁将附近的会话输入框误判为触碰目标！
              if (document.querySelector('.VYXhfG_menu')) {
                if (!target.classList.contains('VYXhfG_search') && target.getAttribute('role') !== 'searchbox') {
                  allowUserTouchFocus = false;
                  return;
                }
              }

              // v1.0.86：豆包验证码是点外层格子，再由页面自己调用 focus()。
              // 点的位置附近有输入框，也算用户主动要输入，放行随后的聚焦，键盘才能弹。
              if (!inputEl && e.touches && e.touches.length && !document.querySelector('.VYXhfG_menu')) {
                var touch = e.touches[0];
                var near = document.elementsFromPoint(touch.clientX, touch.clientY) || [];
                for (var k = 0; k < near.length && k < 8; k++) {
                  var node = near[k];
                  if (!node || !node.querySelector) continue;
                  if (node.matches && node.matches('input, textarea, [contenteditable="true"]')) { inputEl = node; break; }
                  var inner = node.querySelector('input:not([type="button"]):not([type="submit"]):not([type="radio"]):not([type="checkbox"]), textarea, [contenteditable="true"]');
                  if (inner) {
                    var r = inner.getBoundingClientRect();
                    if (Math.abs(r.top + r.height / 2 - touch.clientY) < 80) { inputEl = inner; break; }
                  }
                }
              }

              if (inputEl) {
                allowUserTouchFocus = true;
                clearTimeout(touchResetTimer);
                touchResetTimer = setTimeout(function() {
                  allowUserTouchFocus = false;
                }, 1500);
              }
            }

            // 监听用户真人的手指触摸与点击
            document.addEventListener('touchstart', handleUserTouch, true);
            document.addEventListener('touchend', handleUserTouch, true);
            document.addEventListener('click', handleUserTouch, true);

            // 拦截一切未经用户主动点击文本区域的自动化 .focus() 调用
            HTMLElement.prototype.focus = function(options) {
              var isSearchBox = this && (
                (this.classList && this.classList.contains('VYXhfG_search')) ||
                this.getAttribute('role') === 'searchbox' ||
                this.closest('.VYXhfG_menu') ||
                this.closest('.VYXhfG_root')
              );
              if (isSearchBox) {
                // 模型选择弹窗内部的搜索框绝对禁止程序自动调用 focus() 弹起软键盘！
                // 只有当用户用手指真切点击该搜索框时，才由原生 click 事件自然唤起输入。
                if (!allowUserTouchFocus) {
                  return;
                }
              }

              var isTextInput = this && (
                (this.classList && (this.classList.contains('uWtHQG_input') || this.classList.contains('VYXhfG_search'))) ||
                this.getAttribute('role') === 'searchbox' ||
                this.getAttribute('contenteditable') === 'true' ||
                this.isContentEditable ||
                this.tagName === 'TEXTAREA' ||
                (this.tagName === 'INPUT' && !['button', 'submit', 'checkbox', 'radio', 'range', 'file'].includes(this.type))
              );

              if (isTextInput) {
                if (!allowUserTouchFocus) {
                  // 严禁脚本自动化弹起虚拟键盘（尤其是切换会话、打开模型菜单、点击+号展开选项时）
                  return;
                }
              }
              return origFocus.apply(this, arguments);
            };

            // 全局关闭命令/选项弹窗辅助函数
            window.__dshDismissCommandMenu = function() {
              if (document.activeElement && document.activeElement.blur) {
                document.activeElement.blur();
              }
              var menu = document.querySelector('.bqwvaa_menu, [data-trigger-menu]');
              if (menu) {
                var fiberKey = Object.keys(menu).find(function(k) { return k.startsWith('__reactFiber$'); });
                var fiber = fiberKey ? menu[fiberKey] : null;
                while (fiber) {
                  if (fiber.memoizedProps && typeof fiber.memoizedProps.onDismiss === 'function') {
                    fiber.memoizedProps.onDismiss();
                    return true;
                  }
                  fiber = fiber.return;
                }
              }
              return false;
            };

            // 自动为弹出命令/选项菜单以及模型快捷选择面板右上角挂载明显的 ✕ 关闭按钮
            setInterval(function() {
              var menu = document.querySelector('.bqwvaa_menu, [data-trigger-menu]');
              if (menu && !menu.querySelector('.dsh-mobile-menu-close-btn')) {
                var closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'dsh-mobile-menu-close-btn';
                closeBtn.setAttribute('aria-label', '关闭选项菜单');
                closeBtn.innerHTML = '✕';
                closeBtn.style.cssText = 'position:absolute; top:8px; right:8px; z-index:120; width:26px; height:26px; border-radius:50%; background:rgba(120,120,128,0.2); border:none; display:inline-flex; align-items:center; justify-content:center; font-size:13px; font-weight:600; color:var(--dsw-alias-label-secondary, #666); cursor:pointer; padding:0;';

                function handleCloseClick(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  window.__dshDismissCommandMenu();
                }
                closeBtn.addEventListener('click', handleCloseClick, true);
                closeBtn.addEventListener('touchend', handleCloseClick, true);
                menu.appendChild(closeBtn);
              }

              // 为模型快捷选择弹窗 (.VYXhfG_menu) 也挂载顶部显式关闭按钮
              var modelMenu = document.querySelector('.VYXhfG_menu');
              if (modelMenu && !modelMenu.querySelector('.dsh-mobile-model-close-btn')) {
                var modelCloseBtn = document.createElement('button');
                modelCloseBtn.type = 'button';
                modelCloseBtn.className = 'dsh-mobile-model-close-btn';
                modelCloseBtn.setAttribute('aria-label', '关闭模型选择');
                modelCloseBtn.innerHTML = '✕';
                modelCloseBtn.style.cssText = 'position:absolute; top:10px; right:12px; z-index:9999; width:28px; height:28px; border-radius:50%; background:rgba(120,120,128,0.25); border:none; display:inline-flex; align-items:center; justify-content:center; font-size:14px; font-weight:600; color:var(--dsw-alias-label-secondary, #888); cursor:pointer; padding:0; -webkit-tap-highlight-color:transparent;';

                function handleModelClose(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  var trigger = document.querySelector('.VYXhfG_trigger');
                  if (trigger) {
                    trigger.click();
                  } else {
                    modelMenu.remove();
                  }
                }
                modelCloseBtn.addEventListener('click', handleModelClose, true);
                modelCloseBtn.addEventListener('touchend', handleModelClose, true);
                modelMenu.appendChild(modelCloseBtn);
              }
            }, 150);

            // 监听 blur 事件捕获阶段：当搜索框失去焦点（比如用户轻触关闭软键盘、完成输入）时，
            // 阻止该 blur 冒泡，避免 React 的 ModelSelect 组件触发 onBlur -> close() 将整个面板关闭！
            window.addEventListener('blur', function(e) {
              if (e.target && (
                (e.target.classList && e.target.classList.contains('VYXhfG_search')) ||
                e.target.getAttribute('role') === 'searchbox' ||
                (e.target.closest && e.target.closest('.VYXhfG_menu'))
              )) {
                e.stopImmediatePropagation();
              }
            }, true);

            // 同时监听 focusout 事件：键盘收起时 target.blur() 会派发 focusout，
            // 拦截它使其不冒泡到 document / window，确保模型选择面板稳固留在屏幕上！
            document.addEventListener('focusout', function(e) {
              var target = e.target;
              if (target && (
                (target.classList && target.classList.contains('VYXhfG_search')) ||
                target.getAttribute('role') === 'searchbox' ||
                (target.closest && target.closest('.VYXhfG_menu'))
              )) {
                var menu = target.closest('.VYXhfG_menu') || document.querySelector('.VYXhfG_menu');
                if (menu) {
                  e.stopImmediatePropagation();
                }
              }
            }, true);
          })();

          // 全局禁止双击网页意外缩放（保留图片预览灯箱内的正常缩放）
          (function setupDisableDoubleTapZoom() {
            var lastTouchEnd = 0;
            document.addEventListener('touchend', function(event) {
              var now = Date.now();
              if (now - lastTouchEnd <= 300) {
                // 如果在图片灯箱或预览区域内，允许双击缩放图片
                var inImageLightbox = event.target && event.target.closest && (
                  event.target.closest('[role="dialog"][aria-modal="true"]') ||
                  event.target.closest('[data-image-preview]') ||
                  event.target.closest('[data-document-zoom-surface]')
                );
                if (!inImageLightbox) {
                  event.preventDefault();
                }
              }
              lastTouchEnd = now;
            }, { passive: false });
          })();

          // 移动端图片预览支持双指无极放大缩小、单指平移拖拽与双击缩放重置
          (function setupMobileImagePinchZoom() {
            function bindImageZoom(imgEl, containerEl) {
              if (!imgEl || imgEl.dataset.dshPinchBound === '1') return;
              imgEl.dataset.dshPinchBound = '1';

              var scale = 1;
              var minScale = 1;
              var maxScale = 6;
              var tx = 0;
              var ty = 0;

              var startDist = 0;
              var startScale = 1;
              var startMidX = 0;
              var startMidY = 0;
              var startTx = 0;
              var startTy = 0;

              var isPanning = false;
              var panStartX = 0;
              var panStartY = 0;
              var lastTapTime = 0;

              imgEl.style.touchAction = 'none';
              imgEl.style.userSelect = 'none';
              imgEl.style.webkitUserSelect = 'none';
              imgEl.style.transformOrigin = 'center center';
              imgEl.style.willChange = 'transform';
              if (containerEl) {
                containerEl.style.touchAction = 'none';
                containerEl.style.overflow = 'hidden';
              }

              function applyTransform(animated) {
                imgEl.style.transition = animated ? 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
                if (scale <= 1.01) {
                  scale = 1;
                  tx = 0;
                  ty = 0;
                }
                imgEl.style.transform = 'translate3d(' + tx.toFixed(1) + 'px, ' + ty.toFixed(1) + 'px, 0) scale(' + scale.toFixed(3) + ')';
              }

              function getDistance(t1, t2) {
                var dx = t2.clientX - t1.clientX;
                var dy = t2.clientY - t1.clientY;
                return Math.sqrt(dx * dx + dy * dy);
              }

              var target = containerEl || imgEl;

              target.addEventListener('touchstart', function(e) {
                if (e.target && e.target.closest('button')) return;
                if (e.touches.length === 2) {
                  e.preventDefault();
                  e.stopPropagation();
                  isPanning = false;
                  startDist = getDistance(e.touches[0], e.touches[1]);
                  startScale = scale;
                  startMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                  startMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                  startTx = tx;
                  startTy = ty;
                } else if (e.touches.length === 1) {
                  var now = Date.now();
                  if (now - lastTapTime < 280) {
                    // 双击快速切换 1x <-> 2.5x 缩放
                    e.preventDefault();
                    e.stopPropagation();
                    if (scale > 1.05) {
                      scale = 1;
                      tx = 0;
                      ty = 0;
                    } else {
                      scale = 2.5;
                      tx = 0;
                      ty = 0;
                    }
                    applyTransform(true);
                    lastTapTime = 0;
                    return;
                  }
                  lastTapTime = now;

                  if (scale > 1.01) {
                    e.preventDefault();
                    e.stopPropagation();
                    isPanning = true;
                    panStartX = e.touches[0].clientX;
                    panStartY = e.touches[0].clientY;
                    startTx = tx;
                    startTy = ty;
                  }
                }
              }, { passive: false });

              target.addEventListener('touchmove', function(e) {
                if (e.touches.length === 2 && startDist > 0) {
                  e.preventDefault();
                  e.stopPropagation();
                  var dist = getDistance(e.touches[0], e.touches[1]);
                  var newScale = startScale * (dist / startDist);
                  if (newScale < 0.7) newScale = 0.7;
                  if (newScale > maxScale) newScale = maxScale;
                  scale = newScale;

                  var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                  var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                  tx = startTx + (midX - startMidX);
                  ty = startTy + (midY - startMidY);
                  applyTransform(false);
                } else if (e.touches.length === 1 && isPanning && scale > 1.01) {
                  e.preventDefault();
                  e.stopPropagation();
                  tx = startTx + (e.touches[0].clientX - panStartX);
                  ty = startTy + (e.touches[0].clientY - panStartY);
                  applyTransform(false);
                }
              }, { passive: false });

              target.addEventListener('touchend', function(e) {
                if (e.touches.length === 0) {
                  isPanning = false;
                  startDist = 0;
                  if (scale < minScale) {
                    scale = 1;
                    tx = 0;
                    ty = 0;
                    applyTransform(true);
                  }
                } else if (e.touches.length === 1) {
                  startDist = 0;
                  if (scale > 1.01) {
                    isPanning = true;
                    panStartX = e.touches[0].clientX;
                    panStartY = e.touches[0].clientY;
                    startTx = tx;
                    startTy = ty;
                  }
                }
              }, { passive: false });
            }

            setInterval(function() {
              // 1. 对话流点击图片弹出的全屏 ImageLightbox (role="dialog" + img)
              var dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
              dialogs.forEach(function(dlg) {
                var img = dlg.querySelector('img');
                if (img && dlg.children.length <= 4) {
                  bindImageZoom(img, dlg);
                }
              });
              // 2. 右侧栏文件图片预览区的原图
              var docImgs = document.querySelectorAll('[data-image-preview] img, [data-document-zoom-surface] img');
              docImgs.forEach(function(img) {
                var container = img.closest('[data-image-preview]') || img.parentElement;
                bindImageZoom(img, container);
              });
            }, 250);
          })();

          // 移动端会话输入框原生语音输入按钮注入与文本流式输入处理
          (function setupMobileVoiceInputBridge() {
            function updateVoiceButtonState(active) {
              var btn = document.querySelector('.dsh-mobile-voice-btn');
              if (!btn) return;
              if (active) {
                btn.classList.add('recording');
                btn.setAttribute('title', '正在录音...再次点击停止');
              } else {
                btn.classList.remove('recording');
                btn.setAttribute('title', '点击进行语音输入');
              }
            }

            window.__dshVoiceStateUpdate = function(active, text) {
              updateVoiceButtonState(active);
              if (text && text.length > 0) {
                var inputEl = document.querySelector('.uWtHQG_input') ||
                              document.querySelector('[contenteditable="true"]') ||
                              document.querySelector('textarea');
                if (inputEl) {
                  inputEl.focus();
                  if (inputEl.isContentEditable || inputEl.getAttribute('contenteditable') === 'true') {
                    document.execCommand('insertText', false, text);
                  } else {
                    var start = inputEl.selectionStart || inputEl.value.length;
                    var end = inputEl.selectionEnd || inputEl.value.length;
                    var val = inputEl.value || '';
                    inputEl.value = val.substring(0, start) + text + val.substring(end);
                    inputEl.selectionStart = inputEl.selectionEnd = start + text.length;
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }
              }
            };

            function ensureVoiceButton() {
              var tools = document.querySelector('.uWtHQG_tools');
              if (!tools) return;
              if (tools.querySelector('.dsh-mobile-voice-btn')) return;

              var voiceBtn = document.createElement('button');
              voiceBtn.type = 'button';
              voiceBtn.className = 'dsh-mobile-voice-btn';
              voiceBtn.setAttribute('title', '点击进行语音输入');
              voiceBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>';

              voiceBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.dshVoiceInput) {
                  window.webkit.messageHandlers.dshVoiceInput.postMessage({ action: 'toggle' });
                }
              });

              var addBtn = tools.querySelector('.uWtHQG_add');
              if (addBtn && addBtn.nextSibling) {
                tools.insertBefore(voiceBtn, addBtn.nextSibling);
              } else {
                tools.appendChild(voiceBtn);
              }
            }

            setInterval(ensureVoiceButton, 600);
          })();

          // 移动端右侧边栏智能关闭辅助（遮罩与退出逻辑）
          (function setupMobileSidebarRightWatcher() {
              var backdrop = document.createElement('div');
              backdrop.className = 'dsh-mobile-sidebar-backdrop';
              // documentStart 时 body 可能尚未创建（null → TypeError 会连带杀死后续全部功能），
              // 改为等待 body 就绪后再挂载（v1.0.70 修复）
              function attachBackdrop() {
                if (!document.body) { setTimeout(attachBackdrop, 16); return; }
                document.body.appendChild(backdrop);
              }
              attachBackdrop();

            function toggleBackdrop(open) {
              if (open) {
                backdrop.classList.add('active');
              } else {
                backdrop.classList.remove('active');
              }
            }

            backdrop.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              // 触发侧边栏折叠按钮
              var toggle = document.querySelector('[data-sidebar-right-toggle]') || document.querySelector('.dMHGga_iconButton');
              if (toggle) {
                toggle.click();
              } else {
                // 模拟按下 Escape
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
              }
            });

            // 移动端全级别菜单、弹窗与插件浮层自适应贴边、高对比度与防溢出看门狗
            (function installMobileLayoutWatchdog() {
              if (window.__dshMobileLayoutWatchdog) return;
              window.__dshMobileLayoutWatchdog = true;

              var PADDING = 10;

              function adjustElement(el) {
                if (!el || !(el instanceof HTMLElement)) return;
                if (el.offsetParent === null && el.style.display === 'none') return;

                var winW = window.innerWidth;
                var winH = window.innerHeight;
                if (winW > 768) return;

                // 0. 🔴 v1.0.112：完全在屏幕外的元素一律不碰（关闭态的抽屉 / 弹层会故意停在屏外）。
                //    老逻辑只判「rect.left < PADDING 就硬写 left:10px」，不看元素是不是故意停在屏外，
                //    会把停在外面的弹层直接拽进屏幕（实证：left:-300px → x=10；top:1000px → 被强制居中）。
                //    判定用「与视口零重叠」= 整个盒子都在视口外（贴边 0px 也算屏外，因为它本来就看不见）；
                //    只要还有 1px 露在屏里就照旧处理，所以「越界浮层回收」的既有行为零变化。
                var pre = el.getBoundingClientRect();
                if (pre.right <= 0 || pre.left >= winW || pre.bottom <= 0 || pre.top >= winH) return;

                // 1. 宽度与高度安全限制与多级插件通用规范
                el.style.maxWidth = (winW - PADDING * 2) + 'px';
                el.style.boxSizing = 'border-box';
                el.style.maxHeight = (winH - PADDING * 2) + 'px';
                el.style.overflowY = 'auto';
                el.style.webkitOverflowScrolling = 'touch';

                // 2. 保证通用透明度规范：高对比度不透明背景（杜绝任何插件透明度过高导致文字穿透重叠）
                var isDark = document.body && document.body.hasAttribute('data-ds-dark-theme');
                if (!el.style.backgroundColor || el.style.backgroundColor === 'transparent' || el.style.backgroundColor.indexOf('rgba') !== -1) {
                  el.style.setProperty('background-color', isDark ? 'rgba(22, 24, 29, 0.98)' : 'rgba(255, 255, 255, 0.98)', 'important');
                  el.style.setProperty('backdrop-filter', 'blur(28px) saturate(180%)', 'important');
                  el.style.setProperty('-webkit-backdrop-filter', 'blur(28px) saturate(180%)', 'important');
                }

                var rect = el.getBoundingClientRect();

                // 3. 水平方向越界自动拉回安全区内
                if (rect.right > winW - PADDING) {
                  var overflowX = rect.right - (winW - PADDING);
                  var currentLeft = parseFloat(el.style.left) || rect.left;
                  var newLeft = Math.max(PADDING, currentLeft - overflowX);
                  el.style.left = newLeft + 'px';
                  el.style.right = 'auto';
                }
                if (rect.left < PADDING) {
                  el.style.left = PADDING + 'px';
                  el.style.right = 'auto';
                }

                // 4. v1.0.86：弹层垂直居中。之前把超出底部的弹层往上推、再把顶部锁死在 54px，
                //    验证码这类弹层的输入框被顶出屏幕，既不居中也点不到，键盘弹不出来。
                //    改为：比屏幕高的限制高度放进安全区，其余的居中。不再改写 top 把内容推出屏幕。
                var TOP_SAFE = Math.max(54, PADDING);
                var usable = winH - TOP_SAFE - PADDING;
                if (rect.height > usable) {
                  el.style.maxHeight = usable + 'px';
                  el.style.top = TOP_SAFE + 'px';
                  el.style.bottom = 'auto';
                } else if (rect.top < TOP_SAFE || rect.bottom > winH - PADDING) {
                  var centered = Math.max(TOP_SAFE, Math.round((winH - rect.height) / 2));
                  el.style.top = centered + 'px';
                  el.style.bottom = 'auto';
                }
              }

              var TARGET_SELECTOR = [
                '[role="menu"]',
                '[role="listbox"]',
                '[role="dialog"]',
                '[data-menu-material]',
                '[data-menu-surface]',
                '.VYXhfG_menu',
                '[class*="menu"]',
                '[class*="modal"]',
                '[class*="Modal"]',
                '[class*="popup"]',
                '[class*="Popup"]',
                '[class*="dropdown"]',
                '[class*="Dropdown"]',
                '[class*="dialog"]',
                '[class*="Dialog"]',
                '[class*="_portal_"] > div',
                '.dsh-po-modal-container'
              ].join(',');

              function scanAndAdjust() {
                if (window.innerWidth > 768) return;
                var candidates = document.querySelectorAll(TARGET_SELECTOR);
                for (var i = 0; i < candidates.length; i++) {
                  var node = candidates[i];
                  var style = window.getComputedStyle(node);
                  if (style.position === 'absolute' || style.position === 'fixed') {
                    adjustElement(node);
                  }
                }
              }

              var debounceTimer = null;
              function scheduleAdjust() {
                if (window.innerWidth > 768) return;
                if (debounceTimer) return;
                debounceTimer = setTimeout(function() {
                  debounceTimer = null;
                  scanAndAdjust();
                }, 100);
              }

              var observer = new MutationObserver(function() {
                scheduleAdjust();
              });
              // documentStart 时 document.body 可能尚未创建，等待就绪后再观察（v1.0.70 修复）
              function observeBodyForWatchdog() {
                if (!document.body) { setTimeout(observeBodyForWatchdog, 16); return; }
                observer.observe(document.body, { childList: true, subtree: true });
              }
              observeBodyForWatchdog();

              window.addEventListener('resize', scheduleAdjust, { passive: true });
              window.addEventListener('scroll', scheduleAdjust, { passive: true, capture: true });
            })();

            // 移动端聊天输入框回车/换行行为深度优化：
            // 解决 iOS 软键盘在聊天输入框长按或轻点“确定/换行”无法正常换行的问题。
            // 移动端交互铁律：手机软键盘上的 Return/换行键 专职负责文本插入换行；右侧独立的圆形蓝色发送按钮负责提交发送。
            (function setupMobileEnterKeyNewline() {
              window.addEventListener('keydown', function(e) {
                var target = e.target;
                if (!target) return;
                var input = target.closest ? target.closest('.uWtHQG_input') : null;
                if (input) {
                  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
                    // 将纯 Enter 事件无缝转换为 Shift+Enter 语义，通知 Lexical 编辑器执行段落换行而非发送提交！
                    try {
                      Object.defineProperty(e, 'shiftKey', { get: function() { return true; } });
                    } catch (err) {}
                  }
                }
              }, true);

              // 自动为输入框设置 enterkeyhint="enter"，指示 iOS 虚拟键盘直接呈现标准的“换行”按键
              function setInputEnterKeyHint() {
                var inputs = document.querySelectorAll('.uWtHQG_input, [contenteditable="true"]');
                inputs.forEach(function(el) {
                  if (el.getAttribute('enterkeyhint') !== 'enter') {
                    el.setAttribute('enterkeyhint', 'enter');
                  }
                });
              }
              setInputEnterKeyHint();
              setInterval(setInputEnterKeyHint, 500);
            })();

            // 关闭右侧面板函数
            window.__dshCloseRightPanel = function() {
              var toggle = document.querySelector('[data-sidebar-right-toggle]') || document.querySelector('button[aria-label="收起右侧边栏"]');
              if (toggle) {
                toggle.click();
                return;
              }
              var closeTab = document.querySelector('[data-dockkit-strip] [aria-label*="关闭"]') || document.querySelector('[data-dockkit-strip] button[aria-label="关闭"]');
              if (closeTab) {
                closeTab.click();
              }
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            };

            // 监听 DOM 树中的 data-sidebar-right-open 变化
            function syncPanelNav() {
              var panel = document.querySelector('.dMHGga_panel');
              var isOpen = panel && panel.hasAttribute('data-sidebar-right-open');
              toggleBackdrop(!!isOpen);

              if (panel && isOpen) {
                // v1.0.78：不再注入「返回对话」蓝按钮和右上角「✕」。
                // 面板自带的返回和关闭已经够用，这两颗是重复的，用户反馈画蛇添足。
                // 旧版本注入过的，这里顺手清掉。
                var stale = panel.querySelectorAll('.dsh-mobile-panel-nav, .dsh-mobile-back-to-chat-btn, .dsh-mobile-panel-close-btn');
                for (var si = 0; si < stale.length; si++) {
                  if (stale[si].parentNode) stale[si].parentNode.removeChild(stale[si]);
                }

                // 优化文件不可预览页面的操作按钮（将手机端无感的“电脑打开”改造为手机“保存/分享”+明确标注电脑端）
                var emptyContainer = panel.querySelector('[data-textpreview-unsupported]');
                if (emptyContainer) {
                  var mobileSaveBtn = emptyContainer.querySelector('.dsh-mobile-save-file-btn');
                  if (!mobileSaveBtn) {
                    var pathEl = panel.querySelector('[data-textpreview-path]');
                    var fullPath = pathEl ? (pathEl.getAttribute('title') || pathEl.textContent || '') : '';
                    
                    mobileSaveBtn = document.createElement('button');
                    mobileSaveBtn.className = 'dsh-mobile-save-file-btn';
                    mobileSaveBtn.setAttribute('type', 'button');
                    mobileSaveBtn.innerHTML = '📥 保存 / 分享到手机';
                    mobileSaveBtn.addEventListener('click', function(e) {
                      e.preventDefault();
                      e.stopPropagation();
                      if (fullPath && window.__dshFetchAndShareFile) {
                        window.__dshFetchAndShareFile(fullPath);
                      } else {
                        // 触发通用文件传输
                        var down = document.querySelector('.dsh-mobile-download-btn');
                        if (down) down.click();
                      }
                    });

                    // 插入到 slot 容器前面，作为最醒目的主按钮
                    var slot = emptyContainer.querySelector('[data-slot*="unpreviewable"]');
                    if (slot) {
                      emptyContainer.insertBefore(mobileSaveBtn, slot);
                    } else {
                      emptyContainer.appendChild(mobileSaveBtn);
                    }
                  }

                  // 给原有的电脑端打开按钮增加明确的提示
                  var pcBtn = emptyContainer.querySelector('.PPCmka_main');
                  if (pcBtn && !pcBtn.dataset.dshPcAnnotated) {
                    pcBtn.dataset.dshPcAnnotated = 'true';
                    pcBtn.innerHTML = '🖥️ 在电脑端打开';
                    pcBtn.addEventListener('click', function() {
                      // 轻提示
                      if (window.__dshToast) window.__dshToast('已通知电脑端打开该文件');
                    }, true);
                  }
                }
              }
            }

            var obs = new MutationObserver(syncPanelNav);
            // document.body 此刻可能尚未创建，同样需要等待就绪（v1.0.70 修复）
            function observeBody() {
              if (!document.body) { setTimeout(observeBody, 16); return; }
              obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-sidebar-right-open', 'data-sidebar-right-panel'] });
            }
            observeBody();
            setInterval(syncPanelNav, 300);
          })();
        })();