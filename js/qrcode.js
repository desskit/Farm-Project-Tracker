/* Minimal, self-contained QR Code generator (byte mode, ECC level L, versions 1–10).
 * Enough for deep-link URLs. No dependencies, works offline. Exposes window.QR.
 * Algorithm follows the QR spec (Reed–Solomon + masking); structure adapted from
 * the public-domain approach used by Project Nayuki's reference implementation. */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

  // ECC level L block structure for versions 1..10: [ecPerBlock, [[numBlocks, dataPerBlock], ...]]
  var ECL = {
    1: [7, [[1, 19]]], 2: [10, [[1, 34]]], 3: [15, [[1, 55]]], 4: [20, [[1, 80]]],
    5: [26, [[1, 108]]], 6: [18, [[2, 68]]], 7: [20, [[2, 78]]], 8: [24, [[2, 97]]],
    9: [30, [[2, 116]]], 10: [18, [[2, 68], [2, 69]]]
  };
  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };

  /* --- Galois field GF(256), primitive 0x11d --- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }
  function rsGenPoly(deg) {
    var poly = [1];
    for (var i = 0; i < deg; i++) {
      var np = new Array(poly.length + 1); for (var k = 0; k < np.length; k++) np[k] = 0;
      for (var j = 0; j < poly.length; j++) { np[j] ^= gmul(poly[j], EXP[i]); np[j + 1] ^= poly[j]; }
      poly = np;
    }
    return poly;
  }
  function rsRemainder(data, deg) {
    var gen = rsGenPoly(deg), res = new Array(deg); for (var i = 0; i < deg; i++) res[i] = 0;
    for (i = 0; i < data.length; i++) {
      var factor = data[i] ^ res[0];
      res.shift(); res.push(0);
      for (var j = 0; j < gen.length; j++) res[j] ^= gmul(gen[j], factor);
    }
    return res;
  }

  function utf8(text) {
    if (typeof TextEncoder !== 'undefined') return Array.prototype.slice.call(new TextEncoder().encode(text));
    var out = [], s = unescape(encodeURIComponent(text));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function chooseVersion(nBytes) {
    for (var v = 1; v <= 10; v++) {
      var dataCw = ECL[v][1].reduce(function (s, g) { return s + g[0] * g[1]; }, 0);
      var countBits = v < 10 ? 8 : 16;
      var cap = Math.floor((dataCw * 8 - 4 - countBits) / 8);
      if (nBytes <= cap) return v;
    }
    return -1;
  }

  function buildCodewords(bytes, version) {
    var spec = ECL[version], ecLen = spec[0], groups = spec[1];
    var dataCw = groups.reduce(function (s, g) { return s + g[0] * g[1]; }, 0);
    var countBits = version < 10 ? 8 : 16;
    // Bit stream
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); }
    put(0x4, 4);               // byte mode
    put(bytes.length, countBits);
    for (var i = 0; i < bytes.length; i++) put(bytes[i], 8);
    // terminator + byte align
    var cap = dataCw * 8;
    for (i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    // pad bytes
    var pad = [0xEC, 0x11], pi = 0;
    while (bits.length < cap) { put(pad[pi % 2], 8); pi++; }
    // to bytes
    var cw = [];
    for (i = 0; i < bits.length; i += 8) { var b = 0; for (var k = 0; k < 8; k++) b = (b << 1) | bits[i + k]; cw.push(b); }
    // split into blocks
    var blocks = [], ecBlocks = [], idx = 0;
    groups.forEach(function (g) {
      for (var n = 0; n < g[0]; n++) {
        var d = cw.slice(idx, idx + g[1]); idx += g[1];
        blocks.push(d); ecBlocks.push(rsRemainder(d, ecLen));
      }
    });
    // interleave
    var maxData = 0; blocks.forEach(function (b) { maxData = Math.max(maxData, b.length); });
    var out = [];
    for (i = 0; i < maxData; i++) blocks.forEach(function (b) { if (i < b.length) out.push(b[i]); });
    for (i = 0; i < ecLen; i++) ecBlocks.forEach(function (b) { out.push(b[i]); });
    return out;
  }

  function build(version, codewords) {
    var n = 17 + 4 * version;
    var m = [], fn = [];
    for (var r = 0; r < n; r++) { m.push(new Array(n).fill(0)); fn.push(new Array(n).fill(false)); }
    function set(r, c, v) { m[r][c] = v ? 1 : 0; fn[r][c] = true; }
    // finder + separator
    function finder(cr, cc) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var rr = cr + dy, cc2 = cc + dx; if (rr < 0 || rr >= n || cc2 < 0 || cc2 >= n) continue;
        var d = Math.max(Math.abs(dx), Math.abs(dy));
        set(rr, cc2, d !== 2 && d !== 4 ? 1 : 0);
      }
    }
    finder(3, 3); finder(3, n - 4); finder(n - 4, 3);
    // timing
    for (var i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0 ? 1 : 0); set(i, 6, i % 2 === 0 ? 1 : 0); }
    // alignment
    var pos = ALIGN[version];
    for (var a = 0; a < pos.length; a++) for (var b = 0; b < pos.length; b++) {
      var pr = pos[a], pc = pos[b];
      if ((a === 0 && b === 0) || (a === 0 && b === pos.length - 1) || (a === pos.length - 1 && b === 0)) continue;
      for (var yy = -2; yy <= 2; yy++) for (var xx = -2; xx <= 2; xx++) set(pr + yy, pc + xx, Math.max(Math.abs(xx), Math.abs(yy)) !== 1 ? 1 : 0);
    }
    // dark module
    set(n - 8, 8, 1);
    // reserve format areas
    for (i = 0; i <= 8; i++) { if (i !== 6) { fn[8][i] = true; fn[i][8] = true; } }
    for (i = 0; i < 8; i++) { fn[8][n - 1 - i] = true; fn[n - 1 - i][8] = true; }
    // version info (v>=7)
    if (version >= 7) {
      var vr = version;
      for (i = 0; i < 12; i++) vr = (vr << 1) ^ ((vr >> 11) * 0x1F25);
      var vbits = (version << 12) | vr;
      for (i = 0; i < 18; i++) {
        var bit = (vbits >> i) & 1, x1 = Math.floor(i / 3), y1 = n - 11 + (i % 3);
        set(y1, x1, bit); set(x1, y1, bit);
      }
    }
    // data
    var bi = 0, total = codewords.length * 8;
    for (var right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < n; vert++) {
        for (var j = 0; j < 2; j++) {
          var col = right - j;
          var upward = ((right + 1) & 2) === 0;
          var row = upward ? n - 1 - vert : vert;
          if (!fn[row][col]) {
            var v = 0;
            if (bi < total) { v = (codewords[bi >> 3] >> (7 - (bi & 7))) & 1; bi++; }
            m[row][col] = v;
          }
        }
      }
    }
    return { m: m, fn: fn, n: n };
  }

  function maskCond(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return (r * c) % 2 + (r * c) % 3 === 0;
      case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
      case 7: return ((r + c) % 2 + (r * c) % 3) % 2 === 0;
    }
    return false;
  }
  function drawFormat(m, n, mask) {
    var data = (1 << 3) | mask; // level L = 1
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    function gb(i) { return (bits >> i) & 1; }
    for (i = 0; i <= 5; i++) m[8][i] = gb(i);
    m[8][7] = gb(6); m[8][8] = gb(7); m[7][8] = gb(8);
    for (i = 9; i < 15; i++) m[14 - i][8] = gb(i);
    for (i = 0; i < 8; i++) m[n - 1 - i][8] = gb(i);
    for (i = 8; i < 15; i++) m[8][n - 15 + i] = gb(i);
    m[n - 8][8] = 1;
  }
  function penalty(m, n) {
    var p = 0, r, c, i;
    // rule 1: runs
    for (r = 0; r < n; r++) {
      var runC = 1, runR = 1;
      for (c = 1; c < n; c++) {
        if (m[r][c] === m[r][c - 1]) { runC++; if (runC === 5) p += 3; else if (runC > 5) p++; } else runC = 1;
        if (m[c][r] === m[c - 1][r]) { runR++; if (runR === 5) p += 3; else if (runR > 5) p++; } else runR = 1;
      }
    }
    // rule 2: 2x2
    for (r = 0; r < n - 1; r++) for (c = 0; c < n - 1; c++) {
      var v = m[r][c]; if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
    }
    // rule 3: finder-like patterns
    var pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function match(arr) { return arr.join('') === pat.join('') || arr.join('') === pat2.join(''); }
    for (r = 0; r < n; r++) for (c = 0; c < n - 10; c++) {
      var row = [], col = [];
      for (i = 0; i < 11; i++) { row.push(m[r][c + i]); col.push(m[c + i][r]); }
      if (match(row)) p += 40; if (match(col)) p += 40;
    }
    // rule 4: dark ratio
    var dark = 0; for (r = 0; r < n; r++) for (c = 0; c < n; c++) dark += m[r][c];
    var pct = dark * 100 / (n * n);
    p += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return p;
  }

  function generate(text) {
    var bytes = utf8(text);
    var version = chooseVersion(bytes.length);
    if (version < 0) throw new Error('Text too long for QR (max ~270 bytes)');
    var cw = buildCodewords(bytes, version);
    var base = build(version, cw);
    var n = base.n, best = null, bestScore = Infinity, bestMask = 0;
    for (var mask = 0; mask < 8; mask++) {
      var m = base.m.map(function (row) { return row.slice(); });
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (!base.fn[r][c] && maskCond(mask, r, c)) m[r][c] ^= 1;
      drawFormat(m, n, mask);
      var s = penalty(m, n);
      if (s < bestScore) { bestScore = s; best = m; bestMask = mask; }
    }
    return { modules: best, size: n, version: version, mask: bestMask };
  }

  function svg(text, opts) {
    opts = opts || {};
    var margin = opts.margin == null ? 4 : opts.margin;
    var qr = generate(text);
    var n = qr.size, dim = n + margin * 2;
    var path = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (qr.modules[r][c]) path += 'M' + (c + margin) + ',' + (r + margin) + 'h1v1h-1z';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" ' +
      'shape-rendering="crispEdges" style="width:100%;height:auto;max-width:280px;background:#fff">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="#fff"/>' +
      '<path d="' + path + '" fill="#000"/></svg>';
  }

  root.QR = { generate: generate, svg: svg };
})();
