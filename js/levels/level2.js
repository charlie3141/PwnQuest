/* ============================================================
 * PwnQuest — Level 2: Ghi chuỗi vào stack
 * ============================================================ */
window.PwnQuest = window.PwnQuest || {};
PwnQuest.levels = PwnQuest.levels || [];
PwnQuest.levels.push({
  id: 2,
  title: 'Ghi chuỗi vào stack',
  goal: 'Nhập payload làm 4 byte saved RBP (tại 0xFFD030) trở thành 0x42424242 — tức 4 chữ \'B\'.',
  flag: 'PWN{str1ng_0v3rfl0w}',

  hints: [
    'Buffer chỉ 16 byte nhưng không có gì ngăn bạn ghi DÀI hơn. Mỗi chữ cái bạn gõ = 1 byte ghi liên tiếp từ đầu buffer. Byte thứ 17 sẽ nằm ngay ở ô đầu tiên của saved RBP.',
    'Muốn saved RBP = 0x42424242 thì 4 byte đó phải là \'B\' \'B\' \'B\' \'B\' (mỗi B = 0x42). Vậy payload = 16 ký tự lấp đầy buffer + "BBBB".',
    'Gần như đáp án: payload là "AAAAAAAAAAAAAAAA" (16 chữ A) + "BBBB" — tổng 20 ký tự. Dán vào ô payload và bấm Run.'
  ],

  /* ------------------------------------------------ THEORY */
  theory: [
    '# Level 2 — Ghi chuỗi vào stack',
    '',
    '> **TL;DR:** Chuỗi trong bộ nhớ = dãy byte ASCII nằm **liên tiếp**, không có "hàng rào" giữa các biến. Hàm `strcpy`/`read` ghi đúng **số byte bạn đưa vào**, không hỏi buffer rộng bao nhiêu. Ghi quá 16 byte vào buffer 16 byte? 4 byte dư nằm đè lên saved RBP, byte 21–24 đè return address. Không crash, không cảnh báo — chỉ là byte bị ghi đè.',
    '',
    '## 1. Chuỗi nằm trong bộ nhớ thế nào?',
    '',
    '```c',
    'char buf[16];              // §1',
    'strcpy(buf, "hi");         // §2',
    '```',
    '',
    '```asm',
    'sub  rsp, 32               ; §1  cấp 16 byte cho buf',
    'lea  rax, [rbp-32]         ; §1  rax = địa chỉ buf',
    'mov  WORD PTR [rax], 0x6948 ; §2  ghi \'H\' \'i\' = 48 69',
    'mov  BYTE PTR [rax+2], 0    ; §2  byte cuối: NUL 00 — kết thúc chuỗi',
    '```',
    '',
    '`"hi"` chiếm **3 byte**: `48 69 00`. Buffer vẫn còn 13 byte trống phía sau.',
    '',
    '## 2. Ghi dài hơn buffer thì sao?',
    '',
    'Bây giờ người dùng nhập 20 ký tự:',
    '',
    '```c',
    'char buf[16];                        // §3',
    'read(0, buf, 100);                   // §3  đọc tới 100 byte vào buf!',
    '```',
    '',
    '```asm',
    'lea  rax, [rbp-32]         ; §3  buf — 16 byte',
    'mov  edx, 100              ; §3  …nhưng cho phép đọc 100',
    'mov  rsi, rax              ; §3',
    'mov  edi, 0                ; §3  stdin',
    'call read                  ; §3  ghi đè hết mọi thứ phía trên buf',
    '```',
    '',
    '`read` **không biết** buf chỉ có 16 byte — nó ghi tới khi hết input. Stack mọc xuống nên byte thứ 17 rơi vào ô NGAY TRÊN buffer: saved RBP. Byte 21–24: return address.',
    '',
    '## 3. Trực quan hoá',
    '',
    '```',
    'byte:    1  2  3 ... 16 | 17 18 19 20 | 21 ... 24',
    'nơi tới: buf[0]..buf[15]| SAVED RBP   | RETURN ADDR',
    '                          ^--- tràn!     ^--- jackpot',
    '```',
    '',
    'Đây là toàn bộ "phép thuật" của buffer overflow: **không có kiểm tra biên nào**, và các biến **nằm kề nhau** trên stack. Level này bạn sẽ tự tay ghi đè saved RBP; Level 3 ghi đè biến int; Level 4 tới lượt return address.'
  ].join('\n'),

  solution: [
    '# Solution — Level 2',
    '',
    '## Payload',
    '',
    '```',
    'AAAAAAAAAAAAAAAABBBB',
    '```',
    '',
    '## Giải thích từng bước',
    '',
    '| Phần | Byte | Ghi vào đâu |',
    '|---|---|---|',
    '| `AAAAAAAAAAAAAAAA` (16 chữ A) | `41` × 16 | lấp đầy `buf[0..15]` @ `0xFFD020` |',
    '| `BBBB` (4 chữ B) | `42` × 4 | tràn lên **saved RBP** @ `0xFFD030` |',
    '',
    'Sau khi chạy, saved RBP = `42 42 42 42` → đọc little-endian thành **0x42424242**. Mục tiêu đạt.',
    '',
    '## Tại sao offset là 16?',
    '',
    'Vì buf khai báo `char buf[16]` và **nằm ngay dưới** saved RBP (xem memory viewer: buf @ 0xFFD020 dài 16 byte, saved RBP @ 0xFFD030). Khoảng cách từ đầu buf tới saved RBP đúng bằng kích thước buf: **16 byte**. Trong binary thật bạn tìm offset này bằng disassembly (`sub rsp, 0x10` → 0x10 = 16) hoặc pattern cyclic (Level 4 sẽ dạy).',
    '',
    '## Tại sao dùng \'B\'?',
    '',
    'Vì \'B\' = `0x42` → 4 byte `42 42 42 42` đọc LE ra đúng `0x42424242`. Nếu đề bài đòi giá trị khác (vd `0x44434241`) thì phải dùng `\\x41\\x42\\x43\\x44` — byte THẤP ghi TRƯỚC (little-endian, Level 0).'
  ].join('\n'),

  /* ------------------------------------------------ DEMO */
  initDemo: function (container, api) {
    const UI = api.UI, E = api.Engine;

    const mem = new E.SimMemory({
      base: 0xffd000,
      size: 64,
      labels: [
        { name: 'char buf[16]', addr: 0xffd020, size: 16, cls: 'buf', desc: 'Buffer 16 byte — nơi strcpy/read ghi vào' },
        { name: 'saved RBP', addr: 0xffd030, size: 4, cls: 'rbp', desc: 'Ngay trên buffer — nạn nhân đầu tiên của overflow' },
        { name: 'return addr', addr: 0xffd034, size: 4, cls: 'ret', desc: 'Mục tiêu của Level 4!' },
        { name: 'caller frame', addr: 0xffd038, size: 8, cls: 'caller', desc: 'Vùng của hàm gọi' }
      ]
    });
    mem.write32(0xffd030, 0xffd0a0);   // saved RBP ban đầu
    mem.write32(0xffd034, 0x080412a7); // return address ban đầu

    const box = UI.el('div', 'demo-box');
    box.appendChild(UI.el('div', 'demo-title', '⌨️ Gõ gì vào đây là byte đó được ghi vào buffer — xem trực tiếp'));

    const row = UI.el('div', 'field-row');
    row.appendChild(UI.el('label', null, 'Chuỗi:'));
    const inp = UI.el('input');
    inp.type = 'text';
    inp.placeholder = 'hello';
    inp.style.flex = '1';
    row.appendChild(inp);
    const clearBtn = UI.el('button', 'btn', '↺ Reset');
    row.appendChild(clearBtn);
    box.appendChild(row);

    const stat = UI.el('div', 'step-caption');
    box.appendChild(stat);
    container.appendChild(box);

    const view = UI.memView(box, mem, { animate: true });

    function render(input) {
      mem.reset();
      mem.write32(0xffd030, 0xffd0a0);
      mem.write32(0xffd034, 0x080412a7);
      const res = E.applyPayload(mem, 0xffd020, input);
      const n = res.bytes.length;
      const over = Math.max(0, n - 16);
      let html = 'Ghi <b>' + n + '</b> byte từ 0xFFD020. ';
      if (n === 0) html += 'Buffer đang trống.';
      else if (over === 0) html += 'Vẫn nằm gọn trong buffer 16 byte — <b>còn dư ' + (16 - n) + ' byte</b>.';
      else {
        html += '<span style="color:var(--red)">⚠ Tràn ' + over + ' byte qua saved RBP!</span> 4 byte tại 0xFFD030 giờ là ' +
          E.describeDword(mem.read32(0xffd030)) + '.';
      }
      if (n > 20) {
        html += '<br><span style="color:var(--pink)">💥 Bạn còn đè cả return address (Level 4 sẽ lợi dụng điều này)!</span>';
      }
      stat.innerHTML = html;
      view.refresh();
    }
    inp.addEventListener('input', function () { render(inp.value); });
    clearBtn.addEventListener('click', function () { inp.value = ''; render(''); inp.focus(); });

    render('hello');
    container.appendChild(UI.el('p', null, '<span style="color:var(--muted);font-size:13px">Thử gõ đúng 16 ký tự rồi thêm "BBBB" — xem ô vàng saved RBP đổi thành 42 42 42 42.</span>'));
  },

  /* ------------------------------------------------ CHALLENGE */
  initChallenge: function (container, api) {
    const UI = api.UI, E = api.Engine;

    const mem = new E.SimMemory({
      base: 0xffd000,
      size: 64,
      labels: [
        { name: 'char buf[16]', addr: 0xffd020, size: 16, cls: 'buf', desc: 'Buffer 16 byte' },
        { name: 'saved RBP', addr: 0xffd030, size: 4, cls: 'rbp', desc: 'Mục tiêu: làm nó thành 0x42424242' },
        { name: 'return addr', addr: 0xffd034, size: 4, cls: 'ret', desc: 'Cẩn thận — đè nhầm cái này là crash' },
        { name: 'caller frame', addr: 0xffd038, size: 8, cls: 'caller', desc: '' }
      ]
    });

    const RBP_ADDR = 0xffd030;
    const GOAL = 0x42424242;

    container.appendChild(UI.el('p', null,
      '<b>Nhiệm vụ:</b> chương trình có <code>read(0, buf, 100)</code> với <code>char buf[16]</code> tại <code>0xFFD020</code>. ' +
      'Hãy nhập payload (một chuỗi ký tự — mỗi ký tự = 1 byte) làm <b>saved RBP tại <code>0xFFD030</code> trở thành <code>0x42424242</code></b>. ' +
      'Không được đè return address thành rác (tràn quá 20 byte là loi).'.replace('là loi', 'là lỗi')));

    const box = UI.el('div', 'demo-box');
    const caption = UI.el('div', 'step-caption', 'Sẵn sàng. Saved RBP hiện tại = 0xFFD0A0.');
    box.appendChild(caption);
    container.appendChild(box);

    const view = UI.memView(box, mem, { animate: true });

    UI.payloadForm(container, {
      label: 'Payload:',
      placeholder: 'gõ payload rồi Enter hoặc bấm Run',
      buttonLabel: '▶ Run payload',
      onRun: function (payloadText, out) {
        mem.reset();
        mem.write32(0xffd030, 0xffd0a0);
        mem.write32(0xffd034, 0x080412a7);

        const res = E.applyPayload(mem, 0xffd020, payloadText);
        view.refresh();

        if (res.errors.length) {
          out.showTerm('<span class="term-err">[payload lỗi]</span> ' + res.errors.map(function (e) { return e.msg; }).join(' '));
          api.fail('Payload có lỗi cú pháp: ' + res.errors.map(function (e) { return UI.esc(e.msg); }).join(' '));
          return;
        }

        const rbp = E.readLabel(mem, 'saved RBP');
        const term = ['<span class="term-dim">$ ./level2  &lt; payload</span>',
          'read() ghi ' + res.written + ' byte vào 0xFFD020'];

        if (rbp.value === GOAL) {
          term.push('saved RBP @ 0xFFD030 = 42 42 42 42 → <b>0x42424242 ✓</b>');
          out.showTerm(term.join('\n'));
          caption.innerHTML = 'Saved RBP bị ghi đè thành 0x42424242 — đúng mục tiêu!';
          api.pass();
          return;
        }

        // fail — mô tả CHÍNH XÁC điều gì hỏng
        const retv = mem.read32(0xffd034);
        let why;
        if (res.written <= 16) {
          why = 'Payload chỉ <b>' + res.written + ' byte</b> — chưa chạm tới saved RBP (cần tràn qua 16 byte buffer). Saved RBP vẫn = 0xFFD0A0.';
        } else if (res.written > 20) {
          why = 'Payload dài <b>' + res.written + ' byte</b> — tràn quá xa, return address bị đè thành ' + E.describeDword(retv) + ' → chương trình CRASH trước khi kịp đọc saved RBP.';
        } else {
          why = 'Bạn đã chạm saved RBP nhưng nó = <b>' + E.describeDword(rbp.value) + '</b>, không phải 0x42424242. 4 byte ở vị trí 17–20 của payload (' +
            E.byteStr(rbp.bytes) + ') phải là 42 42 42 42 — tức 4 chữ \'B\'.';
        }
        term.push('<span class="term-err">saved RBP = ' + E.hex(rbp.value) + ' ✗ (cần 0x42424242)</span>');
        out.showTerm(term.join('\n'));
        caption.innerHTML = why;
        api.fail(why);
      }
    });
  }
});
