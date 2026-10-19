        (function () {
          if (typeof window !== 'undefined') {
            if (!window.crypto) window.crypto = {};
            if (typeof window.crypto.randomUUID !== 'function') {
              window.crypto.randomUUID = function () {
                return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, function (c) {
                  return (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16);
                });
              };
            }
          }
          if (typeof String.prototype.replaceAll !== 'function') {
            String.prototype.replaceAll = function (search, replace) {
              if (search instanceof RegExp) {
                if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp');
                return this.replace(search, replace);
              }
              return this.split(search).join(replace);
            };
          }
        })();