/* ============================================================
 * PwnQuest — Level 6: Bypass canary bằng format string leak
 * ============================================================ */
window.PwnQuest = window.PwnQuest || {};
PwnQuest.levels = PwnQuest.levels || [];
PwnQuest.levels.push({
  id: 6,
  title: 'Bypass canary — leak trước, đè sau',
  goal: '2 bước: (1) dùng format string để leak canary, (2) overflow với ĐÚNG canary vừa leak + ghi đè return address về win() để lấy flag.',
  flag: 'PWN{l34k_th3n_sm4sh}',

  hints: [
    'printf(user_input) không bỏ qua % — mỗi %p in 1 giá trị lấy từ stack (thứ tự: rsi, rdx, rcx, r8, r9 rồi các ô stack). Canary nằm trên stack của hàm, nên nó là một trong các ô đó. Tìm ô có byte cuối 00.',
    'Công cụ: gõ "%1$p.%2$p.%3$p.%4$p.%5$p.%6$p.%7$p.%8$p.%9$p" để in 9 slot một lần. Slot 7 chính là canary. Ở bước 2, nhúng lại giá trị đó vào payload: 16 byte padding + canary (viết 0x...) + 4 byte rác (saved RBP) + 0x08049196.',
    'Gần như đáp án: Bước 1 gõ "%7$p" → nhận canary, ví dụ 0x9e41ab00. Bước 2 gõ: "AAAAAAAAAAAAAAAA 0x9e41ab00 BBBB 0x08049196" (khoảng trắng chỉ để phân tách token, không ghi byte). Thay giá trị canary bằng cái BẠN leak được — mỗi lần chơi canary khác nhau!'
  ],

  /* ------------------------------------------------ THEORY */
  theory: [
    '# Level 6 — Bypass canary',
    '',
    '> **TL;DR:** Canary không thể đè — nhưng có thể **đọc**. Bug format string: nếu program làm `printf(user_input)`, mỗi `%p` trong input in 1 giá trị lấy từ stack, trong đó có canary. Leak được canary → overflow viết lại ĐÚNG giá trị canary → kiểm tra `xor` cho 0 → ret bình thường → ghi đè return address thoải mái.',
    '',
    '## 1. Format string hoạt động ra sao?',
    '',
    '```c',
    'void vuln() {                      // §1',
    '    char buf[64];                  // §2',
    '    read(0, buf, 64);              // §3',
    '    printf(buf);                   // §4  BUG! phải là printf("%s", buf)',
    '    read(0, buf, 96);              // §5  lần này đọc dài hơn → overflow',
    '}                                  // §6',
    '```',
    '',
    '```asm',
    '    lea rax, [rbp-80]              ; §2  buf',
    '    mov rdi, rax                   ; §4  printf(buf) — buf là FORMAT STRING',
    '    call printf                    ; §4  gặp %p → lấy giá trị từ stack!',
    '```',
    '',
    '`printf` đọc tham số theo thứ tự: `rsi, rdx, rcx, r8, r9` rồi lần lượt các ô trên stack. `%1$p`…`%5$p` là 5 thanh ghi, **`%6$p` trở đi là stack thẳng** — đúng nơi canary nằm. Dùng `%7$p` để lấy thẳng ô thứ 7.',
    '',
    '## 2. Nhận diện canary trong đống giá trị',
    '',
    'Kết quả leak thường la liệt: địa chỉ libc (`0xf7…`), địa chỉ stack (`0xff…`), rác… Canary có **dấu vân tay**:',
    '',
    '- Byte thấp nhất luôn **`00`** (như đã học ở Level 5),',
    '- 3 byte còn lại ngẫu nhiên, thường không trông như địa chỉ.',
    '',
    '## 3. Payload hoàn chỉnh',
    '',
    '```',
    'AAAAAAAAAAAAAAAA | <canary leak> | BBBB | 0x08049196',
    '   16 padding      canary nguyên   saved    return addr',
    '                                    RBP       = win()',
    '```',
    '',
    'Khi hàm check: `xor canary_hiện_tại, canary_gốc` → **bằng 0** (vì bạn viết lại đúng) → không abort → `leave; ret` → `rip = win()` → flag. Lần đầu tiên overflow và canary **cùng lúc** phục vụ bạn!',
    '',
    '*Trong CTF thật, leak và overflow là 2 lần kết nối (process restart mỗi lần — nhưng canary của ASLR không đổi trong 1 lần chạy của forking server). Ở đây, 2 bước trong 1 màn hình.*'
  ].join('\n'),

  solution: [
    '# Solution — Level 6',
    '',
    '## Bước 1 — Leak',
    '',
    'Format string: `%7$p` (hoặc chuỗi `%1$p.%2$p…%9$p` rồi tìm ô có byte cuối `00`).',
    '',
    'Output: `canary = 0xXXXXXXXX` — mỗi lần chơi một giá trị. Đây là giá trị `fs:0x28` bị printf "tầm mát" in ra vì nó nằm trên stack đúng ở slot 7.',
    '',
    '## Bước 2 — Overflow với canary nguyên',
    '',
    'Payload (thay `0xXXXXXXXX` bằng giá trị bạn leak):',
    '',
    '```',
    'AAAAAAAAAAAAAAAA 0xXXXXXXXX BBBB 0x08049196',
    '```',
    '',
    '| Vị trí byte | Nội dung | Vai trò |',
    '|---|---|---|---|',
    '| 1–16 | `A` × 16 | lấp buffer |',
    '| 17–20 | canary leak (LE 4 byte) | **giữ canary nguyên** → xor = 0 → không abort |',
    '| 21–24 | `BBBB` | đè saved RBP (rác, không sao — `leave` gán rbp rác nhưng win() không dùng) |',
    '| 25–28 | `96 91 04 08` | return address → `win()` → flag |',
    '',
    '## Vì sao cách này hạ được canary?',
    '',
    'Canary phòng thủ được overflow **mù**, không phòng thủ được overflow **có thông tin**. Một byte `00` chặn được `strcpy` nhưng chặn không được `read` theo độ dài; sự ngẫu nhiên của 3 byte kia vô nghĩa khi bạn đã đọc được chúng. Bài học pwn lớn: **mọi cơ chế phòng thủ đều hỏi "kẻ tấn công biết gì?" — leak xoá câu hỏi đó.**'
  ].join('\n'),

  /* ------------------------------------------------ DEMO */
  initDemo: function (container, api) {
    const UI = api.UI, E = api.Engine;

    const canary = (function () { let c = 0; for (let i = 1; i < 4; i++) c |= ((Math.random() * 256) | 0) << (8 * i); return c; })();
    // printf slots: 1–5 thanh ghi, 6+ stack. Canary ở slot 7.
    const slots = [0, 0x2, 0xf7e2c123, 0xffffd0c0, 0x5, 0x0804b010, 0xffffd11f, canary, 0xffffd128, 0x080412a7];

    const box = UI.el('div', 'demo-box');
    box.appendChild(UI.el('div', 'demo-title', '🖨️ printf(user_input) — format string playground'));

    const row = UI.el('div', 'field-row');
    row.appendChild(UI.el('label', null, 'buf ='));
    const inp = UI.el('input');
    inp.type = 'text';
    inp.placeholder = '%1$p.%2$p.%3$p';
    inp.style.flex = '1';
    row.appendChild(inp);
    const runBtn = UI.el('button', 'btn btn-primary', '▶ printf');
    row.appendChild(runBtn);
    box.appendChild(row);

    const out = UI.el('div', 'output-term');
    out.innerHTML = '<span class="term-dim">// printf sẽ in output tại đây. Mẹo: %N$p in slot N, %p lần lượt từ slot 1.</span>';
    box.appendChild(out);

    const note = UI.el('div', 'step-caption');
    box.appendChild(note);
    container.appendChild(box);

    function simulatePrintf(fmt) {
      let result = '';
      let auto = 1;
      for (let i = 0; i < fmt.length; i++) {
        if (fmt[i] === '%' && fmt[i + 1] === '%') { result += '%'; i++; continue; }
        const m = fmt.slice(i).match(/^%(\d*)\$?p/);
        if (m) {
          const n = m[1] ? parseInt(m[1], 10) : auto++;
          result += n < slots.length ? E.hex(slots[n]) : '(ngoài stack)';
          i += m[0].length - 1;
          continue;
        }
        if (fmt.slice(i).match(/^%n/i)) {
          return { err: '%n ghi đè bộ nhớ — nó không in gì, nó GHI. Đây là bug nguy hiểm hơn cả leak (không dùng trong game này).' };
        }
        if (fmt.slice(i).match(/^%s/)) {
          result += '(segfault: in slot như con trỏ chuỗi)'; i += 1; continue;
        }
        result += fmt[i];
      }
      return { text: result };
    }

    function run() {
      const r = simulatePrintf(inp.value);
      if (r.err) {
        out.innerHTML = '<span class="term-err">[printf crashed]</span> ' + r.err;
        note.innerHTML = r.err;
        return;
      }
      out.innerHTML = '<span class="term-dim">printf("' + UI.esc(inp.value) + '") →</span>\n' + UI.esc(r.text);
      // phân tích giúp người học
      const leaked = r.text.match(/0x[0-9A-F]{8}/g) || [];
      const hasCanary = leaked.indexOf(E.hex(canary)) !== -1;
      if (hasCanary) {
        note.innerHTML = '🎯 Trong output có <b>' + E.hex(canary) + '</b> — đó là CANARY (byte thấp 00)! Bạn vừa leak thành công. Đây sẽ là giá trị phải nhúng vào payload ở bước 2.';
      } else {
        note.innerHTML = 'Đọc output: <code>0xf7…</code> = libc, <code>0xffff…</code> = stack, còn lại là rác. Canary là ô có byte cuối <b>00</b> và không trông như địa chỉ. Thử in hết 9 slot.';
      }
    }
    runBtn.addEventListener('click', run);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });

    const tip = UI.el('p', null, '<span style="color:var(--muted);font-size:13px">💡 Thử: <code>%p %p %p %p %p %p %p</code> — xem từ %6$p trở đi là stack. Canary của phiên này ở slot 7.</span>');
    container.appendChild(tip);
  },

  /* ------------------------------------------------ CHALLENGE */
  initChallenge: function (container, api) {
    const UI = api.UI, E = api.Engine;

    const CANARY_ADDR = 0xffd030;
    const WIN = 0x08049196;
    const RET_ADDR = 0xffd034; // lưu ý: ret nằm sau saved RBP? KHÔNG — layout 32-bit: buf, canary, savedRBP, ret
    const canary = (function () { let c = 0; for (let i = 1; i < 4; i++) c |= ((Math.random() * 256) | 0) << (8 * i); return c; })();

    const mem = new E.SimMemory({
      base: 0xffd000,
      size: 64,
      labels: [
        { name: 'char buf[16]', addr: 0xffd020, size: 16, cls: 'buf', desc: 'read lần 2 (96 byte) ghi vào đây' },
        { name: 'canary', addr: CANARY_ADDR, size: 4, cls: 'var', desc: 'Phải giữ nguyên — giá trị đã leak ở bước 1' },
        { name: 'saved RBP', addr: 0xffd034, size: 4, cls: 'rbp', desc: 'byte 21–24 — rác là được' },
        { name: 'return addr', addr: 0xffd038, size: 4, cls: 'ret', desc: 'byte 25–28 → win() = 0x08049196' }
      ]
    });

    let leakedOk = false;

    container.appendChild(UI.el('p', null,
      '<b>Bối cảnh:</b> <code>vuln()</code> có <code>printf(buf)</code> (bug!) rồi <code>read(0, buf, 96)</code>. Buffer 16 byte tại <code>0xFFD020</code>, canary tại <code>0xFFD030</code>, win() tại <code>0x08049196</code>.'));

    const box = UI.el('div', 'demo-box');
    box.appendChild(UI.el('div', 'demo-title', '🪜 Bước 1 — Leak canary bằng format string'));
    const row1 = UI.el('div', 'field-row');
    row1.appendChild(UI.el('label', null, 'Format:'));
    const leakInp = UI.el('input');
    leakInp.type = 'text';
    leakInp.placeholder = '%7$p';
    row1.appendChild(leakInp);
    const leakBtn = UI.el('button', 'btn btn-primary', '▶ printf');
    row1.appendChild(leakBtn);
    box.appendChild(row1);
    const leakOut = UI.el('div', 'output-term');
    box.appendChild(leakOut);
    const leakStatus = UI.el('div', 'step-caption', 'Canary chưa bị phát hiện. Hãy in slot chứa nó ra màn hình.');
    box.appendChild(leakStatus);
    container.appendChild(box);

    const slots = [0, 0x2, 0xf7e2c123, 0xffffd0c0, 0x5, 0x0804b010, 0xffffd11f, canary, 0xffffd128, 0x080412a7];

    function simulatePrintf(fmt) {
      let result = '';
      let auto = 1;
      for (let i = 0; i < fmt.length; i++) {
        if (fmt[i] === '%' && fmt[i + 1] === '%') { result += '%'; i++; continue; }
        const m = fmt.slice(i).match(/^%(\d*)\$?p/);
        if (m) {
          const n = m[1] ? parseInt(m[1], 10) : auto++;
          result += n < slots.length ? E.hex(slots[n]) : '(ngoài stack)';
          i += m[0].length - 1;
          continue;
        }
        result += fmt[i];
      }
      return result;
    }

    leakBtn.addEventListener('click', function () {
      const text = simulatePrintf(leakInp.value);
      leakOut.innerHTML = '<span class="term-dim">printf("' + UI.esc(leakInp.value) + '") →</span>\n' + UI.esc(text);
      if (text.indexOf(E.hex(canary)) !== -1) {
        leakedOk = true;
        leakStatus.innerHTML = '🎯 Leak thành công! Canary = <b>' + E.hex(canary) + '</b>. Giờ sang bước 2 — nhớ nhúng ĐÚNG giá trị này vào payload.';
      } else {
        leakStatus.innerHTML = 'Output không chứa canary (' + E.hex(canary) + ' — giá trị này bạn chưa nhìn thấy). Thử %7$p hoặc in hết các slot.';
      }
    });

    // ----- bước 2
    const box2 = UI.el('div', 'demo-box');
    box2.appendChild(UI.el('div', 'demo-title', '💥 Bước 2 — Overflow đúng canary + ghi đè return address'));
    container.appendChild(box2);
    const caption = UI.el('div', 'step-caption', 'Sẵn sàng. (Bạn có thể chạy bước 2 trước để xem canary chặn overflow mù quáng ra sao.)');
    box2.appendChild(caption);
    const view = UI.memView(box2, mem, { animate: true });

    function reset() {
      mem.reset();
      mem.write32(CANARY_ADDR, canary);
      mem.write32(0xffd034, 0xffd0a0);
      mem.write32(0xffd038, 0x080412a7);
    }
    reset();

    UI.payloadForm(box2, {
      label: 'Payload:',
      placeholder: 'vd: AAAA... 0x9e41ab00 BBBB 0x08049196',
      buttonLabel: '▶ Run payload',
      onRun: function (payloadText, out) {
        reset();
        const res = E.applyPayload(mem, 0xffd020, payloadText);
        view.refresh();

        if (res.errors.length) {
          const msg = res.errors.map(function (e) { return e.msg; }).join(' ');
          out.showTerm('<span class="term-err">[payload lỗi]</span> ' + msg);
          api.fail('Payload có lỗi cú pháp: ' + msg);
          return;
        }

        const cur = mem.read32(CANARY_ADDR);
        const ret = mem.read32(0xffd038);
        const term = ['<span class="term-dim">$ ./level6  &lt; payload</span>',
          'read() ghi ' + res.written + ' byte vào 0xFFD020'];

        if (cur !== canary) {
          term.push('xor canary, fs:0x28 → KHÁC');
          term.push('<span class="term-err">*** stack smashing detected ***: terminated</span>');
          out.showTerm(term.join('\n'));
          caption.innerHTML = 'Canary bị đè: ' + E.hex(canary) + ' → ' + E.describeDword(cur) + '. Bytes 17–20 của payload phải là canary ĐÃ LEAK ở bước 1' + (leakedOk ? ' (' + E.hex(canary) + ').' : ' — quay lại bước 1 nếu chưa leak.');
          api.fail('Canary hỏng: ' + E.hex(canary) + ' → ' + E.describeDword(cur) + '. Phải nhúng đúng giá trị leak được vào byte 17–20.');
          return;
        }
        if (!leakedOk) {
          // canary giữ nguyên nhưng chưa leak — không thể "trùng khớp ngẫu nhiên" trong game, coi như đã hiểu canary nhưng thiếu bước 1
          api.fail('Canary vẫn nguyên (tốt!) nhưng bạn chưa chứng minh đã LEAK nó ở bước 1 — lỗi format string mới là chìa khoá của level này. Quay lại bước 1, gõ %7$p.');
          caption.innerHTML = 'Canary nguyên nhưng bước 1 chưa hoàn thành — leak nó trước rồi mới overflow.';
          out.showTerm(term.join('\n') + '\n<span class="term-dim">(chưa có leak từ bước 1)</span>');
          return;
        }
        if (ret !== WIN) {
          let why = 'Canary OK (xor = 0 — không abort!) nhưng return address = ' + E.describeDword(ret) + ' ≠ 0x08049196. ';
          if (res.written <= 24) why += 'Payload ' + res.written + ' byte — byte 25–28 (return address) chưa được ghi. Sau canary còn saved RBP (4 byte rác) nữa mới tới return address.';
          else why += 'Vị trí byte 25–28 phải là 96 91 04 08 (hoặc &win / 0x08049196).';
          term.push('<span class="term-err">rip = ' + E.hex(ret) + ' ✗</span>');
          out.showTerm(term.join('\n'));
          caption.innerHTML = why;
          api.fail(why);
          return;
        }
        term.push('xor canary → 0 ✓ — không abort');
        term.push('leave; ret → rip = 0x08049196');
        term.push('<b>win()!</b> cat flag.txt');
        term.push('<b>PWN{l34k_th3n_sm4sh}</b>');
        out.showTerm(term.join('\n'));
        caption.innerHTML = 'Canary được giữ nguyên → check đi qua → rip = win() → FLAG! Bạn vừa bypass hàng rào Level 5.';
        api.pass();
      }
    });
  }
});
