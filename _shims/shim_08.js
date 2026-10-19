        (function () {
          window.__dshReportError = function (parts) {
            try {
              window.webkit.messageHandlers.dshErrors.postMessage(String(parts));
            } catch (e) {}
          };
          window.addEventListener('error', function (e) {
            window.__dshReportError('JS错误: ' + (e.message || e) + ' @ ' + (e.filename || '').slice(-40) + ':' + (e.lineno || 0));
          });
          window.addEventListener('unhandledrejection', function (e) {
            var r = e.reason;
            var msg = (r && r.message ? r.message : String(r));
            // 拦截不可预览文件触发的 sidebarRight tab 注册缺失报错，杜绝弹窗
            if (msg.indexOf('no registered tab type claims') !== -1) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            window.__dshReportError('未处理Promise拒绝: ' + msg);
          });
        })();