        if (typeof Array.prototype.flatMap !== 'function') {
          Object.defineProperty(Array.prototype, 'flatMap', {
            value: function (fn, thisArg) {
              return this.reduce(function (acc, it, i, arr) {
                var v = fn.call(thisArg, it, i, arr);
                return acc.concat(Array.isArray(v) ? v : [v]);
              }, []);
            },
            writable: true, configurable: true
          });
        }