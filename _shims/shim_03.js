        if (typeof Array.prototype.at !== 'function') {
          Object.defineProperty(Array.prototype, 'at', {
            value: function (i) {
              var n = this.length, k = Number(i) || 0;
              k = k < 0 ? n + k : k;
              return (k >= 0 && k < n) ? this[k] : undefined;
            },
            writable: true, configurable: true
          });
        }