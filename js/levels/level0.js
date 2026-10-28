/* ============================================================
 * PwnQuest — Level 0: Registers & Hex
 * ============================================================ */
window.PwnQuest = window.PwnQuest || {};
PwnQuest.levels = PwnQuest.levels || [];
PwnQuest.levels.push({
  id: 0,
  title: 'Registers & Hex',
  goal: 'Trả lời đúng 3 câu trắc nghiệm + điền đúng 1 giá trị hex về thanh ghi và endianness.',
  flag: 'PWN{h3x_1s_r34d4bl3}',

  hints: [
    'Hex chỉ là cách viết số cơ 16: mỗi chữ số hex = 4 bit, 2 chữ số = 1 byte. ASCII: chữ cái thường/hoa nằm quanh 0x41–0x7A. Little-endian = byte ÍT quan trọng nhất nằm ở địa chỉ THẤP nhất.',
    'Dùng converter ở tab DEMO để tra mã ASCII (gõ 41 vào ô Hex). Với endianness, dùng panel bên dưới: 0x1337 → byte thấp là 0x37, và byte thấp nằm ở địa chỉ thấp nhất.',
    'Gần như đáp án: C1 = 0x41. C2 = "địa chỉ đỉnh stack hiện tại". C3 = 37 13 00 00. C4 (mã hex của chữ P) = 0x50.'
  ],

  /* ------------------------------------------------ THEORY */
  theory: [
    '# Level 0 — Registers & Hex',
    '',
    '> **TL;DR:** CPU chỉ biết số, và hacker viết số bằng **hex** (cơ 16). Mỗi chữ số hex = 4 bit, **2 chữ số = 1 byte**. x86 lưu số nhiều byte theo **little-endian**: byte *ít quan trọng nhất* nằm ở địa chỉ *thấp* nhất. Nhớ 3 thanh ghi là đủ để bắt đầu: `rip` (đang chạy lệnh nào), `rsp` (đỉnh stack), `rbp` (mốc của stack frame hiện tại).',
    '',
    '## 1. Hex — ngôn ngữ của pwner',
    '',
    'Hex là cơ 16: `0–9` rồi `A=10, B=11, ..., F=15`. Một byte viết bằng đúng 2 chữ số hex:',
    '',
    '- `0x41` = 4×16 + 1 = **65** = chữ **\'A\'** trong bảng ASCII',
    '- `0xFF` = 255 — giá trị lớn nhất của 1 byte',
    '- `0xDEADBEEF` = 4 byte: `DE AD BE EF`',
    '',
    'Trong pwn, **mọi thứ đều là byte**: địa chỉ, chuỗi, shellcode. Nên phải đọc hex thành thạo như đọc tiếng mẹ đẻ.',
    '',
    '## 2. Thanh ghi quan trọng',
    '',
    'Thanh ghi = ô nhớ nằm *trong* CPU, siêu nhanh. Trên x86-64:',
    '',
    '| Thanh ghi | Vai trò |',
    '|---|---|',
    '| `rip` | con trỏ lệnh — CPU đang thực thi lệnh tại địa chỉ này. **Đây là "mục tiêu" của hầu hết attack!** |',
    '| `rsp` | stack pointer — địa chỉ đỉnh stack (nơi giá trị thấp nhất của frame hiện tại) |',
    '| `rbp` | base pointer — mốc trên của stack frame hàm đang chạy |',
    '| `rax` | thanh ghi đa dụng — chứa giá trị trả về của hàm |',
    '| `rdi`, `rsi` | tham số thứ 1, 2 khi gọi hàm |',
    '',
    '*Tên `e...` (eax, esp...) là bản 32-bit của cùng thanh ghi đó.*',
    '',
    '## 3. Endianness — byte nào đứng trước?',
    '',
    'Một giá trị 4 byte như `0xDEADBEEF` phải nằm ở **4 ô nhớ** liên tiếp. Câu hỏi: byte nào nằm ở địa chỉ thấp? x86 chọn **little-endian**:',
    '',
    '```c',
    'unsigned int x = 0xdeadbeef;   // §1',
    '```',
    '',
    '```asm',
    'mov dword ptr [rbp-4], 0xdeadbeef   ; §1',
    '```',
    '',
    'Trong bộ nhớ tại `[rbp-4]` sẽ là: **`EF BE AD DE`** — đảo ngược! Byte `EF` (ít quan trọng nhất) nằm ở địa chỉ thấp nhất. Đây là lý do khi bạn viết payload `0x08049196`, thực tế phải gửi `\\x96\\x91\\x04\\x08`.',
    '',
    'Big-endian (ngược lại) dùng trong network byte order — bạn sẽ gặp khi đọc Wireshark, nhưng trên x86 thì cứ nhớ: **nhỏ trước, to sau.**'
  ].join('\n'),

  solution: [
    '# Solution — Level 0',
    '',
    '**C1.** Mã ASCII của \'A\' là `0x41` (65). Tra bằng converter ở tab DEMO: gõ `41` vào ô Hex → hiện chữ A. Đây cũng là lý do payload toàn `AAAA` khi test overflow — mỗi A là byte `0x41`.',
    '',
    '**C2.** `rsp` (stack pointer) chứa **địa chỉ đỉnh stack hiện tại** — ranh giới dưới cùng của vùng nhớ mà hàm đang dùng. Khi `push`, `rsp` giảm; khi `pop`, `rsp` tăng (stack mọc downwards).',
    '',
    '**C3.** Little-endian: `0x1337` → byte thấp `0x37` ở địa chỉ thấp nhất, rồi `0x13`, rồi hai byte `00` đệm lên 4 byte: **`37 13 00 00`**. Đây chính là cách `0x1337` nằm trong RAM của máy x86.',
    '',
    '**C4.** Chữ `P` có mã ASCII 80 = **`0x50`**. Kiểm tra: `0x50` = 5×16 = 80. (Và vì thế `PWN{...}` bắt đầu bằng byte `50 57 4e`.)',
    '',
    '## Vì sao level này quan trọng?',
    '',
    'Từ level 3 trở đi, payload của bạn toàn hex: padding `\\x41`, địa chỉ `\\x50\\x91\\x04\\x08`... Nếu không rut thạo endian và ASCII, bạn sẽ viết ngược payload mà không biết. Bây giờ bạn đã có nền tảng.'
  ].join('\n'),

  /* ------------------------------------------------ DEMO */
  initDemo: function (container, api) {
    const E = api.Engine, UI = api.UI;

    // --- Converter hex/dec/ASCII ---
    const box1 = UI.el('div', 'demo-box');
    box1.appendChild(UI.el('div', 'demo-title', '🔁 Converter: Hex ↔ Dec ↔ ASCII'));
    const grid = UI.el('div', 'conv-grid');

    const inHex = UI.el('input'); inHex.type = 'text'; inHex.placeholder = '41';
    const inDec = UI.el('input'); inDec.type = 'text'; inDec.placeholder = '65';
    const inChar = UI.el('input'); inChar.type = 'text'; inChar.placeholder = 'A'; inChar.maxLength = 4;

    function parseHexField(s) {
      s = String(s || '').trim().replace(/^0x/i, '');
      return /^[0-9a-fA-F]{1,2}$/.test(s) ? parseInt(s, 16) : NaN;
    }
    function syncFromHex() {
      const v = parseHexField(inHex.value);
      if (!isNaN(v)) {
        inDec.value = String(v);
        inChar.value = E.isPrintable(v) ? String.fromCharCode(v) : '(không in được)';
      }
    }
    function syncFromDec() {
      const v = E.parseNum(inDec.value);
      if (!isNaN(v) && v >= 0 && v <= 255) {
        inHex.value = E.hexByte(v);
        inChar.value = E.isPrintable(v) ? String.fromCharCode(v) : '(không in được)';
      }
    }
    function syncFromChar() {
      if (inChar.value.length === 1) {
        const c = inChar.value.charCodeAt(0);
        inHex.value = E.hexByte(c);
        inDec.value = String(c);
      }
    }
    inHex.addEventListener('input', syncFromHex);
    inDec.addEventListener('input', syncFromDec);
    inChar.addEventListener('input', syncFromChar);

    function cell(label, input) {
      const d = UI.el('div', 'conv-cell');
      d.appendChild(UI.el('label', null, label));
      d.appendChild(input);
      return d;
    }
    grid.appendChild(cell('HEX (2 chữ số)', inHex));
    grid.appendChild(cell('DECIMAL', inDec));
    grid.appendChild(cell('ASCII', inChar));
    box1.appendChild(grid);
    box1.appendChild(UI.el('p', null, '<span style="color:var(--muted);font-size:13px">Gõ vào ô bất kỳ, 2 ô còn lại tự cập nhật. Thử: 41, 50, 7e, de.</span>'));
    container.appendChild(box1);

    // --- Endianness visualizer ---
    const box2 = UI.el('div', 'demo-box');
    box2.appendChild(UI.el('div', 'demo-title', '↔ Endianness: cùng 1 giá trị, 2 cách nằm trong bộ nhớ'));

    const row = UI.el('div', 'field-row');
    row.appendChild(UI.el('label', null, 'Giá trị 32-bit:'));
    const endianInput = UI.el('input'); endianInput.type = 'text'; endianInput.value = '0xdeadbeef';
    row.appendChild(endianInput);
    box2.appendChild(row);

    const leRow = UI.el('div', 'endian-row');
    const beRow = UI.el('div', 'endian-row');
    box2.appendChild(leRow);
    box2.appendChild(beRow);
    const note = UI.el('p', null, '');
    note.style.fontSize = '13px';
    note.style.color = 'var(--muted)';
    box2.appendChild(note);

    function renderEndian() {
      const v = E.parseNum(endianInput.value);
      leRow.innerHTML = ''; beRow.innerHTML = '';
      if (isNaN(v) || v < 0 || v > 0xffffffff) {
        note.textContent = 'Nhập giá trị hex 32-bit hợp lệ (vd 0x1337).';
        return;
      }
      const le = E.leBytes(v, 4);           // địa chỉ thấp -> byte thấp
      const be = le.slice().reverse();
      leRow.appendChild(UI.el('span', 'endian-label', 'LITTLE-ENDIAN (x86) →'));
      beRow.appendChild(UI.el('span', 'endian-label', 'BIG-ENDIAN (network) →'));
      const base = 0x1000;
      le.forEach(function (b, i) {
        const d = UI.el('div', 'endian-byte', E.hexByte(b) + '<span class="byte-addr">' + E.hex(base + i, 4) + '</span>');
        d.title = 'byte ' + E.hexByte(b) + ' tại địa chỉ ' + E.hex(base + i, 4);
        leRow.appendChild(d);
      });
      be.forEach(function (b, i) {
        const d = UI.el('div', 'endian-byte', E.hexByte(b) + '<span class="byte-addr">' + E.hex(base + i, 4) + '</span>');
        beRow.appendChild(d);
      });
      note.innerHTML = 'Byte <code style="color:var(--yellow)">' + E.hexByte(v & 0xff) + '</code> (ít quan trọng nhất) nằm ở địa chỉ thấp nhất 0x1000 → little-endian. Đây là thứ tự bạn phải dùng trong payload!';
    }
    endianInput.addEventListener('input', renderEndian);
    renderEndian();
    container.appendChild(box2);
  },

  /* ------------------------------------------------ CHALLENGE */
  initChallenge: function (container, api) {
    const UI = api.UI, E = api.Engine;

    const qs = [
      {
        text: 'Câu 1: Mã ASCII của chữ \'A\' là bao nhiêu?',
        type: 'radio',
        options: ['0x40', '0x41', '0x42', '0x61'],
        answer: 1
      },
      {
        text: 'Câu 2: Thanh ghi rsp đang chứa gì?',
        type: 'radio',
        options: [
          'Giá trị trả về của hàm hiện tại',
          'Địa chỉ đỉnh stack hiện tại',
          'Địa chỉ lệnh đang được thực thi',
          'Số byte còn trống của stack'
        ],
        answer: 1
      },
      {
        text: 'Câu 3: Trên x86 (little-endian), giá trị 0x1337 nằm trong bộ nhớ theo thứ tự byte nào? (đọc từ địa chỉ thấp → cao)',
        type: 'radio',
        options: ['13 37 00 00', '00 00 13 37', '37 13 00 00', '00 00 37 13'],
        answer: 2
      },
      {
        text: 'Câu 4 (điền): Mã hex của chữ \'P\' là bao nhiêu? (viết dạng 0x__ hoặc __)',
        type: 'text',
        answer: 0x50
      }
    ];

    const form = UI.el('div');
    const inputs = [];

    qs.forEach(function (q, qi) {
      const box = UI.el('div', 'quiz-q');
      box.dataset.qi = qi;
      box.appendChild(UI.el('div', 'q-text', q.text));
      if (q.type === 'radio') {
        q.options.forEach(function (opt, oi) {
          const lbl = UI.el('label', 'quiz-opt mono');
          const r = UI.el('input'); r.type = 'radio'; r.name = 'q' + qi; r.value = String(oi);
          lbl.appendChild(r);
          lbl.appendChild(document.createTextNode(opt));
          box.appendChild(lbl);
        });
        inputs.push({ type: 'radio', name: 'q' + qi });
      } else {
        const inp = UI.el('input'); inp.type = 'text'; inp.placeholder = '0x..';
        box.appendChild(inp);
        inputs.push({ type: 'text', el: inp });
      }
      form.appendChild(box);
    });

    const checkBtn = UI.el('button', 'btn btn-primary', '✓ Kiểm tra đáp án');
    form.appendChild(checkBtn);
    container.appendChild(form);

    checkBtn.addEventListener('click', function () {
      const wrong = [];
      let answered = true;

      qs.forEach(function (q, qi) {
        const inp = inputs[qi];
        let ok = false;
        if (inp.type === 'radio') {
          const sel = form.querySelector('input[name="' + inp.name + '"]:checked');
          if (!sel) { answered = false; return; }
          ok = parseInt(sel.value, 10) === q.answer;
        } else {
          const raw = inp.el.value.trim();
          // câu hỏi về hex: chấp nhận "0x50", "50", "50h"
          const hexV = parseInt(String(raw).replace(/^0x/i, ''), 16);
          const decV = E.parseNum(raw);
          if (isNaN(hexV) && isNaN(decV)) { answered = false; return; }
          ok = hexV === q.answer || decV === q.answer;
        }
        if (!ok) wrong.push(qi);
      });

      if (!answered) {
        api.fail('Còn câu chưa trả lời — trả lời hết đã, không quản thêm được.');
        form.querySelectorAll('.quiz-q').forEach(function (b, i) { b.classList.toggle('wrong', wrong.indexOf(i) !== -1); });
        return;
      }
      if (wrong.length) {
        const detail = 'Sai ở: <b>' + wrong.map(function (i) { return 'Câu ' + (i + 1); }).join(', ') + '</b>. ' +
          'Gợi ý: dùng lại converter + endianness visualizer ở tab DEMO, rồi soát lại tab THEORY phần thanh ghi.';
        api.fail(detail);
        form.querySelectorAll('.quiz-q').forEach(function (b, i) { b.classList.toggle('wrong', wrong.indexOf(i) !== -1); });
        return;
      }
      form.querySelectorAll('.quiz-q').forEach(function (b) { b.classList.remove('wrong'); });
      api.pass();
    });
  }
});
