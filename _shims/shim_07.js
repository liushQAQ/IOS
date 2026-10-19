        (function () {
          function def(target, name, fn) {
            if (typeof target[name] === 'function') return;
            try { Object.defineProperty(target, name, { value: fn, writable: true, configurable: true }); } catch (e) {}
          }
          def(Array.prototype, 'toSorted', function (cmp) {
            var a = Array.prototype.slice.call(this); return a.sort(cmp);
          });
          def(Array.prototype, 'toReversed', function () {
            return Array.prototype.slice.call(this).reverse();
          });
          def(Array.prototype, 'toSpliced', function () {
            var a = Array.prototype.slice.call(this);
            a.splice.apply(a, Array.prototype.slice.call(arguments)); return a;
          });
          def(Array.prototype, 'with', function (i, v) {
            var a = Array.prototype.slice.call(this), k = Number(i) || 0;
            k = k < 0 ? a.length + k : k;
            if (k < 0 || k >= a.length) throw new RangeError('Invalid index');
            a[k] = v; return a;
          });
          def(Array.prototype, 'findLast', function (fn, t) {
            for (var i = this.length - 1; i >= 0; i--) if (fn.call(t, this[i], i, this)) return this[i];
          });
          def(Array.prototype, 'findLastIndex', function (fn, t) {
            for (var i = this.length - 1; i >= 0; i--) if (fn.call(t, this[i], i, this)) return i;
            return -1;
          });
          def(Set.prototype, 'union', function (o) {
            var r = new Set(this), s = o[Symbol.iterator]();
            for (var n = s.next(); !n.done; n = s.next()) r.add(n.value);
            return r;
          });
          def(Set.prototype, 'intersection', function (o) {
            var r = new Set(), s = this[Symbol.iterator]();
            for (var n = s.next(); !n.done; n = s.next()) if (o.has(n.value)) r.add(n.value);
            return r;
          });
          def(Set.prototype, 'difference', function (o) {
            var r = new Set(), s = this[Symbol.iterator]();
            for (var n = s.next(); !n.done; n = s.next()) if (!o.has(n.value)) r.add(n.value);
            return r;
          });
          if (typeof Object.groupBy !== 'function') {
            Object.groupBy = function (it, fn) {
              var r = Object.create(null), i = 0, s = it[Symbol.iterator]();
              for (var n = s.next(); !n.done; n = s.next()) {
                var k = fn(n.value, i++); (r[k] || (r[k] = [])).push(n.value);
              }
              return r;
            };
          }
          if (typeof URL.canParse !== 'function') {
            URL.canParse = function (u, b) { try { new URL(u, b); return true; } catch (e) { return false; } };
          }
        })();