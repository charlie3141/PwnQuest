/* ============================================================
 * PwnQuest — Level 4: Ghi đè return address → win()
 * ============================================================ */
window.PwnQuest = window.PwnQuest || {};
PwnQuest.levels = PwnQuest.levels || [];
PwnQuest.levels.push({
  id: 4,
  title: 'Ghi đè return address',
  goal: 'Nhập payload làm return address (0xFFD034) trở thành địa chỉ của win() = 0x08049196 để chương trình in flag.',
  flag: 'PWN{r3t_2_w1n}',

  hints: [
    'Trước saved RBP là 16 byte buffer; trước saved RBP nữa là return address. Vậy khoảng cách từ đầu buffer tới return address = 16 + 4 = 20 byte. Byte thứ 21–24 của payload chính là giá trị rip mới.',
    'Dùng tab DEMO: chạy cyclic 40 byte, đọc 4 ký tự nằm tại return address trong memory viewer, rồi bấm cyclicFind để tính offset (sẽ ra 20). Địa chỉ win() thì parser chấp nhận viết "0x08049196" hoặc "&win" — tự động thành 4 byte little-endian 96 91 04 08.',
    'Gần như đáp án: payload = 20 chữ "A" + "0x08049196" — tức "AAAAAAAAAAAAAAAAAAAA0x08049196". Có thể thay 0x08049196 bằng \\x96\\x91\\x04\\x08 (little-endian) hoặc &win.'
  ],

  /* ------------------------------------------------ THEORY */
  theory: [
    '# Level 4 — Ghi đè return address',
    '',
    '> **TL;DR:** Khi hàm kết thúc, `ret` pop 4 byte tại `[rbp+4]` ném vào `rip` — CPU nhảy theo **không hỏi gì cả**. Overflow cho phép bạn viết giá trị đó. Công thức payload: `<padding đủ 20 byte><địa chỉ win() little-endian>`. Trong binary thật, tìm số 20 bằng **pattern cyclic** — sinh chuỗi duy nhất từng 4 ký tự, xem 4 ký tự rơi vào rip, tra ngược ra offset.',
    '',
    '## 1. `ret` — lệnh nguy hiểm nhất x86',
    '',
    '```c',
    'void win() { printf("PWN{...}\\n"); }   // §1',
    'void vuln() {                          // §2',
    '    char buf[16];                      // §3',
    '    read(0, buf, 64);                  // §4',
    '}                                      // §5',
    '```',
    '',
    '```asm',
    'win:                           ; §1',
    '    push rbp                    ; §1',
    '    mov  rax, offset flag_str   ; §1',
    '    call puts                   ; §1  in flag',
    '    ret                         ; §1',
    'vuln:                           ; §2',
    '    push rbp                    ; §2',
    '    mov  rbp, rsp               ; §2',
    '    sub  rsp, 16                ; §3  buf[16] — offset tới ret = 20',
    '    lea  rax, [rbp-16]          ; §3',
    '    mov  edx, 64                ; §4  đọc 64 byte → tràn thoải mái',
    '    call read                   ; §4',
    '    leave                       ; §5  khôi phục rbp (cũng bị đè… chuyện đó để sau)',
    '    ret                         ; §5  pop [rbp+4] → rip: ĐIỀU BẠN KIỂM SOÁT',
    '```',
    '',
    '## 2. Tính offset bằng cyclic',
    '',
    'Không phải lúc nào cũng có source để đếm. Cách chuẩn trong CTF:',
    '',
    '1. Sinh pattern **cyclic 200 ký tự**: `aaaabaaacaaad…` — mỗi 4 ký tự liên tiếp là **duy nhất** trong toàn chuỗi.',
    '2. Gửi nó làm payload. Chương trình crash vì rip = 4 ký tự nào đó, vd `0x64616163` = `"caad"`.',
    '3. `cyclicFind("caad")` → **offset**. Từ đó, payload = `<pattern[:offset]><địa chỉ>`.',
    '',
    'Trong game này, memory viewer thay debugger: bạn đọc trực tiếp 4 byte tại return address sau khi chạy cyclic.',
    '',
    '## 3. Địa chỉ win() ghi thế nào?',
    '',
    '`win` nằm tại `0x08049196`. 4 byte trong RAM (little-endian): **`96 91 04 08`**. Payload hoàn chỉnh:',
    '',
    '```',
    'AAAAAAAAAAAAAAAAAAAA\\x96\\x91\\x04\\x08',
    '```',
    '',
    '20 byte padding (chưa đụng saved RBP có also, đè luôn cũng không sao ở đây) + 4 byte địa chỉ. Nhưng cẩn thận **ghi đúng 24 byte, không hơn**: byte thừa sẽ đè tiếp lên frame của `main` — và khi `main` chết, flag của bạn cũng thế.'
  ].join('\n'),

  solution: [
    '# Solution — Level 4',
    '',
    '## Payload',
    '',
    '```',
    'AAAAAAAAAAAAAAAAAAAA0x08049196',
    '```',
    '',
    'tương đương: `AAAAAAAAAAAAAAAAAAAA\\x96\\x91\\x04\\x08` hoặc `AAAAAAAAAAAAAAAAAAAA&win`.',
    '',
    '## Giải thích từng bước',
    '',
    '| Vị trí byte | Nội dung | Ghi vào | Vì sao |',
    '|---|---|---|---|',
    '| 1–16 | `A` × 16 | buf @ `0xFFD020` | padding lấp buffer |',
    '| 17–20 | `A` × 4 | saved RBP @ `0xFFD030` | cần vượt qua nó để tới return address (ở demo này `leave` trước `ret` nên rbp rác chưa chết ngay) |',
    '| 21–24 | `96 91 04 08` | **return address** @ `0xFFD034` | địa chỉ win() viết little-endian |',
    '',
    '**Offset 20 từ đâu ra?** buf dài 16 (byte 1–16) + saved RBP 4 byte (17–20) → return address bắt đầu ở byte **21**. Kiểm chứng bằng cyclic ở tab DEMO: 4 ký tự rơi vào 0xFFD034 là `"faaa"`, `cyclicFind("faaa") = 20`.',
    '',
    '## Sau khi ret',
    '',
    '`leave` pop saved RBP rác (chưa sao), `ret` pop `0x08049196` vào `rip` → CPU "nhảy" vào giữa `win()`, không qua `call` — nhưng win() không cần tham số, nên nó mượt mà in flag:',
    '',
    '```',
    '$ ./level4 < payload',
    'PWN{r3t_2_w1n}',
    '```',
    '',
    'Đây chính là kỹ thuật **ret2win** — dạng ret2libc đơn giản nhất. Level 7 sẽ tổng quát lên ROP: khi không có win() sẵn, tự ghép gadget.'
  ].join('\n'),

  /* ------------------------------------------------ DEMO */
  initDemo: function (container, api) {
    const UI = api.UI, E = api.Engine;

    const mem = new E.SimMemory({
      base: 0xffd000,
      size: 64,
      labels: [
        { name: 'char buf[16]', addr: 0xffd020, size: 16, cls: 'buf', desc: '' },
        { name: 'saved RBP', addr: 0xffd030, size: 4, cls: 'rbp', desc: 'byte 17–20 của payload' },
        { name: 'return addr', addr: 0xffd034, size: 4, cls: 'ret', desc: 'byte 21–24 — rip mới của CPU' },
        { name: 'caller frame', addr: 0xffd038, size: 8, cls: 'caller', desc: 'đè vào đây là crash khi main kết thúc' }
      ]
    });
    const RET = 0xffd034;

    const box = UI.el('div', 'demo-box');
    box.appendChild(UI.el('div', 'demo-title', '🧵 Cyclic pattern — tìm offset tới return address'));

    const controls = UI.el('div', 'field-row');
    const genBtn = UI.el('button', 'btn btn-primary', '▶ Chạy cyclic 40 byte');
    controls.appendChild(genBtn);
    box.appendChild(controls);

    const caption = UI.el('div', 'step-caption', 'Bấm nút để ghi pattern cyclic 40 byte vào buffer và xem 4 byte nào rơi vào return address.');
    box.appendChild(caption);

    // công cụ cyclicFind
    const findRow = UI.el('div', 'field-row');
    findRow.appendChild(UI.el('label', null, '4 ký tự tại ret:'));
    const findInp = UI.el('input');
    findInp.type = 'text';
    findInp.placeholder = 'vd: ueaa';
    findInp.maxLength = 4;
    findRow.appendChild(findInp);
    const findBtn = UI.el('button', 'btn', '🔍 cyclicFind');
    findRow.appendChild(findBtn);
    const findOut = UI.el('span', null, '');
    findOut.style.cssText = 'font-family:var(--mono);font-size:13px;color:var(--yellow)';
    findRow.appendChild(findOut);
    box.appendChild(findRow);

    container.appendChild(box);
    const view = UI.memView(box, mem, { animate: true });

    genBtn.addEventListener('click', function () {
      mem.reset();
      mem.write32(0xffd030, 0xffd0a0);
      mem.write32(RET, 0x080412a7);
      const pat = E.cyclic(0, 40);
      mem.write(0xffd020, pat.split('').map(function (c) { return c.charCodeAt(0); }));
      view.refresh();
      const atRet = mem.read(RET, 4).map(function (b) { return String.fromCharCode(b); }).join('');
      caption.innerHTML = 'Pattern 40 byte: <code>aaaabaaacaaa…</code> — 4 byte tại return address (' + E.hex(RET, 6) + ') là <b>"' + atRet + '"</b>. Nhập chúng vào ô cyclicFind → offset chính là số byte padding cần thiết.';
      findInp.value = atRet;
    });

    findBtn.addEventListener('click', function () {
      const v = findInp.value.trim();
      if (v.length !== 4) { findOut.textContent = '(cần đúng 4 ký tự)'; return; }
      const off = E.cyclicFind(v);
      findOut.textContent = off === -1 ? '" ' + v + '" không có trong pattern' : 'offset = ' + off;
    });
  },

  /* ------------------------------------------------ CHALLENGE */
  initChallenge: function (container, api) {
    const UI = api.UI, E = api.Engine;

    const SYMBOLS = { win: 0x08049196, main: 0x080412a0 };
    const WIN = 0x08049196;
    const RET = 0xffd034;

    const mem = new E.SimMemory({
      base: 0xffd000,
      size: 64,
      labels: [
        { name: 'char buf[16]', addr: 0xffd020, size: 16, cls: 'buf', desc: '' },
        { name: 'saved RBP', addr: 0xffd030, size: 4, cls: 'rbp', desc: 'byte 17–20' },
        { name: 'return addr', addr: 0xffd034, size: 4, cls: 'ret', desc: 'byte 21–24 — mục tiêu' },
        { name: 'caller frame', addr: 0xffd038, size: 8, cls: 'caller', desc: '' }
      ]
    });

    container.appendChild(UI.el('p', null,
      '<b>Nhiệm vụ (ret2win):</b> chương trình có hàm <code>win()</code> tại <code>0x08049196</code> (in flag nhưng không bao giờ được gọi). ' +
      '<code>char buf[16]</code> tại <code>0xFFD020</code>, <code>read(0, buf, 64)</code>. ' +
      'Nhập payload ghi đè return address tại <code>0xFFD034</code> thành <code>0x08049196</code>. ' +
      'Parser hỗ trợ: <code>0x08049196</code>, <code>\\x96\\x91\\x04\\x08</code>, <code>&win</code>.'));

    const box = UI.el('div', 'demo-box');
    const caption = UI.el('div', 'step-caption', 'return address hiện tại = 0x080412A7 (lệnh sau call trong main).');
    box.appendChild(caption);
    container.appendChild(box);
    const view = UI.memView(box, mem, { animate: true });

    UI.payloadForm(container, {
      label: 'Payload:',
      placeholder: 'vd: AAAA... &win',
      buttonLabel: '▶ Run payload',
      onRun: function (payloadText, out) {
        mem.reset();
        mem.write32(0xffd030, 0xffd0a0);
        mem.write32(RET, 0x080412a7);

        const res = E.applyPayload(mem, 0xffd020, payloadText, SYMBOLS);
        const ret = mem.read32(RET);
        view.refresh();

        if (res.errors.length) {
          const msg = res.errors.map(function (e) { return e.msg; }).join(' ');
          out.showTerm('<span class="term-err">[payload lỗi]</span> ' + msg);
          api.fail('Payload có lỗi cú pháp: ' + msg);
          return;
        }

        const term = ['<span class="term-dim">$ ./level4  &lt; payload</span>',
          'read() ghi ' + res.written + ' byte vào 0xFFD020',
          'leave; ret → rip = ' + E.hex(ret)];

        if (ret === WIN && res.written === 24) {
          term.push('<b>win()!</b>');
          term.push('cat flag.txt');
          term.push('<b>PWN{r3t_2_w1n}</b>');
          out.showTerm(term.join('\n'));
          caption.innerHTML = 'rip = 0x08049196 → CPU nhảy vào win() → flag in ra màn hình!';
          api.pass();
          return;
        }

        let why;
        if (res.written <= 20) {
          why = 'Payload <b>' + res.written + ' byte</b> — return address (byte 21–24) chưa bị chạm. rip vẫn = 0x080412A7, chương trình thoát bình thường.';
        } else if (ret === 0x41414141 || ret === 0x0a0a0a0a) {
          why = '<b>SEGFAULT</b>: return address = ' + E.describeDword(ret) + ' — CPU nhảy tới địa chỉ rác. Bạn đã đè được ret nhưng chưa ghi địa chỉ win() (0x08049196 = byte 96 91 04 08) vào vị trí 21–24.';
        } else if (res.written > 24) {
          why = 'return address = ' + E.hex(ret) + ' — gần đúng nhưng payload dài <b>' + res.written + ' byte</b>, byte thừa đè tiếp lên frame của main → main chết ngay sau win(). Cắt payload lại đúng 24 byte.';
        } else {
          why = 'return address = ' + E.hex(ret) + ' ≠ 0x08049196. 4 byte bạn ghi tại vị trí 21–24 là ' + E.byteStr(mem.read(RET, 4)) + '. Cần đúng 96 91 04 08 (little-endian của 0x08049196 — hoặc dùng &win).';
        }
        term.push('<span class="term-err">rip = ' + E.hex(ret) + ' ✗ (cần 0x08049196)</span>');
        out.showTerm(term.join('\n'));
        caption.innerHTML = why;
        api.fail(why);
      }
    });
  }
});
