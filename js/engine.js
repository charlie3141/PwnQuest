/* ============================================================
 * PwnQuest — engine.js
 * Memory simulator: stack mô phỏng bằng Uint8Array + địa chỉ ảo,
 * tiện ích hex/endianness, payload parser.
 * Không phụ thuộc gì; gắn toàn bộ vào window.PwnQuest.Engine
 * ============================================================ */
window.PwnQuest = window.PwnQuest || {};
(function (PQ) {
  'use strict';

  const Engine = PQ.Engine = {};

  /* ---------------- hex / number utils ---------------- */

  /** 0x1f -> "0x0000001F" (đủ `digits` chữ số hex, in hoa) */
  Engine.hex = function (value, digits) {
    digits = digits || 8;
    let v = value >>> 0;
    if (value < 0) v = (value + 0x100000000) >>> 0;
    return '0x' + v.toString(16).toUpperCase().padStart(digits, '0');
  };

  /** 15 -> "0F" */
  Engine.hexByte = function (b) {
    return (b & 0xff).toString(16).toUpperCase().padStart(2, '0');
  };

  Engine.isPrintable = function (b) {
    return b >= 0x20 && b < 0x7f;
  };

  Engine.asciiChar = function (b) {
    return Engine.isPrintable(b) ? String.fromCharCode(b) : '·';
  };

  /** Chấp nhận "0x1f", "1F" (có 0x prefix hoặc thuần hex 2 chữ số), "31" (dec) */
  Engine.parseNum = function (s) {
    s = String(s == null ? '' : s).trim();
    if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s.slice(2), 16);
    if (/^[0-9a-fA-F]{1,8}$/.test(s) && /[a-fA-F]/.test(s)) return parseInt(s, 16);
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    return NaN;
  };

  /** số -> mảng byte little-endian dài n (mặc định 4) */
  Engine.leBytes = function (value, n) {
    n = n || 4;
    const out = new Array(n).fill(0);
    let v = value;
    for (let i = 0; i < n; i++) {
      out[i] = v & 0xff;
      v = Math.floor(v / 256);
    }
    return out;
  };

  /** mảng byte + vị trí start -> số little-endian dài n byte */
  Engine.leValue = function (bytes, start, n) {
    n = n || 4;
    let v = 0;
    for (let i = n - 1; i >= 0; i--) {
      v = v * 256 + (bytes[start + i] || 0);
    }
    return v;
  };

  /** "ef be ad de" — mảng byte in ra cho dễ đọc */
  Engine.byteStr = function (bytes) {
    return Array.from(bytes, Engine.hexByte).join(' ');
  };

  /* ---------------- SimMemory: bộ nhớ giả lập ----------------
   * Một vùng nhớ thẳng (Uint8Array) với địa chỉ ảo bắt đầu từ `base`.
   * labels mô tả các vùng được đặt tên: { name, addr, size, cls, desc }
   * Mỗi lần write(), các offset bị đổi được ghi lại vào `dirty`
   * để memory viewer highlight đúng byte vừa thay đổi.
   * ---------------------------------------------------------- */
  Engine.SimMemory = class SimMemory {
    constructor(opts) {
      opts = opts || {};
      this.base = opts.base != null ? opts.base : 0xffd000;
      this.size = opts.size != null ? opts.size : 128;
      this.labels = (opts.labels || []).slice().sort(function (a, b) { return a.addr - b.addr; });
      this.bytes = new Uint8Array(this.size);
      this.dirty = new Set();   // các offset vừa bị ghi (chưa hiển thị)
      this.version = 0;         // tăng mỗi khi có ghi — viewer dùng để biết cần vẽ lại
    }

    offset(addr) { return addr - this.base; }

    contains(addr, n) {
      n = n || 1;
      return addr >= this.base && addr + n <= this.base + this.size;
    }

    /** Ghi mảng byte vào `addr`. Trả về danh sách offset thực sự đổi giá trị. */
    write(addr, byteArr) {
      const changed = [];
      for (let i = 0; i < byteArr.length; i++) {
        const a = addr + i;
        if (!this.contains(a)) continue;
        const o = this.offset(a);
        if (this.bytes[o] !== byteArr[i]) changed.push(o);
        this.bytes[o] = byteArr[i];
        this.dirty.add(o);
      }
      this.version++;
      return changed;
    }

    read(addr, n) {
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push(this.contains(addr + i) ? this.bytes[this.offset(addr + i)] : 0);
      }
      return out;
    }

    read32(addr) { return Engine.leValue(this.read(addr, 4), 0, 4); }
    write32(addr, val) { return this.write(addr, Engine.leBytes(val, 4)); }

    /** Vùng label chứa địa chỉ này (hoặc null) */
    labelAt(addr) {
      for (const l of this.labels) {
        if (addr >= l.addr && addr < l.addr + l.size) return l;
      }
      return null;
    }

    fillRegion(labelName, byteVal) {
      const l = this.labels.find(function (x) { return x.name === labelName; });
      if (l) this.write(l.addr, new Array(l.size).fill(byteVal));
    }

    clearDirty() { this.dirty.clear(); }

    reset() {
      this.bytes.fill(0);
      this.dirty.clear();
      this.version++;
    }
  };

  /* ---------------- payload parser ----------------
   * Chấp nhận payload kiểu pwntools lai chuỗi thường:
   *   "AAAA"            -> 41 41 41 41
   *   "\x41\x42"        -> 41 42
   *   "0xdeadbeef"      -> ef be ad de  (little-endian, 4 byte)
   *   "&win" / "&win+8" -> địa chỉ symbol (+ offset), 4 byte LE
   *   "\n", "\t", "\0", "\\" -> 0a, 09, 00, 5c
   * Trả về { bytes, errors, notes }.
   * ---------------------------------------------- */
  Engine.parsePayload = function (input, symbols) {
    symbols = symbols || {};
    const bytes = [];
    const errors = [];
    const notes = [];
    const s = String(input == null ? '' : input);
    let i = 0;

    while (i < s.length) {
      const rest = s.slice(i);
      let m;

      // \xNN — byte hex
      if ((m = rest.match(/^\\x([0-9a-fA-F]{1,2})/))) {
        bytes.push(parseInt(m[1], 16));
        i += m[0].length;
        continue;
      }
      // escape thường gặp
      if ((m = rest.match(/^\\n/))) { bytes.push(10); i += 2; continue; }
      if ((m = rest.match(/^\\t/))) { bytes.push(9);  i += 2; continue; }
      if ((m = rest.match(/^\\0/))) { bytes.push(0);  i += 2; continue; }
      if ((m = rest.match(/^\\\\/))) { bytes.push(92); i += 2; continue; }

      // &symbol hoặc &symbol+N — địa chỉ (4 byte LE)
      if ((m = rest.match(/^&([A-Za-z_]\w*(?:[+-]\d+)?)/))) {
        const full = m[1];
        const plusMatch = full.match(/([+-])(\d+)$/);
        const baseName = plusMatch ? full.slice(0, plusMatch.index) : full;
        const delta = plusMatch ? (plusMatch[1] === '-' ? -1 : 1) * parseInt(plusMatch[2], 10) : 0;
        const addr = symbols[baseName];
        if (addr == null) {
          errors.push({ token: m[0], msg: 'Không biết địa chỉ của "&' + baseName + '" (symbol này không tồn tại trong chương trình).' });
        } else {
          const a = addr + delta;
          bytes.push.apply(bytes, Engine.leBytes(a, 4));
          notes.push('&' + baseName + ' → ' + Engine.byteStr(Engine.leBytes(a, 4)) + ' (' + Engine.hex(a) + ', little-endian)');
        }
        i += m[0].length;
        continue;
      }

      // 0x… — số hex, ghi 4 byte LE (8 byte nếu vượt 32-bit)
      if ((m = rest.match(/^0x[0-9a-fA-F]+/))) {
        const digits = m[0].slice(2);
        if (digits.length > 8) {
          errors.push({ token: m[0], msg: 'Token hex "' + m[0].slice(0, 9) + '…" quá dài (tối đa 8 chữ số = 32-bit). Nếu bạn ghép nhiều giá trị liền nhau, hãy tách bằng khoảng trắng — khoảng trắng chỉ là dấu phân tách, không ghi byte.' });
          i += m[0].length;
          continue;
        }
        const v = parseInt(digits, 16);
        const n = v > 0xffffffff ? 8 : 4;
        bytes.push.apply(bytes, Engine.leBytes(v, n));
        notes.push(m[0] + ' → ' + Engine.byteStr(Engine.leBytes(v, n)) + ' (little-endian)');
        i += m[0].length;
        continue;
      }

      // khoảng trắng — bỏ qua (chỉ để phân tách, không ghi byte)
      if ((m = rest.match(/^\s+/))) { i += m[0].length; continue; }

      // ký tự thường — 1 byte ASCII
      const ch = s[i];
      const code = s.codePointAt(i);
      if (code > 255) {
        errors.push({ token: ch, msg: 'Ký tự "' + ch + '" không phải ASCII 1 byte.' });
      } else {
        bytes.push(code);
      }
      i += ch.length;
    }

    return { bytes: bytes, errors: errors, notes: notes };
  };

  /* ---------------- apply payload lên simulator ---------------- */

  /**
   * Parse `input` và ghi thẳng vào bộ nhớ từ `bufAddr` (như read/strcpy tràn buffer).
   * Trả về { bytes, errors, notes, written } — written = số byte thực sự ghi.
   */
  Engine.applyPayload = function (mem, bufAddr, input, symbols) {
    const res = Engine.parsePayload(input, symbols);
    if (res.errors.length === 0 && res.bytes.length > 0) {
      mem.write(bufAddr, res.bytes);
    }
    res.written = res.errors.length === 0 ? res.bytes.length : 0;
    return res;
  };

  /** Đọc giá trị LE tại vùng label — để so điều kiện pass và tạo thông báo lỗi chính xác */
  Engine.readLabel = function (mem, labelName) {
    const l = mem.labels.find(function (x) { return x.name === labelName; });
    if (!l) return null;
    return {
      label: l,
      addr: l.addr,
      size: l.size,
      bytes: mem.read(l.addr, l.size),
      value: mem.read32(l.addr)
    };
  };

  /**
   * Mô tả giá trị 4-byte theo kiểu dễ hiểu cho thông báo lỗi:
   * "0x41414141 (bạn đã ghi 'AAAA' vào đó)"
   */
  Engine.describeDword = function (value) {
    const bs = Engine.leBytes(value, 4);
    const allPrintable = bs.every(Engine.isPrintable);
    const ascii = allPrintable ? " (bạn đã ghi '" + bs.map(function (b) { return String.fromCharCode(b); }).join('') + "' vào đó)" : '';
    return Engine.hex(value) + ascii;
  };

  /* ---------------- pattern cyclic (cho level offset) ----------------
   * Sinh chuỗi pattern mà mỗi 4-byte window là duy nhất — dùng để
   * tìm offset tới return address (giống cyclic của pwntools).
   * ----------------------------------------------------------------- */
  const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
  let CYCLIC_CACHE = null;

  function deBruijn(alphabet, k) {
    const a = new Array(alphabet.length * k + 1).fill(0);
    const seq = [];
    (function db(t, p) {
      if (t > k) {
        if (k % p === 0) for (let j = 1; j <= p; j++) seq.push(alphabet[a[j]]);
      } else {
        a[t] = a[t - p];
        db(t + 1, p);
        for (let j = a[t - p] + 1; j < alphabet.length; j++) {
          a[t] = j;
          db(t + 1, t);
        }
      }
    })(1, 1);
    return seq.join('');
  }

  /** cyclic(offset, len) — lấy `len` ký tự pattern bắt đầu từ `offset` */
  Engine.cyclic = function (offset, len) {
    if (!CYCLIC_CACHE) CYCLIC_CACHE = deBruijn(ALPHABET, 4);
    let out = '';
    for (let i = 0; i < len; i++) {
      out += CYCLIC_CACHE[(offset + i) % CYCLIC_CACHE.length];
    }
    return out;
  };

  /** cyclicFind(4chars) — offset của window 4 ký tự trong pattern */
  Engine.cyclicFind = function (s) {
    if (!CYCLIC_CACHE) CYCLIC_CACHE = deBruijn(ALPHABET, 4);
    return CYCLIC_CACHE.indexOf(s);
  };
})(window.PwnQuest);
