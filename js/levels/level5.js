/* ============================================================
 * PwnQuest — Level 5: Stack canary
 * ============================================================ */
window.PwnQuest = window.PwnQuest || {};
PwnQuest.levels = PwnQuest.levels || [];
PwnQuest.levels.push({
  id: 5,
  title: 'Stack canary',
  goal: 'Chạy một payload tràn qua canary để chứng kiến chương trình tự huỷ bằng "*** stack smashing detected ***".',
  flag: 'PWN{sm4sh1ng_d3t3ct3d}',

  hints: [
    'Canary là một giá trị ngẫu nhiên đặt NGAY GIỮA buffer và saved RBP. Trước khi ret, hàm so sánh canary hiện tại với bản gốc: khác một bit là abort ngay. Nhiệm vụ level này là "thất bại có chủ đích": làm canary hỏng.',
    'Canary nằm ở byte 17–20 sau buffer 16 byte. Chỉ cần payload dài hơn 16 byte là byte thứ 17 sẽ đè lên canary. Chạy xong, chương trình check canary trước khi ret → booom.',
    'Gần như đáp án: payload = "AAAAAAAAAAAAAAAA" + "BBBB" (20 chữ A là 16, thêm BBBB đè canary). Hoặc dài hơn nữa cũng được — miễn đụng canary.'
  ],

  /* ------------------------------------------------ THEORY */
  theory: [
    '# Level 5 — Stack canary',
    '',
    '> **TL;DR:** Compiler hiện đại chèn một giá trị ngẫu nhiên — **canary** — vào giữa buffer và saved RBP. Hàm kiểm tra canary **trước khi `ret`**: hỏng một byte là gọi `__stack_chk_fail` → `*** stack smashing detected ***` → abort. Không crash kiểu segfault, không flag — chương trình tự huỷ sạch sẽ.',
    '',
    '## 1. Con chim vàng trong mỏ',
    '',
    'Tên "canary" xuất từ những ngày mỏ than: thợ mang **canary (sẻ Canary) xuống hầm** — khí độc làm chim chết trước khi người bị ảnh hưởng → tín hiệu bỏ chạy. Stack canary cũng vậy: biến hy sinh, chết trước khi return address bị lợi dụng.',
    '',
    '## 2. Trông nó như thế nào trong binary?',
    '',
    '```c',
    'void vuln() {                       // §1',
    '    char buf[16];                   // §2',
    '    read(0, buf, 64);               // §3',
    '}                                   // §4',
    '```',
    '',
    '```asm',
    'vuln:                               ; §1',
    '    push rbp                        ; §1',
    '    mov  rbp, rsp                   ; §1',
    '    sub  rsp, 32                    ; §1  16 (buf) + 4 (canary) + 4 (rbp) + padding',
    '    mov  rax, QWORD PTR fs:0x28     ; §2  lấy canary từ TLS — ngẫu nhiên mỗi process',
    '    mov  QWORD PTR [rbp-8], rax     ; §2  đặt canary ngay trên buffer',
    '    lea  rax, [rbp-24]              ; §2  buf',
    '    mov  edx, 64                    ; §3  đọc 64 byte — tràn thoải mái',
    '    call read                       ; §3',
    '    mov  rax, QWORD PTR [rbp-8]     ; §4  canary hiện tại',
    '    xor  rax, QWORD PTR fs:0x28     ; §4  so với bản gốc',
    '    jne  __stack_chk_fail           ; §4  KHÁC → abort ngay, không bao giờ ret',
    '    leave                           ; §4',
    '    ret                             ; §4',
    '```',
    '',
    '## 3. Chi tiết thú vị: byte 0x00',
    '',
    'Canary thật (glibc) luôn có dạng **`0x00 xx xx xx xx xx xx xx`** — byte thấp nhất là `0x00`! Lý do: các hàm chuỗi (`strcpy`, `read` đến khi gặp NUL…) không thể ghi đè **qua** byte null bằng string copy, nên overflow kiểu chuỗi khó đụng tới các ô phía trên canary. Với `read` (đọc theo độ dài, không cần NUL) thì canary vẫn bị đè như thường — đó là lý do ta cần **leak canary** (Level 6).',
    '',
    '## 4. Điều này thay đổi game thế nào?',
    '',
    '- Overflow mù quáng → **chết ngay ở `__stack_chk_fail`**, chưa kịp đụng return address.',
    '- Muốn thắng, bạn phải overflow **chính xác**: ghi đè return address mà **giữ nguyên canary** — điều đó cần biết canary là bao nhiêu → **leak** nó (Level 6) hoặc bypass cách khác (ROP cũng vẫn cần qua canary).',
    '- Level này: hãy tự tay gây một lần abort để *nhìn thấy* cơ chế hoạt động.'
  ].join('\n'),

  solution: [
    '# Solution — Level 5',
    '',
    '## Payload',
    '',
    '```',
    'AAAAAAAAAAAAAAAABBBB',
    '```',
    '',
    '## Giải thích từng bước',
    '',
    '| Vị trí byte | Ghi vào | Kết quả |',
    '|---|---|---|---|',
    '| 1–16 (`A` × 16) | buf @ `0xFFD020` | đầy buffer, chưa có gì sảy ra |',
    '| 17–20 (`B` × 4) | **canary** @ `0xFFD030` | canary gốc `0x2A9E41D800` (ngẫu nhiên mỗi lần chạy) bị đè thành `0x42424242` |',
    '',
    'Khi `vuln()` kết thúc:',
    '',
    '```',
    'mov  rax, [rbp-8]        ; canary = 0x42424242',
    'xor  rax, fs:0x28        ; ≠ 0 → ZF = 0',
    'jne  __stack_chk_fail    ; nhảy!',
    '```',
    '',
    'Output của chương trình:',
    '',
    '```',
    '*** stack smashing detected ***: terminated',
    'Aborted (core dumped)',
    '```',
    '',
    'Không segfault, không nhảy lung tung — chương trình **tự huỷ có kiểm soát**. Đây là lý do mọi payload blind-overflow (không leak) chết ở level này.',
    '',
    '## Vì sao đây không phải "thua"?',
    '',
    'Level này chủ ý cho bạn thấy cơ chế phòng thủ hoạt động. Level 6 sẽ dạy cách **leak canary bằng format string** rồi overflow **đúng theo canary đã biết** — cách duy nhất để vượt qua hàng rào này.'
  ].join('\n'),

  /* ------------------------------------------------ DEMO */
  initDemo: function (container, api) {
    const UI = api.UI, E = api.Engine;

    const CANARY_ADDR = 0xffd030;
    let canary = 0;

    function newCanary() {
      // canary kiểu glibc: byte thấp 0x00 + 3 byte ngẫu nhiên (32-bit cho gọn)
      canary = 0x00;
      for (let i = 1; i < 4; i++) canary |= ((Math.random() * 256) | 0) << (8 * i);
    }

    function buildMem() {
      return new E.SimMemory({
        base: 0xffd000,
        size: 64,
        labels: [
          { name: 'char buf[16]', addr: 0xffd020, size: 16, cls: 'buf', desc: '' },
          { name: 'canary', addr: CANARY_ADDR, size: 4, cls: 'var', desc: 'Giá trị ngẫu nhiên từ TLS — byte thấp luôn 0x00' },
          { name: 'saved RBP', addr: 0xffd034, size: 4, cls: 'rbp', desc: '' },
          { name: 'return addr', addr: 0xffd038, size: 4, cls: 'ret', desc: 'Muốn tới được đây phải qua canary!' }
        ]
      });
    }
    let mem = buildMem();

    const box = UI.el('div', 'demo-box');
    box.appendChild(UI.el('div', 'demo-title', '🐤 Canary demo — payload qua canary là chết'));
    const controls = UI.el('div', 'field-row');
    const newBtn = UI.el('button', 'btn', '🎲 Sinh canary mới');
    controls.appendChild(newBtn);
    box.appendChild(controls);

    const row = UI.el('div', 'field-row');
    row.appendChild(UI.el('label', null, 'Payload:'));
    const inp = UI.el('input');
    inp.type = 'text';
    inp.placeholder = 'AAAAAAAAAAAAAAAABBBB';
    inp.style.flex = '1';
    row.appendChild(inp);
    const runBtn = UI.el('button', 'btn btn-primary', '▶ Run + check');
    row.appendChild(runBtn);
    box.appendChild(row);

    const caption = UI.el('div', 'step-caption');
    box.appendChild(caption);
    container.appendChild(box);
    const view = UI.memView(box, mem, { animate: true });

    function reset() {
      mem.reset();
      mem.write32(CANARY_ADDR, canary);
      mem.write32(0xffd034, 0xffd0a0);
      mem.write32(0xffd038, 0x080412a7);
    }

    function run() {
      reset();
      const res = E.applyPayload(mem, 0xffd020, inp.value);
      view.refresh();
      const cur = mem.read32(CANARY_ADDR);
      if (res.errors.length) {
        caption.innerHTML = '<span style="color:var(--red)">Payload lỗi:</span> ' + res.errors.map(function (e) { return UI.esc(e.msg); }).join(' ');
        return;
      }
      if (cur === canary) {
        caption.innerHTML = '✅ Canary còn nguyên (' + E.hex(canary) + '). Chương trình ret bình thường. (Payload ' + res.written + ' byte' + (res.written <= 16 ? ' — chưa chạm canary.' : ' nhưng bạn ghi lại ĐÚNG giá trị canary — như Level 6 sẽ dạy!') + ')';
      } else {
        caption.innerHTML = '💥 <b>*** stack smashing detected ***: terminated</b><br>Aborted (core dumped)<br>' +
          '<span style="color:var(--muted)">Canary gốc ' + E.hex(canary) + ' → hiện tại ' + E.describeDword(cur) + '. Chương trình chết ở <code>__stack_chk_fail</code>, KHÔNG BAO GIỜ ret — dù bạn có ghi return address gì đi nữa.</span>';
      }
    }

    newBtn.addEventListener('click', function () {
      newCanary();
      reset();
      view.refresh();
      caption.innerHTML = 'Canary mới (từ TLS): <b>' + E.hex(canary) + '</b> — byte thấp 0x00 như canary thật của glibc.';
    });
    runBtn.addEventListener('click', run);

    newCanary();
    reset();
    view.refresh();
    caption.innerHTML = 'Canary hiện tại: <b>' + E.hex(canary) + '</b> (byte thấp 0x00). Nhập payload > 16 byte rồi bấm Run + check.';
  },

  /* ------------------------------------------------ CHALLENGE */
  initChallenge: function (container, api) {
    const UI = api.UI, E = api.Engine;

    const CANARY_ADDR = 0xffd030;
    const canary = (function () {
      let c = 0;
      for (let i = 1; i < 4; i++) c |= ((Math.random() * 256) | 0) << (8 * i);
      return c; // byte thấp 0x00
    })();

    const mem = new E.SimMemory({
      base: 0xffd000,
      size: 64,
      labels: [
        { name: 'char buf[16]', addr: 0xffd020, size: 16, cls: 'buf', desc: 'read(0, buf, 64) ghi vào đây' },
        { name: 'canary', addr: CANARY_ADDR, size: 4, cls: 'var', desc: 'Hàng rào — hỏng một byte là abort' },
        { name: 'saved RBP', addr: 0xffd034, size: 4, cls: 'rbp', desc: '' },
        { name: 'return addr', addr: 0xffd038, size: 4, cls: 'ret', desc: 'Không thể tới được... trừ khi Level 6' }
      ]
    });

    container.appendChild(UI.el('p', null,
      '<b>Nhiệm vụ (chủ ý "thất bại"):</b> chương trình đã bật canary. Hãy chạy một payload tràn qua canary để chứng kiến ' +
      '<code>__stack_chk_fail</code> kích hoạt — chương trình in <b>*** stack smashing detected ***</b> rồi abort. ' +
      'Điều kiện pass: canary tại <code>0xFFD030</code> khác giá trị gốc.'));

    const box = UI.el('div', 'demo-box');
    const caption = UI.el('div', 'step-caption', '');
    box.appendChild(caption);
    container.appendChild(box);
    const view = UI.memView(box, mem, { animate: true });

    function reset() {
      mem.reset();
      mem.write32(CANARY_ADDR, canary);
      mem.write32(0xffd034, 0xffd0a0);
      mem.write32(0xffd038, 0x080412a7);
    }
    reset();
    caption.innerHTML = 'Canary gốc (đọc từ "TLS"): <b>' + E.hex(canary) + '</b> — bạn không được đụng nó nếu muốn thoát an toàn. Nhưng level này... hãy phá nó!';

    UI.payloadForm(container, {
      label: 'Payload:',
      placeholder: 'vd: AAAA...BBBB',
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
        const term = ['<span class="term-dim">$ ./level5  &lt; payload</span>',
          'read() ghi ' + res.written + ' byte vào 0xFFD020'];

        if (cur !== canary) {
          term.push('mov rax, [rbp-8]; xor rax, fs:0x28 → khác!');
          term.push('<span class="term-err">*** stack smashing detected ***: terminated</span>');
          term.push('<span class="term-err">Aborted (core dumped)</span>');
          out.showTerm(term.join('\n'));
          caption.innerHTML = 'Canary ' + E.hex(canary) + ' → ' + E.describeDword(cur) + '. <b>__stack_chk_fail kích hoạt</b> — chương trình chết TRƯỚC khi ret. Đúng như dự kiến! 🐤';
          api.pass();
          return;
        }

        let why;
        if (res.written <= 16) {
          why = 'Payload <b>' + res.written + ' byte</b> — chưa đụng canary (nằm ở byte 17–20). Canary vẫn = ' + E.hex(canary) + ', chương trình thoát bình thường. Cần dài hơn nữa.';
        } else {
          why = 'Payload ' + res.written + ' byte nhưng 4 byte tại vị trí 17–20 (' + E.byteStr(mem.read(CANARY_ADDR, 4)) + ') trùng khớp canary gốc — bạn đã "tự leak canary" như Level 6! Nhưng level này cần thấy abort: hãy ghi giá trị KHÁC vào canary.';
        }
        term.push('canary OK → ret bình thường ✗');
        out.showTerm(term.join('\n'));
        caption.innerHTML = why;
        api.fail(why);
      }
    });
  }
});
