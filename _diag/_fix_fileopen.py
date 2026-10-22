import sys

P = 'E:/desktop/所有skill/deepseek-harness-ios/DSHios/ViewController.swift'
data = open(P, 'rb').read()

def rep(old, new, tag):
    global data
    c = data.count(old)
    print(tag, 'count:', c)
    if c != 1:
        print('ABORT at', tag); sys.exit(1)
    data = data.replace(old, new, 1)

# ---- A) 新增 resolveCurrentPreviewPath + enrichPreviewHeader 文本锚兜底 ----
OLD_A = (b"          // \xe5\x8a\xa8\xe6\x80\x81\xe6\xb3\xa8\xe5\x85\xa5 2\xef\xbc\x9a\xe5\x9c\xa8\xe4\xb8\x8d\xe5\x8f\xaf\xe9\xa2\x84\xe8\xa7\x88\xe6\x96\x87\xe4\xbb\xb6\xe9\xa1\xb5\xe9\x9d\xa2\xef\xbc\x88\xe5\xa6\x82 tipa/zip/exe/ipa\xef\xbc\x89\xe6\xb3\xa8\xe5\x85\xa5\xe9\x86\x92\xe7\x9b\xae\xe7\x9a\x84\xe3\x80\x90\xf0\x9f\x93\xa5 \xe4\xbf\x9d\xe5\xad\x98 / \xe5\x88\x86\xe4\xba\xab\xe5\x88\xb0\xe6\x89\x8b\xe6\x9c\xba\xe3\x80\x91\xe6\x8c\x89\xe9\x92\xae\r\n"
         b"          function enrichPreviewHeader() {\r\n"
         b"            var emptyContainer = document.querySelector('[data-textpreview-unsupported], [class*=\"unsupportedPreview\"], [class*=\"unpreviewable\"]');\r\n"
         b"            if (emptyContainer && !emptyContainer.querySelector('.dsh-mobile-save-file-btn')) {\r\n"
         b"              var pathEl = document.querySelector('[data-textpreview-path], [class*=\"previewPath\"]');\r\n"
         b"              var fullPath = pathEl ? (pathEl.getAttribute('title') || pathEl.textContent || '') : '';\r\n"
         b"              if (!fullPath) {\r\n"
         b"                var titleTab = document.querySelector('[data-dockkit-strip] [aria-selected=\"true\"], [data-dockkit-strip] [class*=\"active\"]');\r\n"
         b"                fullPath = titleTab ? (titleTab.getAttribute('title') || titleTab.textContent || '') : '';\r\n"
         b"              }\r\n")

NEW_A = (b"          // \xf0\x9f\x94\xb4 build 84\xef\xbc\x9a\xe8\xa7\xa3\xe6\x9e\x90\xe5\xbd\x93\xe5\x89\x8d\xe9\xa2\x84\xe8\xa7\x88\xe6\x96\x87\xe4\xbb\xb6\xe7\x9a\x84\xe5\xae\x8c\xe6\x95\xb4\xe8\xb7\xaf\xe5\xbe\x84\xef\xbc\x88\xe4\xb8\x89\xe7\xb1\xbb\xe6\x9d\xa5\xe6\xba\x90\xef\xbc\x8c\xe4\xbe\x9b\xe3\x80\x8c\xe6\x89\x93\xe5\xbc\x80\xe3\x80\x8d\xe6\x94\xb9\xe9\x81\x93\xe5\x88\x86\xe4\xba\xab\xe4\xb8\x8e\xe4\xbf\x9d\xe5\xad\x98\xe6\x8c\x89\xe9\x92\xae\xe5\x85\xb1\xe7\x94\xa8\xef\xbc\x89\r\n"
         b"          function resolveCurrentPreviewPath() {\r\n"
         b"            var pathEl = document.querySelector('[data-textpreview-path], [class*=\"previewPath\"]');\r\n"
         b"            var p = pathEl ? (pathEl.getAttribute('title') || pathEl.textContent || '') : '';\r\n"
         b"            if (p && /[\\\\\\\\/]/.test(p)) { return p.trim(); }\r\n"
         b"            var titleTab = document.querySelector('[data-dockkit-strip] [aria-selected=\"true\"], [data-dockkit-strip] [class*=\"active\"]');\r\n"
         b"            p = titleTab ? (titleTab.getAttribute('title') || titleTab.textContent || '') : '';\r\n"
         b"            if (p && /[\\\\\\\\/]/.test(p)) { return p.trim(); }\r\n"
         b"            var els = document.querySelectorAll('div, span');\r\n"
         b"            for (var i = 0; i < els.length && i < 3000; i++) {\r\n"
         b"              if (els[i].children.length !== 0) { continue; }\r\n"
         b"              var t = (els[i].textContent || '').trim();\r\n"
         b"              if (t.length > 5 && t.length < 300 && /^[A-Za-z]:[\\\\\\\\/]/.test(t)) { return t; }\r\n"
         b"            }\r\n"
         b"            return '';\r\n"
         b"          }\r\n"
         b"          // \xe5\x8a\xa8\xe6\x80\x81\xe6\xb3\xa8\xe5\x85\xa5 2\xef\xbc\x9a\xe5\x9c\xa8\xe4\xb8\x8d\xe5\x8f\xaf\xe9\xa2\x84\xe8\xa7\x88\xe6\x96\x87\xe4\xbb\xb6\xe9\xa1\xb5\xe9\x9d\xa2\xef\xbc\x88\xe5\xa6\x82 tipa/zip/exe/ipa\xef\xbc\x89\xe6\xb3\xa8\xe5\x85\xa5\xe9\x86\x92\xe7\x9b\xae\xe7\x9a\x84\xe3\x80\x90\xf0\x9f\x93\xa5 \xe4\xbf\x9d\xe5\xad\x98 / \xe5\x88\x86\xe4\xba\xab\xe5\x88\xb0\xe6\x89\x8b\xe6\x9c\xba\xe3\x80\x91\xe6\x8c\x89\xe9\x92\xae\r\n"
         b"          function enrichPreviewHeader() {\r\n"
         b"            var emptyContainer = document.querySelector('[data-textpreview-unsupported], [class*=\"unsupportedPreview\"], [class*=\"unpreviewable\"]');\r\n"
         b"            // \xf0\x9f\x94\xb4 build 84\xef\xbc\x9aDSH \xe6\x8d\xa2\xe7\x89\x88\xe5\x90\x8e\xe4\xb8\x8a\xe8\xbf\xb0\xe7\xb1\xbb\xe5\x90\x8d/\xe5\xb1\x9e\xe6\x80\xa7\xe5\xb8\xb8\xe5\xa4\xb1\xe6\x95\x88\xef\xbc\x88\xe5\x93\x88\xe5\xb8\x8c\xe7\xb1\xbb\xef\xbc\x89\xef\xbc\x8c\r\n"
         b"            //    \xe8\xa1\xa5\xe3\x80\x8c\xe8\xaf\xa5\xe6\xa0\xbc\xe5\xbc\x8f\xe6\x96\x87\xe4\xbb\xb6\xe6\x9a\x82\xe6\x97\xa0\xe6\xb3\x95\xe9\xa2\x84\xe8\xa7\x88\xe3\x80\x8d\xe6\x96\x87\xe6\x9c\xac\xe9\x94\x9a\xe5\x85\x9c\xe5\xba\x95\xef\xbc\x88\xe5\xae\x98\xe6\x96\xb9\xe6\x96\x87\xe6\xa1\x88\xe6\xaf\x94\xe7\xb1\xbb\xe5\x90\x8d\xe7\xa8\xb3\xe5\xae\x9a\xef\xbc\x89\xe3\x80\x82\r\n"
         b"            if (!emptyContainer) {\r\n"
         b"              var els2 = document.querySelectorAll('div, span');\r\n"
         b"              for (var j = 0; j < els2.length && j < 3000; j++) {\r\n"
         b"                if (els2[j].children.length !== 0) { continue; }\r\n"
         b"                var t2 = (els2[j].textContent || '').trim();\r\n"
         b"                if (t2 === '\xe8\xaf\xa5\xe6\xa0\xbc\xe5\xbc\x8f\xe6\x96\x87\xe4\xbb\xb6\xe6\x9a\x82\xe6\x97\xa0\xe6\xb3\x95\xe9\xa2\x84\xe8\xa7\x88') {\r\n"
         b"                  emptyContainer = els2[j].parentElement || els2[j];\r\n"
         b"                  break;\r\n"
         b"                }\r\n"
         b"              }\r\n"
         b"            }\r\n"
         b"            if (emptyContainer && !emptyContainer.querySelector('.dsh-mobile-save-file-btn')) {\r\n"
         b"              var fullPath = resolveCurrentPreviewPath();\r\n")

rep(OLD_A, NEW_A, 'A')

# ---- B) 「打开」按钮改道分享 ----
OLD_B = (b"              var pcSplitBtn = target.closest('.PPCmka_split, .PPCmka_main, .PPCmka_chevron, [data-open-target]');\r\n"
         b"              if (pcSplitBtn) {\r\n"
         b"                // \xe5\xa6\x82\xe6\x9e\x9c\xe8\xbf\x99\xe6\x98\xaf\xe6\x89\x8b\xe6\x9c\xba\xe7\xab\xaf\xe7\x9a\x84\xe2\x80\x9c\xe4\xbf\x9d\xe5\xad\x98/\xe5\x88\x86\xe4\xba\xab\xe2\x80\x9d\xe8\x87\xaa\xe5\xae\x9a\xe4\xb9\x89\xe6\x8c\x89\xe9\x92\xae\xef\xbc\x8c\xe5\x88\x99\xe5\x85\x81\xe8\xae\xb8\xe6\xad\xa3\xe5\xb8\xb8\xe6\x89\xa7\xe8\xa1\x8c\r\n"
         b"                if (target.closest('.dsh-mobile-save-file-btn') || target.closest('.dsh-mobile-share-btn') || target.closest('.dsh-mobile-download-btn')) {\r\n"
         b"                  return;\r\n"
         b"                }\r\n"
         b"                e.preventDefault();\r\n"
         b"                e.stopImmediatePropagation();\r\n"
         b"                showMobileRestrictedAlert('\xe7\x94\xb5\xe8\x84\x91\xe5\xa4\x96\xe9\x83\xa8\xe5\xba\x94\xe7\x94\xa8');\r\n"
         b"                return;\r\n"
         b"              }\r\n")

NEW_B = (b"              var pcSplitBtn = target.closest('.PPCmka_split, .PPCmka_main, .PPCmka_chevron, [data-open-target]');\r\n"
         b"              if (pcSplitBtn) {\r\n"
         b"                // \xe5\xa6\x82\xe6\x9e\x9c\xe8\xbf\x99\xe6\x98\xaf\xe6\x89\x8b\xe6\x9c\xba\xe7\xab\xaf\xe7\x9a\x84\xe2\x80\x9c\xe4\xbf\x9d\xe5\xad\x98/\xe5\x88\x86\xe4\xba\xab\xe2\x80\x9d\xe8\x87\xaa\xe5\xae\x9a\xe4\xb9\x89\xe6\x8c\x89\xe9\x92\xae\xef\xbc\x8c\xe5\x88\x99\xe5\x85\x81\xe8\xae\xb8\xe6\xad\xa3\xe5\xb8\xb8\xe6\x89\xa7\xe8\xa1\x8c\r\n"
         b"                if (target.closest('.dsh-mobile-save-file-btn') || target.closest('.dsh-mobile-share-btn') || target.closest('.dsh-mobile-download-btn')) {\r\n"
         b"                  return;\r\n"
         b"                }\r\n"
         b"                // \xf0\x9f\x94\xb4 build 84\xef\xbc\x9a\xe6\x96\x87\xe4\xbb\xb6\xe9\xa2\x84\xe8\xa7\x88\xe9\xa1\xb5\xe7\x9a\x84\xe3\x80\x8c\xe6\x89\x93\xe5\xbc\x80\xe3\x80\x8d\xe6\x8c\x89\xe9\x92\xae\xe6\x94\xb9\xe9\x81\x93\xe5\x8e\x9f\xe7\x94\x9f\xe5\x88\x86\xe4\xba\xab/\xe4\xbf\x9d\xe5\xad\x98\xef\xbc\x8c\xe4\xb8\x8d\xe5\x86\x8d\xe5\xbc\xb9\xe3\x80\x8c\xe7\xa6\x81\xe6\xad\xa2\xe6\x89\x93\xe5\xbc\x80\xe3\x80\x8d\xe6\x8b\xa6\xe6\x88\xaa\r\n"
         b"                //   \xef\xbc\x88\xe8\x80\x81\xe6\x80\xbb 2026-10-22 12:11 \xe6\x8a\xa5\xe9\x9a\x9c\xef\xbc\x9a\xe6\x96\x87\xe4\xbb\xb6 tab \xe6\x89\x93\xe5\xbc\x80 tipa \xe5\x8f\xaa\xe5\xbc\xb9\xe6\x8b\xa6\xe6\x88\xaa\xef\xbc\x8c\xe9\x97\xae\xe9\xa2\x98\xe5\x8f\x8d\xe5\xa4\x8d\xe5\x87\xba\xe7\x8e\xb0\xef\xbc\x9b\xe7\x8e\xb0\xe5\x9c\xa8\xe7\x9b\xb4\xe6\x8e\xa5\xe8\xb0\x83\xe8\xb5\xb7\xe7\xb3\xbb\xe7\xbb\x9f\xe5\x88\x86\xe4\xba\xab\xe9\x9d\xa2\xe6\x9d\xbf\xef\xbc\x89\r\n"
         b"                var previewPath = resolveCurrentPreviewPath();\r\n"
         b"                if (previewPath) {\r\n"
         b"                  e.preventDefault();\r\n"
         b"                  e.stopImmediatePropagation();\r\n"
         b"                  shareFileByPath(previewPath, previewPath.split(/[\\\\\\\\/]/).pop() || previewPath);\r\n"
         b"                  return;\r\n"
         b"                }\r\n"
         b"                e.preventDefault();\r\n"
         b"                e.stopImmediatePropagation();\r\n"
         b"                showMobileRestrictedAlert('\xe7\x94\xb5\xe8\x84\x91\xe5\xa4\x96\xe9\x83\xa8\xe5\xba\x94\xe7\x94\xa8');\r\n"
         b"                return;\r\n"
         b"              }\r\n")

rep(OLD_B, NEW_B, 'B')

open(P, 'wb').write(data)
print('done', len(data))
