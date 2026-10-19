        (function () {
          if (window.__dshDownloadBridgeInjected) return;
          window.__dshDownloadBridgeInjected = true;

          function sendFileToNative(name, mime, base64) {
            try {
              window.webkit.messageHandlers.dshFileTransfer.postMessage({
                name: name || 'file.dat',
                mime: mime || 'application/octet-stream',
                base64: base64
              });
            } catch (err) {
              console.warn('[DSHios] File transfer bridge error:', err);
            }
          }

          // 核心工具：通过绝对路径直接从 DSH 服务端 /api/file 拉取原文件并转送原生分享
          function shareFileByPath(filePath, fileName) {
            if (!filePath) return;
            var name = fileName || filePath.split(/[\\/]/).pop() || 'file_' + Date.now();
            var apiUrl = new URL('api/file?path=' + encodeURIComponent(filePath), window.location.href).href;

            fetch(apiUrl).then(function(res) {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              var mime = res.headers.get('content-type') || 'application/octet-stream';
              return res.blob().then(function(blob) {
                var reader = new FileReader();
                reader.onloadend = function() {
                  var b64 = (reader.result || '').split(',')[1] || '';
                  sendFileToNative(name, mime, b64);
                };
                reader.readAsDataURL(blob);
              });
            }).catch(function(err) {
              console.warn('[DSHios] Failed to fetch via /api/file:', err);
              // 如果是通过 dsh-resource:// 或相对路径，尝试反解真实路径重试
              if (filePath.startsWith('dsh-resource://file/')) {
                var prefix = 'dsh-resource://file/session/';
                var idx = filePath.indexOf(prefix);
                if (idx !== -1) {
                  var rest = filePath.substring(idx + prefix.length);
                  var slashIdx = rest.indexOf('/');
                  if (slashIdx !== -1) {
                    var encodedPath = rest.substring(slashIdx + 1);
                    var decoded = '';
                    try { decoded = decodeURIComponent(encodedPath); } catch(e) { decoded = encodedPath; }
                    if (decoded && decoded !== filePath) {
                      shareFileByPath(decoded, name);
                      return;
                    }
                  }
                }
              }
              // 严禁将界面上的「该格式文件暂时无法预览」等说明文字作为回退内容发送！
            });
          }

          // 拦截标准链接点击（包含 download 属性，或 blob: / data: 协议的下载）
          document.addEventListener('click', function (e) {
            var target = e.target && e.target.closest ? e.target.closest('a') : null;
            if (!target) return;
            var href = target.getAttribute('href') || '';
            var hasDownload = target.hasAttribute('download');
            var downloadName = target.getAttribute('download') || '';

            if (hasDownload || href.startsWith('blob:') || href.startsWith('data:')) {
              if (href.startsWith('data:')) {
                e.preventDefault();
                e.stopPropagation();
                var parts = href.split(',');
                var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'application/octet-stream';
                var b64 = parts[1] || '';
                var fname = downloadName || 'download_' + Date.now();
                sendFileToNative(fname, mime, b64);
              } else if (href.startsWith('blob:')) {
                e.preventDefault();
                e.stopPropagation();
                fetch(href).then(function(res) {
                  var mime = res.headers.get('content-type') || 'application/octet-stream';
                  return res.blob().then(function(b) {
                    var reader = new FileReader();
                    reader.onloadend = function() {
                      var b64 = (reader.result || '').split(',')[1] || '';
                      var fname = downloadName || 'file_' + Date.now();
                      sendFileToNative(fname, mime, b64);
                    };
                    reader.readAsDataURL(b);
                  });
                }).catch(function(err) {
                  console.error('[DSHios] blob download error:', err);
                });
              }
            }
          }, true);

          // 动态注入 1：为每一张交付物卡片（.JZoinq_file / PresentedFileCard）注入原生「分享」按钮
          function enrichDeliverableCards() {
            var cards = document.querySelectorAll('.JZoinq_file');
            cards.forEach(function(card) {
              if (card.querySelector('.dsh-mobile-share-btn')) return;

              // 尝试从卡片中提取文件绝对路径与文件名
              var previewBtn = card.querySelector('button.JZoinq_cardPreview');
              var nameEl = card.querySelector('.JZoinq_fileName');
              var fileName = nameEl ? (nameEl.innerText || '').trim() : '';
              var filePath = previewBtn ? (previewBtn.getAttribute('title') || '') : '';
              if (!filePath && fileName) filePath = fileName;

              var shareBtn = document.createElement('button');
              shareBtn.type = 'button';
              shareBtn.className = 'dsh-mobile-share-btn';
              shareBtn.setAttribute('title', '分享 / 保存到手机');
              shareBtn.style.cssText = 'height:26px;padding:0 10px;font-size:12px;display:inline-flex;align-items:center;gap:4px;border-radius:13px;border:none;background:#007aff;color:#ffffff;font-weight:600;cursor:pointer;margin-left:auto;flex-shrink:0;z-index:10;position:relative;box-shadow:0 2px 6px rgba(0,122,255,0.35);';
              shareBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg><span>保存</span>';

              shareBtn.addEventListener('click', function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                // 优先取卡片上关联的绝对路径
                var currentPath = previewBtn ? (previewBtn.getAttribute('title') || '') : filePath;
                shareFileByPath(currentPath, fileName);
              });

              // 拦截整张卡片点击：如果文件是二进制/非文本（如 ipa, tipa, zip, exe, dmg, tar, gz 等），点击整张卡片直接触发保存/下载，
              // 彻底阻断 sidebarRight 侧栏打不开非文本文件的报错模态框！
              if (previewBtn) {
                previewBtn.addEventListener('click', function(e) {
                  var currentPath = previewBtn.getAttribute('title') || filePath || fileName;
                  var lower = (currentPath || '').toLowerCase();
                  var binExts = ['.ipa', '.tipa', '.zip', '.rar', '.7z', '.tar', '.gz', '.exe', '.dmg', '.apk', '.bin', '.iso', '.pkg', '.deb', '.pdf', '.mp4', '.mov', '.mp3'];
                  var isBinary = binExts.some(function(ext) { return lower.endsWith(ext); });
                  if (isBinary) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    shareFileByPath(currentPath, fileName);
                  }
                }, true); // 捕获阶段拦截
              }

              // 将按钮添加到卡片头部或尾部操作区
              var fileBody = card.querySelector('.JZoinq_fileBody');
              if (fileBody) {
                fileBody.appendChild(shareBtn);
              } else {
                card.appendChild(shareBtn);
              }
            });
          }

          // 动态注入 2：在不可预览文件页面（如 tipa/zip/exe/ipa）注入醒目的【📥 保存 / 分享到手机】按钮
          function enrichPreviewHeader() {
            var emptyContainer = document.querySelector('[data-textpreview-unsupported], [class*="unsupportedPreview"], [class*="unpreviewable"]');
            if (emptyContainer && !emptyContainer.querySelector('.dsh-mobile-save-file-btn')) {
              var pathEl = document.querySelector('[data-textpreview-path], [class*="previewPath"]');
              var fullPath = pathEl ? (pathEl.getAttribute('title') || pathEl.textContent || '') : '';
              if (!fullPath) {
                var titleTab = document.querySelector('[data-dockkit-strip] [aria-selected="true"], [data-dockkit-strip] [class*="active"]');
                fullPath = titleTab ? (titleTab.getAttribute('title') || titleTab.textContent || '') : '';
              }
              var btn = document.createElement('button');
              btn.className = 'dsh-mobile-save-file-btn';
              btn.type = 'button';
              btn.innerHTML = '📥 保存 / 分享到手机';
              btn.style.cssText = 'display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;height:38px!important;padding:0 20px!important;border-radius:19px!important;background:#007aff!important;color:#fff!important;font-size:15px!important;font-weight:600!important;border:none!important;box-shadow:0 4px 12px rgba(0,122,255,0.35)!important;cursor:pointer!important;margin:16px auto!important;';
              btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (fullPath) {
                  var cleanName = fullPath.split(/[\\/]/).pop() || fullPath;
                  shareFileByPath(fullPath, cleanName);
                }
              });
              emptyContainer.appendChild(btn);
            }
          }

          // 动态注入 3：向右侧边栏文件树的列表项追加轻量的分享图标
          function enrichFilesTree() {
            var fileRows = document.querySelectorAll('li[data-files-entry="file"]');
            fileRows.forEach(function(row) {
              if (row.querySelector('.dsh-mobile-tree-share')) return;
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'dsh-mobile-tree-share';
              btn.setAttribute('title', '分享该文件');
              btn.style.cssText = 'width:24px;height:24px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary, #888);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;margin-left:auto;flex-shrink:0;';
              btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>';

              btn.addEventListener('click', function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                var labelEl = row.querySelector('[data-files-name]') || row.querySelector('span') || row;
                var fileName = labelEl ? (labelEl.innerText || '').trim() : '';
                var pathAttr = row.getAttribute('data-files-path') || row.getAttribute('title') || fileName;
                shareFileByPath(pathAttr, fileName);
              });

              var container = row.querySelector('button') || row;
              container.appendChild(btn);
            });
          }

          // 核心修复（问题 1）：在事件捕获阶段拦截点击二进制交付物卡片，直接调起手机分享/保存，杜绝 sidebarRight 报错弹窗
          document.addEventListener('click', function(e) {
            var card = e.target && e.target.closest ? e.target.closest('.JZoinq_file, [data-presented-file]') : null;
            if (!card) return;
            if (e.target.closest('.dsh-mobile-share-btn')) return;

            var previewBtn = card.querySelector('button.JZoinq_cardPreview');
            var nameEl = card.querySelector('.JZoinq_fileName');
            var fileName = nameEl ? (nameEl.innerText || '').trim() : '';
            var filePath = previewBtn ? (previewBtn.getAttribute('title') || '') : '';
            if (!filePath && fileName) filePath = fileName;

            var ext = (filePath.split('.').pop() || '').toLowerCase();
            var binaryExts = ['tipa', 'ipa', 'zip', 'exe', 'tar', 'gz', 'apk', 'dmg', 'bin', '7z', 'rar', 'iso'];
            if (binaryExts.indexOf(ext) !== -1 || ext === 'tipa' || ext === 'ipa') {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              var cleanName = fileName || filePath.split(/[\\/]/).pop() || filePath;
              shareFileByPath(filePath, cleanName);
            }
          }, true);

          setInterval(function() {
            enrichDeliverableCards();
            enrichPreviewHeader();
            enrichFilesTree();
          }, 800);

          // 拦截试图在宿主电脑上打开外部程序/链接的操作（如在电脑端打开、WPS、浏览器、终端等），弹窗提醒用户在手机端禁止此操作
          (function interceptExternalDesktopLaunches() {
            function showMobileRestrictedAlert(toolName) {
              var name = toolName ? '【' + toolName + '】' : '';
              var msg = '手机端禁止打开电脑端外链或程序 ' + name + '，请在电脑端操作！';
              if (window.__dshToast) {
                window.__dshToast(msg);
              }
              alert(msg);
            }

            // 1. 拦截前端发起的 /open-in-app/open 请求（公网大模型网页不拦截，保护原生 fetch 避免触发 WAF 安全盾）
            var h = (location.hostname || '').toLowerCase();
            var isPublic = (h.indexOf('aliyun.com') !== -1 || h.indexOf('baidu.com') !== -1 || h.indexOf('doubao.com') !== -1 || h.indexOf('moonshot.cn') !== -1 || h.indexOf('tencent.com') !== -1 || h.indexOf('openai.com') !== -1);
            var origFetch = window.fetch;
            if (origFetch && !isPublic) {
              window.fetch = function(input, init) {
                var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
                if (url && (url.includes('/open-in-app/open') || url.includes('/open-in-terminal'))) {
                  showMobileRestrictedAlert('电脑外部程序');
                  return Promise.reject(new Error('Mobile access restricted'));
                }
                return origFetch.apply(this, arguments);
              };
            }

            // 2. 监听点击事件，拦截电脑端打开、新建终端、浏览网页等外链/外发按钮
            document.addEventListener('click', function(e) {
              var target = e.target;
              if (!target) return;

              // 检查是否是“在电脑端打开”分列按钮（.PPCmka_split、.PPCmka_main、.PPCmka_chevron）
              var pcSplitBtn = target.closest('.PPCmka_split, .PPCmka_main, .PPCmka_chevron, [data-open-target]');
              if (pcSplitBtn) {
                // 如果这是手机端的“保存/分享”自定义按钮，则允许正常执行
                if (target.closest('.dsh-mobile-save-file-btn') || target.closest('.dsh-mobile-share-btn') || target.closest('.dsh-mobile-download-btn')) {
                  return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                showMobileRestrictedAlert('电脑外部应用');
                return;
              }

              // 检查新建终端、系统浏览器等按钮
              var btn = target.closest('button, a');
              if (btn) {
                var text = (btn.innerText || btn.getAttribute('aria-label') || btn.getAttribute('title') || '').trim();
                if (text === '新建终端' || text === '在系统浏览器中打开' || text.includes('在电脑端打开') || text === '浏览网页') {
                  e.preventDefault();
                  e.stopImmediatePropagation();
                  showMobileRestrictedAlert(text);
                  return;
                }
              }
            }, true);
          })();
        })();