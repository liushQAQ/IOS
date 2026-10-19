        if (typeof structuredClone !== 'function') {
          globalThis.structuredClone = function (v) {
            if (v === undefined) return undefined;
            return JSON.parse(JSON.stringify(v));
          };
        }