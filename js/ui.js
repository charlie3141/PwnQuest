/* ============================================================
 * PwnQuest — ui.js
 * Router, tabs, hint drawer, progress + localStorage, memory viewer,
 * markdown renderer mini, syntax highlighter mini, confetti.
 * ============================================================ */
window.PwnQuest = window.PwnQuest || {};
(function (PQ) {
  'use strict';

  const UI = PQ.UI = {};
  const Engine = PQ.Engine;

  /* ================= DOM helpers ================= */

  UI.el = function (tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  UI.esc = esc;

  /* ================= syntax highlighter (mini) ================= */

  function rulesFor(lang) {
    if (lang === 'c') {
      return [
        { cls: 'com', re: /\/\/[^\n]*/y },
        { cls: 'com', re: /\/\*[\s\S]*?\*\//y },
        { cls: 'str', re: /"(?:[^"\\\n]|\\.)*"/y },
        { cls: 'str', re: /'(?:[^'\\\n]|\\.)'/y },
        { cls: 'kw',  re: /\b(?:int|char|void|unsigned|signed|long|short|const|struct|return|if|else|for|while|do|sizeof|break|continue|static|include|define)\b/y },
        { cls: 'num', re: /\b0x[0-9a-fA-F]+\b|\b\d+\b/y },
        { cls: 'fn',  re: /\b[A-Za-z_]\w*(?=\s*\()/y },
        { cls: 'id',  re: /\b[A-Za-z_]\w*\b/y }
      ];
    }
    if (lang === 'asm') {
      return [
        { cls: 'com', re: /(?:;|#)[^\n]*/y },
        { cls: 'lbl', re: /^[A-Za-z_.$][\w.$]*:/y },
        { cls: 'dir', re: /\.[\w.]+/y },
        { cls: 'mnem', re: /\b(?:push|pop|mov|movzx|movsx|lea|call|ret|leave|nop|int3|add|sub|imul|idiv|inc|dec|cmp|test|jmp|je|jne|jg|jl|jge|jle|ja|jb|and|or|xor|shl|shr|endbr64)\b/y },
        { cls: 'reg', re: /\b(?:eax|ebx|ecx|edx|esi|edi|esp|ebp|rax|rbx|rcx|rdx|rsi|rdi|rsp|rbp|eip|rip|al|bl|cl|dl|ah|bh|ch|dh|r[0-9]+d?|[x-z]mm\d*)\b/y },
        { cls: 'num', re: /\b0x[0-9a-fA-F]+\b|\b\d+\b/y },
        { cls: 'id',  re: /\b[A-Za-z_][\w-]*\b/y }
      ];
    }
    return null;
  }

  function highlightLine(line, rules) {
    if (!rules) return esc(line);
    let out = '', pos = 0;
    while (pos < line.length) {
      let matched = null;
      for (const r of rules) {
        r.re.lastIndex = pos;
        const m = r.re.exec(line);
        if (m && m.index === pos && m[0].length > 0) { matched = { cls: r.cls, text: m[0] }; break; }
      }
      if (matched) {
        out += matched.cls === 'id'
          ? esc(matched.text)
          : '<span class="tok-' + matched.cls + '">' + esc(matched.text) + '</span>';
        pos += matched.text.length;
      } else {
        out += esc(line[pos]);
        pos++;
      }
    }
    return out;
  }

  const MK_RE = /(?:\/\/|;|#)\s*§(\w+)\s*$/;

  UI.codeblock = function (lang, code) {
    const pre = UI.el('div', 'codeblock');
    const codeEl = UI.el('code', null);
    const rules = rulesFor(lang);
    code.split('\n').forEach(function (line) {
      const lineEl = UI.el('span', 'hl-line', highlightLine(line, rules));
      const mk = line.match(MK_RE);
      if (mk) lineEl.dataset.mk = mk[1];
      codeEl.appendChild(lineEl);
    });
    pre.appendChild(codeEl);
    pre.dataset.lang = lang;
    return pre;
  };

  /** Ghép cặp block C ↔ asm liền nhau + highlight khi hover dòng có marker // §n / ; §n */
  function attachPairSync(blocksContainer) {
    const kids = Array.prototype.slice.call(blocksContainer.children);
    for (let i = 0; i < kids.length - 1; i++) {
      const a = kids[i], b = kids[i + 1];
      if (a.classList && a.classList.contains('codeblock') && b.classList &&
          a.dataset.lang === 'c' && b.dataset.lang === 'asm') {
        const pair = UI.el('div', 'pair');
        a.parentNode.insertBefore(pair, a);
        pair.appendChild(a);
        pair.appendChild(b);
        pairSyncHover(a, b);
        pairSyncHover(b, a);
        i++;
      }
    }
  }

  function pairSyncHover(from, to) {
    from.addEventListener('mouseover', function (e) {
      const lineEl = e.target.closest('.hl-line');
      if (!lineEl || !lineEl.dataset.mk) return;
      clearHi(to);
      to.querySelectorAll('.hl-line[data-mk="' + lineEl.dataset.mk + '"]')
        .forEach(function (x) { x.classList.add('mk-hi'); });
      lineEl.classList.add('mk-hi');
    });
    from.addEventListener('mouseout', function () { clearHi(from); clearHi(to); });
  }

  function clearHi(block) {
    block.querySelectorAll('.hl-line.mk-hi').forEach(function (x) { x.classList.remove('mk-hi'); });
  }

  /* ================= markdown renderer (mini) ================= */

  function inlineMd(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return s;
  }

  UI.md = function (text) {
    const root = UI.el('div', 'md');
    const lines = String(text).replace(/\r\n/g, '\n').split('\n');
    let i = 0, para = [];

    function flushPara() {
      if (para.length) { root.appendChild(UI.el('p', null, inlineMd(para.join(' ')))); para = []; }
    }

    while (i < lines.length) {
      const line = lines[i];

      // fenced code
      const fence = line.match(/^\s*```\s*(\w*)\s*$/);
      if (fence) {
        flushPara();
        const lang = fence[1] || '';
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // skip closing fence
        root.appendChild(UI.codeblock(lang, buf.join('\n')));
        continue;
      }
      // headings
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        flushPara();
        root.appendChild(UI.el('h' + h[1].length, null, inlineMd(h[2])));
        i++; continue;
      }
      // hr
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushPara(); root.appendChild(UI.el('hr')); i++; continue; }
      // blockquote
      if (/^>\s?/.test(line)) {
        flushPara();
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
        const bq = UI.el('blockquote');
        buf.forEach(function (t) { bq.appendChild(UI.el('p', null, inlineMd(t))); });
        root.appendChild(bq);
        continue;
      }
      // ul
      if (/^\s*[-*]\s+/.test(line)) {
        flushPara();
        const ul = UI.el('ul');
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          ul.appendChild(UI.el('li', null, inlineMd(lines[i].replace(/^\s*[-*]\s+/, ''))));
          i++;
        }
        root.appendChild(ul);
        continue;
      }
      // ol
      if (/^\s*\d+[.)]\s+/.test(line)) {
        flushPara();
        const ol = UI.el('ol');
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          ol.appendChild(UI.el('li', null, inlineMd(lines[i].replace(/^\s*\d+[.)]\s+/, ''))));
          i++;
        }
        root.appendChild(ol);
        continue;
      }
      // table
      if (line.indexOf('|') !== -1 && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
        flushPara();
        const header = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].indexOf('|') !== -1 && lines[i].trim() !== '') {
          rows.push(splitRow(lines[i]));
          i++;
        }
        root.appendChild(buildTable(header, rows));
        continue;
      }
      // blank
      if (line.trim() === '') { flushPara(); i++; continue; }

      para.push(line.trim());
      i++;
    }
    flushPara();
    attachPairSync(root);
    return root;
  };

  function splitRow(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
  }

  function buildTable(header, rows) {
    const t = UI.el('table');
    const thead = UI.el('thead');
    const trh = UI.el('tr');
    header.forEach(function (c) { trh.appendChild(UI.el('th', null, inlineMd(c))); });
    thead.appendChild(trh);
    t.appendChild(thead);
    const tbody = UI.el('tbody');
    rows.forEach(function (r) {
      const tr = UI.el('tr');
      r.forEach(function (c) { tr.appendChild(UI.el('td', null, inlineMd(c))); });
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    return t;
  }

  /* ================= memory viewer =================
   * opts: { animate: true (flash byte dirty), regions từ mem.labels,
   *         rowBytes: 8, onByteClick(addr, label) }
   * Trả về { refresh() }.
   * ------------------------------------------------ */
  UI.memView = function (container, mem, opts) {
    opts = opts || {};
    const rowBytes = opts.rowBytes || 8;
    const animate = opts.animate !== false;

    const wrap = UI.el('div', 'memview');
    const legend = UI.el('div', 'mem-legend');
    const table = UI.el('table', 'mem-table');
    wrap.appendChild(legend);
    wrap.appendChild(table);
    container.appendChild(wrap);

    function render() {
      // legend
      legend.innerHTML = '';
      mem.labels.forEach(function (l) {
        const chip = UI.el('span', 'legend-chip rg-' + (l.cls || 'caller'),
          esc(l.name) + ' <span style="color:var(--muted)">' + Engine.hex(l.addr) + '</span>');
        chip.title = l.desc || '';
        legend.appendChild(chip);
      });

      // bảng
      table.innerHTML = '';
      for (let off = 0; off < mem.size; off += rowBytes) {
        const addr = mem.base + off;
        const tr = UI.el('tr');
        const tdAddr = UI.el('td', 'mem-addr', Engine.hex(addr, 6));
        // hàng nào chứa điểm bắt đầu của 1 vùng thì gắn tên vùng ngay hàng đó
        const rowLabels = mem.labels.filter(function (l) {
          return l.addr >= addr && l.addr < addr + rowBytes;
        });
        if (rowLabels.length) {
          tdAddr.title = rowLabels.map(function (l) { return l.name + ' ← ' + Engine.hex(l.addr, 6); }).join('\n');
        }
        tr.appendChild(tdAddr);

        let ascii = '';
        for (let b = 0; b < rowBytes; b++) {
          const a = addr + b;
          const val = mem.contains(a) ? mem.bytes[mem.offset(a)] : 0;
          const lbl = mem.labelAt(a);
          const cls = ['byte'];
          if (val === 0) cls.push('zero');
          if (lbl && lbl.cls) cls.push('rg-' + lbl.cls);
          if (animate && mem.dirty.has(mem.offset(a))) cls.push('dirty');
          const td = UI.el('td', cls.join(' '), Engine.hexByte(val));
          const parts = [Engine.hex(a, 6) + ' = 0x' + Engine.hexByte(val)];
          if (Engine.isPrintable(val)) parts.push("('" + String.fromCharCode(val) + "')");
          if (lbl) parts.push('— ' + lbl.name);
          td.title = parts.join(' ');
          if (opts.onByteClick) {
            td.style.cursor = 'pointer';
            td.addEventListener('click', function () { opts.onByteClick(a, lbl); });
          }
          tr.appendChild(td);
          ascii += Engine.asciiChar(val);
        }
        tr.appendChild(UI.el('td', 'ascii', esc(ascii)));
        table.appendChild(tr);
      }
      mem.clearDirty();
    }

    render();
    return { refresh: render, el: wrap };
  };

  /* ================= payload form (dùng chung cho challenge) =================
   * opts: { label, placeholder, buttonLabel, onRun(payloadText, out) }
   * out = { showTerm(html), clear(), input, btn }
   * ------------------------------------------------------------------------ */
  UI.payloadForm = function (container, opts) {
    const form = UI.el('div');
    const row = UI.el('div', 'field-row');
    if (opts.label) row.appendChild(UI.el('label', null, opts.label));
    const input = UI.el('input');
    input.type = 'text';
    input.placeholder = opts.placeholder || '';
    input.style.flex = '1';
    input.spellcheck = false;
    row.appendChild(input);
    const btn = UI.el('button', 'btn btn-primary', opts.buttonLabel || '▶ Run payload');
    row.appendChild(btn);
    form.appendChild(row);

    const out = UI.el('div', 'output-term');
    out.style.display = 'none';
    form.appendChild(out);

    function run() {
      btn.disabled = true;
      out.style.display = 'block';
      out.innerHTML = '<span class="term-dim">Đang chạy payload…</span>';
      // setTimeout để renderer kịp vẽ "Đang chạy…" trước khi xử lý
      setTimeout(function () {
        try { opts.onRun(input.value, api); }
        finally { btn.disabled = false; }
      }, 30);
    }
    btn.addEventListener('click', run);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') run();
    });

    const api = {
      input: input,
      btn: btn,
      out: out,
      showTerm: function (html) { out.style.display = 'block'; out.innerHTML = html; },
      clear: function () { out.style.display = 'none'; out.innerHTML = ''; }
    };
    container.appendChild(form);
    return api;
  };

  /* ================= confetti (nhẹ) ================= */

  UI.confetti = function () {
    const canvas = UI.el('canvas', 'confetti-canvas');
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#7ee787', '#58d5e8', '#ffd866', '#ff7eb6'];
    const parts = [];
    for (let i = 0; i < 90; i++) {
      parts.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.4,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        vy: 2.2 + Math.random() * 3,
        vx: -1.2 + Math.random() * 2.4,
        rot: Math.random() * Math.PI,
        vr: -0.12 + Math.random() * 0.24,
        color: colors[(Math.random() * colors.length) | 0]
      });
    }

    let frames = 0;
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frames++;
      if (frames < 160) requestAnimationFrame(tick);
      else canvas.remove();
    }
    requestAnimationFrame(tick);
  };

  /* ================= Store (localStorage) ================= */

  const STORE_KEY = 'pwnquest_save_v1';

  const Store = PQ.Store = {
    data: null,
    load: function () {
      try {
        this.data = JSON.parse(localStorage.getItem(STORE_KEY));
      } catch (e) { this.data = null; }
      if (!this.data || typeof this.data !== 'object') {
        this.data = { startedAt: Date.now(), currentLevel: 0, levels: {} };
      }
      if (!this.data.levels) this.data.levels = {};
      return this.data;
    },
    save: function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch (e) { /* private mode */ }
    },
    ensure: function (idx) {
      const k = String(idx);
      if (!this.data.levels[k]) this.data.levels[k] = { passed: false, fails: 0, hints: 0, passedAt: null };
      return this.data.levels[k];
    },
    passedCount: function () {
      let n = 0;
      Object.keys(this.data.levels).forEach(function (k) {
        if (PQ.App.levels.some(function (lv) { return String(lv.id) === k && PQ.Store.data.levels[k].passed; })) n++;
      });
      return n;
    },
    reset: function () {
      localStorage.removeItem(STORE_KEY);
      this.load();
    }
  };

  /* ================= App: router + tabs + hints ================= */

  const App = PQ.App = {
    levels: [],
    current: null,
    panelBodies: {}, // giữ nội dung đã dựng theo level để chuyển tab không mất state

    init: function () {
      this.levels = (PQ.levels || []).slice().sort(function (a, b) { return a.id - b.id; });
      Store.load();

      const self = this;
      document.getElementById('reset-btn').addEventListener('click', function () {
        if (confirm('Xoá toàn bộ tiến độ (level đã pass, hint đã dùng) và bắt đầu lại?')) {
          Store.reset();
          const h = location.hash.match(/^#\/?(\d+)/);
          self.show(h ? parseInt(h[1], 10) : 0, true);
        }
      });

      window.addEventListener('hashchange', function () {
        const m = location.hash.match(/^#\/?(\d+)/);
        if (m) self.show(parseInt(m[1], 10));
      });

      const m = location.hash.match(/^#\/?(\d+)/);
      this.show(m ? parseInt(m[1], 10) : (Store.data.currentLevel || 0), true);
    },

    levelById: function (idx) {
      return this.levels.find(function (l) { return l.id === idx; }) || null;
    },

    show: function (idx, force) {
      if (!force && this.current === idx && document.getElementById('level-header').dataset.lid == idx) return;
      const lv = this.levelById(idx);
      if (!lv) {
        idx = this.levels.length ? this.levels[0].id : 0;
        const lv2 = this.levelById(idx);
        if (!lv2) return;
        return this.show(idx, true);
      }
      this.current = idx;
      Store.data.currentLevel = idx;
      Store.save();
      if (location.hash !== '#/' + idx) {
        this._skipHash = true;
        location.hash = '#/' + idx;
      }
      window.scrollTo({ top: 0 });

      this.renderNav();
      this.renderLevel(lv);
    },

    renderNav: function () {
      const nav = document.getElementById('level-nav');
      nav.innerHTML = '';
      const total = 8;
      for (let i = 0; i < total; i++) {
        const dot = UI.el('button', 'lvl-dot', String(i));
        dot.title = 'Level ' + i;
        const rec = Store.data.levels[String(i)];
        if (rec && rec.passed) dot.classList.add('passed');
        if (i === this.current) dot.classList.add('current');
        if (!this.levelById(i)) {
          dot.classList.add('locked');
          dot.title = 'Level ' + i + ' — sắp ra mắt';
          dot.disabled = true;
        } else {
          dot.addEventListener('click', this.show.bind(this, i));
        }
        nav.appendChild(dot);
      }
      const passed = Store.passedCount();
      document.getElementById('progress').innerHTML =
        'Hoàn thành: <b>' + passed + '</b>/' + total;
    },

    renderLevel: function (lv) {
      const rec = Store.ensure(lv.id);

      // header
      document.title = 'Level ' + lv.id + ': ' + lv.title + ' — PwnQuest';
      const header = document.getElementById('level-header');
      header.dataset.lid = lv.id;
      header.innerHTML = '';
      header.appendChild(UI.el('h1', null, 'Level ' + lv.id + ' — ' + esc(lv.title)));
      const goal = UI.el('p', 'level-goal',
        '<span class="goal-label">🎯 Mục tiêu:</span> ' + esc(lv.goal));
      header.appendChild(goal);

      // tabs
      const tabsData = [
        { key: 'theory',    label: '📖 THEORY' },
        { key: 'demo',      label: '🔬 DEMO' },
        { key: 'challenge', label: '⚔️ CHALLENGE' },
        { key: 'solution',  label: rec.passed || rec.fails >= 3 ? '🔓 SOLUTION' : '🔒 SOLUTION' }
      ];
      const tabsEl = document.getElementById('tabs');
      tabsEl.innerHTML = '';
      const panels = {
        theory: document.getElementById('panel-theory'),
        demo: document.getElementById('panel-demo'),
        challenge: document.getElementById('panel-challenge'),
        solution: document.getElementById('panel-solution')
      };
      const self = this;
      let activeTab = Store.data['tab_' + lv.id] || 'theory';

      tabsData.forEach(function (t) {
        const btn = UI.el('button', 'tab-btn' + (t.key === 'solution' && !(rec.passed || rec.fails >= 3) ? ' locked' : '') + (t.key === activeTab ? ' active' : ''), t.label);
        btn.addEventListener('click', function () {
          if (t.key === 'solution' && !(Store.ensure(lv.id).passed || Store.ensure(lv.id).fails >= 3)) {
            self.renderSolutionLocked(lv);
          }
          tabsEl.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          Store.data['tab_' + lv.id] = t.key;
          Store.save();
          Object.keys(panels).forEach(function (k) { panels[k].classList.toggle('active', k === t.key); });
        });
        tabsEl.appendChild(btn);
      });

      // panels
      Object.keys(panels).forEach(function (k) { panels[k].innerHTML = ''; panels[k].classList.toggle('active', k === activeTab); });

      // THEORY
      panels.theory.appendChild(UI.md(lv.theory));

      // DEMO + CHALLENGE — hook của level
      if (!this._apis) this._apis = {};
      const api = this._apis[lv.id] = this.makeApi(lv);
      lv.initDemo(panels.demo, api);
      this.renderHints(panels.challenge, lv, api);
      const challengeBody = UI.el('div', 'challenge-body');
      panels.challenge.appendChild(challengeBody);
      lv.initChallenge(challengeBody, api);
      const statusArea = UI.el('div', 'challenge-status');
      panels.challenge.appendChild(statusArea);
      api._statusArea = statusArea;
      if (rec.passed) {
        this.showPassBox(api, false); // đã pass trước đó — không confetti lại
      } else if (rec.fails > 0) {
        // hiển thị số lần fail đã tích luỹ
      }

      // SOLUTION
      if (rec.passed || rec.fails >= 3) panels.solution.appendChild(UI.md(lv.solution));
      else this.renderSolutionLocked(lv, true);
    },

    renderSolutionLocked: function (lv, inline) {
      const panel = document.getElementById('panel-solution');
      panel.innerHTML = '';
      const box = UI.el('div', 'solution-locked');
      box.innerHTML = '<div class="lock-icon">🔒</div>' +
        '<p><b>Solution chưa mở khoá.</b></p>' +
        '<p>Hãy tự thử ở tab CHALLENGE trước. Solution sẽ mở khi bạn solve, hoặc sau khi fail 3 lần.</p>' +
        '<p style="font-size:13px">Fail hiện tại: ' + Store.ensure(lv.id).fails + '/3</p>';
      panel.appendChild(box);
    },

    /* ---- API cấp cho level hook dùng ---- */
    makeApi: function (lv) {
      const self = this;
      return {
        level: lv,
        Engine: Engine,
        UI: UI,

        /** Gọi khi người chơi vượt challenge. `quiet` = không confetti (re-render) */
        pass: function () { self.onPass(lv); },
        quietPass: function () { self.showPassBox(self.apiOf(lv), false); },

        /** Gọi khi người chơi làm sai. `detail` = mô tả CHÍNH XÁC điều gì hỏng (HTML) */
        fail: function (detail) { self.onFail(lv, detail); },

        /** Ghi text vào khung output terminal trong challenge */
        _statusArea: null,
        status: function (html, cls) {
          if (this._statusArea) {
            this._statusArea.innerHTML = '';
            this._statusArea.appendChild(UI.el('div', 'status-box ' + (cls || 'status-info'), html));
          }
        }
      };
    },

    apiOf: function (lv) {
      // api instance hiện hành của level (được gán trong renderLevel)
      if (!this._apis) this._apis = {};
      return this._apis[lv.id];
    },

    onPass: function (lv) {
      const rec = Store.ensure(lv.id);
      const first = !rec.passed;
      rec.passed = true;
      rec.passedAt = rec.passedAt || Date.now();
      Store.save();
      this.showPassBox(this.apiOf(lv), first);
      if (first) {
        UI.confetti();
        // mở tab solution
        const tabsEl = document.getElementById('tabs');
        const solBtn = tabsEl.querySelectorAll('.tab-btn')[3];
        if (solBtn) {
          solBtn.classList.remove('locked');
          solBtn.textContent = '🔓 SOLUTION';
        }
        const panel = document.getElementById('panel-solution');
        panel.innerHTML = '';
        panel.appendChild(UI.md(lv.solution));
        this.renderNav();
      }
    },

    showPassBox: function (api, first) {
      const lv = api.level;
      if (!api._statusArea) return;
      api._statusArea.innerHTML = '';
      const box = UI.el('div', 'flagbox');
      box.innerHTML =
        '<div class="flag-title">' + (first ? '🎉 Chính xác! Bạn đã hoàn thành level ' + lv.id + '!' : '✅ Bạn đã hoàn thành level này trước đó.') + '</div>' +
        '<div style="margin:8px 0">Flag của bạn: <span class="flag-value">' + esc(lv.flag) + '</span></div>';
      const nextLv = this.levelById(lv.id + 1);
      if (nextLv) {
        const btn = UI.el('button', 'btn btn-primary', 'Level ' + nextLv.id + ' →');
        btn.addEventListener('click', function () { PQ.App.show(nextLv.id); });
        box.appendChild(btn);
      } else {
        box.appendChild(UI.el('div', null, '<span style="color:var(--muted)">Bạn đã đi hết các level hiện có! 🏆</span>'));
      }
      api._statusArea.appendChild(box);
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    onFail: function (lv, detailHtml) {
      const rec = Store.ensure(lv.id);
      rec.fails++;
      Store.save();
      document.querySelectorAll('.fail-count').forEach(function (el) {
        el.textContent = 'Fail: ' + rec.fails + '/3';
      });
      const api = this.apiOf(lv);
      if (api._statusArea) {
        api._statusArea.innerHTML = '';
        const box = UI.el('div', 'status-box status-err');
        box.innerHTML = '<div class="err-title">✗ CHƯA ĐÚNG</div>' + (detailHtml || '');
        const fc = UI.el('div', 'fail-count', 'Số lần sai: ' + rec.fails + '/3');
        box.appendChild(fc);
        if (rec.fails >= 3) {
          box.insertAdjacentHTML('beforeend',
            '<div style="margin-top:8px">🔓 <b>Solution đã được mở khoá</b> (tab SOLUTION). Nhưng bạn vẫn có thể thử tiếp!</div>');
          const tabsEl = document.getElementById('tabs');
          const solBtn = tabsEl.querySelectorAll('.tab-btn')[3];
          if (solBtn) { solBtn.classList.remove('locked'); solBtn.textContent = '🔓 SOLUTION'; }
          const panel = document.getElementById('panel-solution');
          panel.innerHTML = '';
          panel.appendChild(UI.md(lv.solution));
        }
        api._statusArea.appendChild(box);
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    },

    /* ---- hint drawer ---- */
    renderHints: function (panel, lv, api) {
      const rec = Store.ensure(lv.id);
      const drawer = UI.el('div', 'hint-drawer');
      drawer.appendChild(UI.el('div', 'hint-title', '💡 GỢI Ý (mở lần lượt, mỗi cây dữ hơn — dùng càng ít càng pro)'));

      const btns = UI.el('div', 'hint-btns');
      const fc = UI.el('span', 'fail-count', 'Fail: ' + rec.fails + '/3');

      for (let h = 0; h < 3; h++) {
        const btn = UI.el('button', 'btn btn-sm', 'Hint ' + (h + 1));
        if (h > 0) btn.disabled = Store.ensure(lv.id).hints < h;
        btn.addEventListener('click', function () {
          const r = Store.ensure(lv.id);
          if (r.hints <= h) r.hints = h + 1;
          Store.save();
          showHint(h);
          // enable nút tiếp theo
          btns.querySelectorAll('button').forEach(function (b, bi) {
            b.disabled = bi > Store.ensure(lv.id).hints;
          });
        });
        btns.appendChild(btn);
      }
      btns.appendChild(fc);
      drawer.appendChild(btns);

      const shown = UI.el('div');
      drawer.appendChild(shown);

      function showHint(h) {
        if (shown.children[h]) return;
        const item = UI.el('div', 'hint-item',
          '<span class="hint-tag">HINT ' + (h + 1) + ':</span> ' + esc(lv.hints[h]));
        shown.appendChild(item);
        // giữ thứ tự (nếu hint 2 hiện trước thì chèn đúng vị trí)
        const items = Array.prototype.slice.call(shown.children);
        items.sort(function (a, b) {
          return (+a.querySelector('.hint-tag').textContent.slice(-1)) - (+b.querySelector('.hint-tag').textContent.slice(-1));
        });
        items.forEach(function (it) { shown.appendChild(it); });
      }

      // restore hint đã mở từ trước
      for (let h = 0; h < Store.ensure(lv.id).hints; h++) showHint(h);

      panel.appendChild(drawer);
    }
  };
})(window.PwnQuest);
