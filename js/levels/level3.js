/* ============================================================
 * PwnQuest — Level 3: Buffer overflow đầu tiên
 * ============================================================ */
window.PwnQuest = window.PwnQuest || {};
PwnQuest.levels = PwnQuest.levels || [];
PwnQuest.levels.push({
  id: 3,
  title: 'Buffer overflow đầu tiên',
  goal: 'Nhập payload làm biến int "target" (tại 0xFFD030) trở thành 0xDEADBEEF.',
  flag: 'PWN{d34db33f_d3l1v3r3d}',

  hints: [
    'Payload của bạn = byte ghi vào buffer, lần lượt từ đầu buffer. 16 byte đầu lấp buffer; byte 17–20 rơi vào "target" ngay phía trên. Mục tiêu: giá trị 4 byte đọc little-endian ra 0xDEADBEEF.',
    'Gợi ý công cụ: payload parser chấp nhận cả ký tự thường lẫn escape hex. 0xDEADBEEF viết little-endian là \\xef\\xbe\\xad\\xde — byte THẤP (ef) ghi TRƯỚC. Payload = 16 ký tự bất kỳ + 4 byte đó. Nhớ gõ dấu backslash: \\xef\\xbe\\xad\\xde.',
    'Gần như đáp án: "AAAAAAAAAAAAAAAA\\xef\\xbe\\xad\\xde" — 16 chữ A (padding) rồi đúng thứ tự \\xef\\xbe\\xad\\xde. Padding có thể là 16 ký tự bất kỳ, miễn đủ 16 byte.'
  ],

  /* ------------------------------------------------ THEORY */
  theory: [
    '# Level 3 — Buffer overflow đầu tiên',
    '',
    '> **TL;DR:** Đã biết ghi đè (Level 2), giờ ghi đè **có chủ đích**: biến `int target` nằm ngay trên buffer, muốn nó = `0xDEADBEEF` thì 4 byte tràn sang phải chính xác là `EF BE AD DE` — little-endian của 0xDEADBEEF, byte **thấp** ghi **trước**. Payload chuẩn: `<16 byte padding><ef be ad de>`.',
    '',
    '## 1. Bài toán kinh điển',
    '',
    '```c',
    'void vuln() {                        // §1',
    '    int target = 0x1234;             // §2',
    '    char buf[16];                    // §3',
    '    read(0, buf, 32);                // §4  cho phép đọc 32 — buffer chỉ 16!',
    '    if (target == 0xdeadbeef)        // §5',
    '        win();                       // §5  never reached… trừ khi bạn overflow',
    '}',
    '```',
    '',
    '```asm',
    'push rbp                       ; §1',
    'mov  rbp, rsp                  ; §1',
    'sub  rsp, 32                   ; §1  16 (buf) + 4 (target) + padding',
    'mov  DWORD PTR [rbp-32], 0x1234  ; §2  target = 0x1234',
    'lea  rax, [rbp-16]             ; §3  buf @ rbp-16 — NGAY DƯỚI target',
    'mov  edx, 32                   ; §4  đọc 32 byte — 16 dư để tràn',
    'call read                      ; §4',
    'cmp  DWORD PTR [rbp-32], 0xdeadbeef ; §5  so target với 0xDEADBEEF',
    'jne  skip                      ; §5',
    'call win                       ; §5',
    '```',
    '',
    'Chú ý `cmp DWORD PTR [rbp-32], 0xdeadbeef`: so sánh nguyên 4 byte một lúc — nên bạn phải đưa **đúng cả 4 byte theo đúng thứ tự trong RAM**.',
    '',
    '## 2. Xây payload',
    '',
    'Bộ nhớ sau `read` (little-endian, nhớ Level 0):',
    '',
    '```',
    'địa chỉ:   0xFFD020 (buf) ... 0xFFD02F | 0xFFD030..33 (target)',
    'payload:   [16 byte bất kỳ]           | ef be ad de',
    '                                     → đọc LE = 0xDEADBEEF ✓',
    '```',
    '',
    'Muốn target = 0xDEADBEEF thì trong RAM phải là **`EF BE AD DE`**: `EF` (byte thấp nhất) tại địa chỉ **thấp nhất**. Trong payload viết: `\\xef\\xbe\\xad\\xde`.',
    '',
    '## 3. Padding là gì?',
    '',
    '16 byte đầu ("padding", thường là `AAAA...`) chỉ có nhiệm vụ **đường vào**: chất đầy buffer để 4 byte quý giá rơi đúng vào target. Giá trị gì cũng được — miễn đủ 16 byte. Trong CTF thật, padding thường dùng pattern cyclic để *tìm* offset (Level 4); ở đây viewer đã cho bạn biết offset = 16.'
  ].join('\n'),

  solution: [
    '# Solution — Level 3',
    '',
    '## Payload',
    '',
    '```',
    'AAAAAAAAAAAAAAAA\\xef\\xbe\\xad\\xde',
    '```',
    '',
    '(Hoặc `AAAAAAAAAAAAAAAA0xdeadbeef` — parser tự chuyển `0xdeadbeef` thành 4 byte LE.)',
    '',
    '## Giải thích từng bước',
    '',
    '| Phần | Byte trong RAM | Ghi vào đâu | Vì sao |',
    '|---|---|---|---|',
    '| `AAAAAAAAAAAAAAAA` | `41` × 16 | buf @ `0xFFD020` | padding — chất đầy 16 byte buffer để "đi đường" tới target |',
    '| `\\xef` | `EF` | target byte 0 @ `0xFFD030` | byte thấp nhất của 0xDEADBEEF |',
    '| `\\xbe` | `BE` | target byte 1 | |',
    '| `\\xad` | `AD` | target byte 2 | |',
    '| `\\xde` | `DE` | target byte 3 @ `0xFFD033` | byte cao nhất — địa chỉ cao nhất (little-endian!) |',
    '',
    '`read(0, buf, 32)` cho phép đọc 32 byte vào buffer 16 byte → 16 byte dư đầu tiên tràn thẳng vào target. Đọc lại 4 byte tại 0xFFD030 theo little-endian: `DE AD BE EF` đảo ngược từ `EF BE AD DE` = **0xDEADBEEF**. `cmp` thỏa → `win()`.',
    '',
    '## Lỗi thường gặp',
    '',
    '- Ghi `\\xde\\xad\\xbe\\xef` (thứ tự ngược): target = 0xEFBEADDE — sai. Luôn hỏi: *byte thấp nhất nằm ở đâu?* → địa chỉ thấp nhất → ghi trước.',
    '- Payload 15 byte: byte `DE` cuối rơi vào buf, target = 0x001234EF kiểu đó — chỉ tràn 3/4.',
    '- Nhầm `\\x` thành `/x` — parser sẽ báo "payload lỗi" kèm vị trí.'
  ].join('\n'),

  /* ------------------------------------------------ DEMO */
  initDemo: function (container, api) {
    const UI = api.UI, E = api.Engine;

    const mem = new E.SimMemory({
      base: 0xffd000,
      size: 64,
      labels: [
        { name: 'char buf[16]', addr: 0xffd020, size: 16, cls: 'buf', desc: 'Buffer 16 byte' },
        { name: 'int target', addr: 0xffd030, size: 4, cls: 'var', desc: 'Biến int — mục tiêu: 0xDEADBEEF' },
        { name: 'saved RBP', addr: 0xffd034, size: 4, cls: 'rbp', desc: '' },
        { name: 'return addr', addr: 0xffd038, size: 4, cls: 'ret', desc: '' }
      ]
    });
    mem.write32(0xffd030, 0x1234);
    mem.write32(0xffd034, 0xffd0a0);
    mem.write32(0xffd038, 0x080412a7);

    const PAYLOAD = 'AAAAAAAAAAAAAAAA\\xef\\xbe\\xad\\xde';
    const parsed = E.parsePayload(PAYLOAD); // 20 byte

    const box = UI.el('div', 'demo-box');
    box.appendChild(UI.el('div', 'demo-title', '👣 Ghi từng byte một — nút Step ghi 1 byte của payload'));

    const controls = UI.el('div', 'field-row');
    const stepBtn = UI.el('button', 'btn btn-primary', '▶ Ghi 1 byte');
    const allBtn = UI.el('button', 'btn', '⏩ Ghi hết');
    const resetBtn = UI.el('button', 'btn', '↺ Reset');
    controls.appendChild(stepBtn);
    controls.appendChild(allBtn);
    controls.appendChild(resetBtn);
    const counter = UI.el('span', null, '');
    counter.style.cssText = 'color:var(--cyan);font-family:var(--mono);font-size:13px';
    controls.appendChild(counter);
    box.appendChild(controls);

    const caption = UI.el('div', 'step-caption');
    box.appendChild(caption);
    container.appendChild(box);

    const view = UI.memView(box, mem, { animate: true });
    let idx = 0;

    function reset() {
      mem.reset();
      mem.write32(0xffd030, 0x1234);
      mem.write32(0xffd034, 0xffd0a0);
      mem.write32(0xffd038, 0x080412a7);
      idx = 0;
      caption.innerHTML = 'Payload 20 byte: <code>' + UI.esc(PAYLOAD) + '</code>. Bấm "Ghi 1 byte" để xem read() ghi từng byte vào 0xFFD020.';
      counter.textContent = 'byte 0/20';
      view.refresh();
    }

    function step() {
      if (idx >= parsed.bytes.length) { reset(); return; }
      const b = parsed.bytes[idx];
      const addr = 0xffd020 + idx;
      mem.write(addr, [b]);
      idx++;
      counter.textContent = 'byte ' + idx + '/20';
      if (idx <= 16) {
        caption.innerHTML = 'Ghi <code>0x' + E.hexByte(b) + '</code> (' + E.esc(String.fromCharCode(b)) + ') vào <code>' + E.hex(addr, 6) + '</code> — vẫn trong buffer. Còn ' + (16 - idx) + ' byte padding nữa.';
      } else if (idx <= 20) {
        const t = E.readLabel(mem, 'int target');
        caption.innerHTML = '⚠ Ghi <code>0x' + E.hexByte(b) + '</code> vào <code>' + E.hex(addr, 6) + '</code> — <b>tràn vào int target!</b> Giờ target = ' + E.describeDword(t.value) + '.';
        if (idx === 20) {
          caption.innerHTML += ' <b>Xong: target = ' + E.hex(t.value) + ' == 0xDEADBEEF → win() sẽ chạy!</b>';
        }
      }
      view.refresh();
    }

    stepBtn.addEventListener('click', step);
    allBtn.addEventListener('click', function () {
      while (idx < parsed.bytes.length) step();
    });
    resetBtn.addEventListener('click', reset);
    reset();
  },

  /* ------------------------------------------------ CHALLENGE */
  initChallenge: function (container, api) {
    const UI = api.UI, E = api.Engine;

    const mem = new E.SimMemory({
      base: 0xffd000,
      size: 64,
      labels: [
        { name: 'char buf[16]', addr: 0xffd020, size: 16, cls: 'buf', desc: 'Buffer 16 byte — read() ghi vào đây' },
        { name: 'int target', addr: 0xffd030, size: 4, cls: 'var', desc: 'Mục tiêu: 0xDEADBEEF' },
        { name: 'saved RBP', addr: 0xffd034, size: 4, cls: 'rbp', desc: 'Đừng đè lỗi cái này' },
        { name: 'return addr', addr: 0xffd038, size: 4, cls: 'ret', desc: '' }
      ]
    });
    const GOAL = 0xdeadbeef;

    container.appendChild(UI.el('p', null,
      '<b>Nhiệm vụ:</b> <code>read(0, buf, 32)</code> với <code>char buf[16]</code> tại <code>0xFFD020</code>; <code>int target</code> nằm ngay trên tại <code>0xFFD030</code>. ' +
      'Nhập payload (chuỗi ký tự + escape hex <code>\\xNN</code>) để <b>target == 0xDEADBEEF</b>. Payload hỗ trợ: ký tự thường, <code>\\xef</code>, <code>0xdeadbeef</code> (tự thành 4 byte LE).'));

    const box = UI.el('div', 'demo-box');
    const caption = UI.el('div', 'step-caption', 'target hiện tại = 0x00001234. Hãy overflow!');
    box.appendChild(caption);
    container.appendChild(box);

    const view = UI.memView(box, mem, { animate: true });

    UI.payloadForm(container, {
      label: 'Payload:',
      placeholder: 'vd: AAAA...\\xef\\xbe\\xad\\xde',
      buttonLabel: '▶ Run payload',
      onRun: function (payloadText, out) {
        mem.reset();
        mem.write32(0xffd030, 0x1234);
        mem.write32(0xffd034, 0xffd0a0);
        mem.write32(0xffd038, 0x080412a7);

        const res = E.applyPayload(mem, 0xffd020, payloadText);
        view.refresh();

        if (res.errors.length) {
          const msg = res.errors.map(function (e) { return e.msg; }).join(' ');
          out.showTerm('<span class="term-err">[payload lỗi]</span> ' + msg);
          api.fail('Payload có lỗi cú pháp: ' + msg);
          return;
        }

        const t = E.readLabel(mem, 'int target');
        const term = ['<span class="term-dim">$ ./level3  &lt; payload</span>',
          'read() ghi ' + res.written + ' byte vào 0xFFD020',
          'cmp DWORD PTR [rbp-32], 0xDEADBEEF'];

        if (t.value === GOAL && res.written >= 17 && res.written <= 20) {
          term.push('target = ' + E.hex(t.value) + ' ✓');
          term.push('<b>win()!</b>');
          out.showTerm(term.join('\n'));
          caption.innerHTML = 'target == 0xDEADBEEF — điều kiện if thỏa, win() được gọi!';
          api.pass();
          return;
        }

        // fail — mô tả chính xác
        let why;
        if (res.written <= 16) {
          why = 'Payload <b>' + res.written + ' byte</b> — chưa tràn qua buffer (cần > 16). target vẫn = 0x00001234.';
        } else {
          const wrongOrder = t.value === 0xefbeadde || t.value === 0xbeefdead || t.value === 0xdeadbeef00 || t.value === 0xdead;
          why = 'target giờ = <b>' + E.describeDword(t.value) + '</b>, không phải 0xDEADBEEF. ';
          if (t.value === 0xefbeadde) {
            why += 'Bạn ghi 4 byte ĐÚNG giá trị nhưng NGƯỢC thứ tự: <code>\\xde\\xad\\xbe\\xef</code>. Little-endian: byte thấp (EF) phải ghi TRƯỚC → <code>\\xef\\xbe\\xad\\xde</code>.';
          } else if (t.value === 0xdead) {
            why += 'Payload của bạn có vẻ thiếu byte: chỉ 2 byte tràn tới target (đủ 18 byte thì 4 byte mới tràn đủ).';
          } else if (res.written > 24) {
            why += 'Tràn quá xa (' + res.written + ' byte) — return address = ' + E.describeDword(mem.read32(0xffd038)) + ' → CRASH.';
          } else {
            why += '4 byte tràn sang target là ' + E.byteStr(t.bytes) + '. Cần đúng <code>ef be ad de</code> (little-endian của 0xDEADBEEF).';
          }
        }
        term.push('<span class="term-err">target = ' + E.hex(t.value) + ' ✗ (cần 0xDEADBEEF)</span>');
        out.showTerm(term.join('\n'));
        caption.innerHTML = why;
        api.fail(why);
      }
    });
  }
});
