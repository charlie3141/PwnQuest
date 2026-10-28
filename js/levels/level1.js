/* ============================================================
 * PwnQuest — Level 1: Stack frame ảo
 * ============================================================ */
window.PwnQuest = window.PwnQuest || {};
PwnQuest.levels = PwnQuest.levels || [];
PwnQuest.levels.push({
  id: 1,
  title: 'Stack frame ảo',
  goal: 'Gán đúng nhãn cho từng vùng của một stack frame: biến cục bộ, buffer, saved RBP và return address.',
  flag: 'PWN{fr4m3_of_m1nd}',

  hints: [
    'Stack mọc XUỐNG (địa chỉ cao → thấp). Trong một frame: biến cục bộ nằm ở địa chỉ thấp nhất ([rbp-x]), saved RBP ở ngay trên chúng ([rbp]), và return address ở ngay trên saved RBP ([rbp+4]) — địa chỉ cao nhất trong frame.',
    'Thứ tự từ địa chỉ CAO xuống THẤP: return address → saved RBP → buf[16] → int x. Đổi lại: địa chỉ 0xffd034 là cao nhất trong 4 slot, 0xffd01c là thấp nhất.',
    'Gần như đáp án: 0xffd034 = return address. 0xffd030 = saved RBP. 0xffd020 = char buf[16]. 0xffd01c = int x.'
  ],

  /* ------------------------------------------------ THEORY */
  theory: [
    '# Level 1 — Stack frame ảo',
    '',
    '> **TL;DR:** Mỗi lần hàm được gọi, trên stack sinh ra một **stack frame**: biến cục bộ nằm dưới (địa chỉ thấp), trên đó là **saved RBP**, và trên cùng — cái quan trọng nhất — là **return address**: địa chỉ CPU quay về khi hàm kết thúc. Buffer overflow nguy hiểm vì nó ghi **từ dưới đâm lên trên**, đụng thẳng vào return address.',
    '',
    '## 1. Stack mọc xuống',
    '',
    'Stack là vùng nhớ mà địa chỉ **giảm dần** khi bạn `push`. Đỉnh stack là `rsp` — thanh ghi bạn đã gặp ở Level 0. Khi hàm A gọi hàm B, B được cấp một khoảng không gian ngay *dưới* frame của A.',
    '',
    '## 2. Một frame gồm những gì?',
    '',
    'Xét hàm C này:',
    '',
    '```c',
    'void vuln() {               // §1',
    '    int x = 42;             // §2',
    '    char buf[16];           // §3',
    '    read(0, buf, 32);       // §4',
    '}                           // §5',
    '```',
    '',
    '```asm',
    'vuln:',
    '    push rbp                ; §5  giữ lại rbp của hàm gọi (saved RBP)',
    '    mov  rbp, rsp           ; §5  neo frame mới tại rbp hiện tại',
    '    sub  rsp, 32            ; §3  chừa 32 byte cho biến cục bộ',
    '    mov  DWORD PTR [rbp-20], 42   ; §2  x = 42 — nằm DƯỚI rbp',
    '    lea  rax, [rbp-32]      ; §3  buf — cũng nằm dưới rbp',
    '    call read               ; §4',
    '    leave                   ; §5  rsp = rbp; pop rbp → khôi phục saved RBP',
    '    ret                     ; §5  pop địa chỉ từ [rbp+8] vào rip → QUAY VỀ',
    '```',
    '',
    '*(Ví dụ dùng kiểu 32-bit cho dễ hình dung: `ret` pop 4 byte từ đỉnh stack.)*',
    '',
    '## 3. Bản đồ frame',
    '',
    '```',
    'địa chỉ cao',
    '  │  ...frame của hàm gọi (caller)...',
    '  ├──────────────────────────',
    '  │  [rbp+8]  RETURN ADDRESS  ← ret() nhảy tới đây',
    '  ├──────────────────────────',
    '  │  [rbp+0]  SAVED RBP       ← rbp của hàm gọi, để khôi phục',
    '  ├──────────────────────────',
    '  │  [rbp-4..rbp-20]  buf[16] ← biến cục bộ của vuln()',
    '  ├──────────────────────────',
    '  │  [rbp-24]  int x',
    '  ▼',
    'địa chỉ thấp  (rsp ở đây)',
    '```',
    '',
    '## 4. Vì sao đây là chìa khoá của pwn?',
    '',
    '`read(0, buf, 32)` đọc **32 byte** vào buffer chỉ **16 byte** — 16 byte dư sẽ tràn qua saved RBP và return address. Nếu bạn kiểm soát được return address, bạn kiểm soát được **lệnh tiếp theo CPU thực thi**. Đó là toàn bộ game pwn.',
    '',
    'Trong level này, hãy lần đầu *nhìn* frame bằng mắt ở tab DEMO, rồi tự gán nhãn ở tab CHALLENGE.'
  ].join('\n'),

  solution: [
    '# Solution — Level 1',
    '',
    'Bản đồ đúng (từ địa chỉ cao xuống thấp):',
    '',
    '| Địa chỉ | Nhãn đúng | Vì sao |',
    '|---|---|---|',
    '| `0xffd034` | **return address** | nằm tại `[rbp+4]` — lệnh `ret` pop giá trị này vào `rip`. Đây là ô nhớ attack nhắm tới. |',
    '| `0xffd030` | **saved RBP** | `push rbp` khi vào hàm — lưu rbp của hàm gọi để `leave` khôi phục sau. |',
    '| `0xffd020` | **char buf[16]** | 16 byte biến cục bộ, compiler đặt tại `[rbp-32]` (tức `0xffd020`). |',
    '| `0xffd01c` | **int x** | biến 4 byte tại `[rbp-20]`. |',
    '',
    '## Tại sao thứ tự này luôn đúng?',
    '',
    'Compiler *bắt buộc* layout: `push rbp` và lệnh `ret` là quy ước gọi hàm (calling convention) — saved RBP và return address luôn nằm ngay trên biến cục bộ, cách nhau bởi đúng kích thước bạn cấp. Biến khai báo sau (`int x` sau `char buf[16]`) thường nằm ở địa chỉ *thấp hơn*. Compiler sắp xếp vậy, không phải trùng hợp.',
    '',
    '## Cái bạn vừa học dẫn tới đâu',
    '',
    'Level 3 sẽ cho bạn overflow thật: 16 byte padding đè lên `x`. Level 4: 20 byte padding + 4 byte địa chỉ → đè return address. Mọi thứ đều bắt đầu từ bản đồ này.'
  ].join('\n'),

  /* ------------------------------------------------ DEMO */
  initDemo: function (container, api) {
    const UI = api.UI, E = api.Engine;

    const base = 0xffd000;
    const mem = new E.SimMemory({
      base: base,
      size: 64,
      labels: [
        { name: 'int x',        addr: 0xffd01c, size: 4,  cls: 'var',    desc: 'Biến cục bộ 4 byte — [rbp-20]' },
        { name: 'char buf[16]', addr: 0xffd020, size: 16, cls: 'buf',    desc: 'Buffer 16 byte — [rbp-32]' },
        { name: 'saved RBP',    addr: 0xffd030, size: 4,  cls: 'rbp',    desc: 'rbp của hàm gọi, push vào lúc vào hàm' },
        { name: 'return addr',  addr: 0xffd034, size: 4,  cls: 'ret',    desc: 'Địa chỉ CPU quay về khi ret() — Ô CHÍNH là attack nhắm tới' },
        { name: 'caller frame', addr: 0xffd038, size: 8,  cls: 'caller', desc: 'Vùng của hàm gọi vuln()' }
      ]
    });

    const box = UI.el('div', 'demo-box');
    box.appendChild(UI.el('div', 'demo-title', '🔬 Bên trong một lần gọi vuln() — bấm Step để chạy từng lệnh'));

    const controls = UI.el('div', 'field-row');
    const stepBtn = UI.el('button', 'btn btn-primary', '▶ Bước tiếp');
    const resetBtn = UI.el('button', 'btn', '↺ Reset');
    controls.appendChild(stepBtn);
    controls.appendChild(resetBtn);
    const instr = UI.el('span', null, '');
    instr.style.cssText = 'color:var(--yellow);font-family:var(--mono);font-size:13px';
    controls.appendChild(instr);
    box.appendChild(controls);

    const caption = UI.el('div', 'step-caption');
    box.appendChild(caption);
    container.appendChild(box);

    const view = UI.memView(box, mem, { animate: true });

    const STEPS = [
      {
        code: 'main: call vuln',
        cap: '<b>Bước 0 — lệnh <code>call vuln</code> vừa thực thi.</b> Địa chỉ lệnh tiếp theo của <code>main</code> (<code>0x080412A7</code>) được <code>push</code> vào stack — đó chính là <b>return address</b> (ô đỏ). CPU chưa làm gì trong vuln() cả.'
      },
      {
        code: 'push rbp',
        cap: '<b>Bước 1 — <code>push rbp</code>.</b> rbp cũ của <code>main</code> (<code>0xFFD0A0</code>) được lưu lại → <b>saved RBP</b> (ô vàng). Nó nằm NGAY TRÊN return address, cách nhau đúng 4 byte.'
      },
      {
        code: 'sub esp, 32',
        cap: '<b>Bước 2 — <code>sub esp, 32</code>.</b> Cấp 32 byte cho biến cục bộ: <code>char buf[16]</code> + <code>int x</code> + padding. Giá trị <code>0xCC</code> = "chưa khởi tạo" (runtime debug hay điền vậy).'
      },
      {
        code: 'mov DWORD PTR [rbp-20], 42',
        cap: '<b>Bước 3 — <code>x = 42</code> (= 0x2A).</b> Biến <code>x</code> nằm tại <code>[rbp-20]</code> = <code>0xFFD01C</code>. Ghi vào 4 byte <code>2A 00 00 00</code> — lại là little-endian từ Level 0!'
      },
      {
        code: 'read(0, buf, 32)',
        cap: '<b>Bước 4 — người dùng gõ "hi".</b> <code>read</code> ghi <code>68 69</code> vào đầu <code>buf</code> tại <code>0xFFD020</code>. Buffer chỉ 16 byte nhưng read cho phép đọc 32 — vành đai của thảm hoạ ở Level 3!'
      },
      {
        code: 'leave; ret',
        cap: '<b>Bước 5 — <code>leave</code> khôi phục rbp, <code>ret</code> pop return address vào <code>rip</code>.</b> CPU nhảy về <code>0x080412A7</code> trong main, như chưa có gì xảy ra. Nhưng nếu byte đó bị Overflow ghi đè... chính bạn sẽ quyết định CPU nhảy đi đâu. (Level 4!)'
      }
    ];
    let step = 0;

    function applyStep() {
      mem.reset();
      if (step >= 0) mem.write32(0xffd034, 0x080412a7);            // call vuln
      if (step >= 1) mem.write32(0xffd030, 0xffd0a0);              // push rbp
      if (step >= 2) { mem.fillRegion('int x', 0xcc); mem.fillRegion('char buf[16]', 0xcc); }
      if (step >= 3) mem.write32(0xffd01c, 42);                    // x = 42
      if (step >= 4) mem.write(0xffd020, [0x68, 0x69]);            // "hi"
      caption.innerHTML = STEPS[Math.max(0, step)].cap;
      instr.textContent = step >= 0 && step < STEPS.length ? '→ ' + STEPS[step].code : '';
      view.refresh();
    }

    stepBtn.addEventListener('click', function () {
      if (step < STEPS.length - 1) step++;
      else step = 0;
      applyStep();
    });
    resetBtn.addEventListener('click', function () { step = 0; applyStep(); });

    applyStep();

    const tip = UI.el('p', null, '<span style="color:var(--muted);font-size:13px">💡 Hover vào từng byte để xem địa chỉ + thuộc vùng nào. Byte <b>vàng nhấp nháy</b> là byte vừa bị ghi ở bước hiện tại.</span>');
    container.appendChild(tip);
  },

  /* ------------------------------------------------ CHALLENGE */
  initChallenge: function (container, api) {
    const UI = api.UI, E = api.Engine;

    // slot được khai báo từ địa chỉ THẤP -> CAO; CSS column-reverse sẽ
    // hiển thị từ cao xuống thấp (giống nhìn stack thật)
    const slots = [
      { addr: 0xffd01c, correct: 'int x',         hintSize: '4 byte  — [rbp-20]' },
      { addr: 0xffd020, correct: 'char buf[16]',  hintSize: '16 byte — [rbp-32]' },
      { addr: 0xffd030, correct: 'saved RBP',     hintSize: '4 byte  — [rbp+0]' },
      { addr: 0xffd034, correct: 'return address', hintSize: '4 byte  — [rbp+4]' }
    ];
    const labels = ['return address', 'saved RBP', 'char buf[16]', 'int x'];
    const shuffled = labels.slice().sort(function () { return Math.random() - 0.5; });

    const wrap = UI.el('div', 'dd-wrap');

    // cột trái: slots
    const left = UI.el('div');
    left.appendChild(UI.el('p', null, 'Một frame vừa được dựng ở <code>0xFFD01C–0xFFD038</code>. Kéo nhãn vào đúng ô (hoặc: bấm chọn nhãn → bấm vào ô):'));
    const slotsEl = UI.el('div', 'dd-slots');
    const slotEls = [];

    slots.forEach(function (s) {
      const slot = UI.el('div', 'slot');
      slot.dataset.addr = String(s.addr);
      slot.dataset.filled = '';
      slot.appendChild(UI.el('span', 'slot-addr', E.hex(s.addr, 6)));
      const fill = UI.el('span', 'slot-fill', '— kéo nhãn vào đây — (' + s.hintSize + ')');
      slot.appendChild(fill);

      slot.addEventListener('click', function () {
        // click fallback: nếu đang chọn chip → đặt vào slot
        const sel = wrap.querySelector('.chip.selected[data-inpool="1"]');
        if (sel) { placeChip(sel, slot); return; }
        // click vào slot có chip → trả chip về pool
        const chip = slot.querySelector('.chip');
        if (chip) returnChip(chip);
      });
      slot.addEventListener('dragover', function (e) { e.preventDefault(); slot.classList.add('dragover'); });
      slot.addEventListener('dragleave', function () { slot.classList.remove('dragover'); });
      slot.addEventListener('drop', function (e) {
        e.preventDefault();
        slot.classList.remove('dragover');
        const id = e.dataTransfer.getData('text/plain');
        const chip = wrap.querySelector('.chip[data-chipid="' + id + '"]');
        if (chip) placeChip(chip, slot);
      });

      slotsEl.appendChild(slot);
      slotEls.push(slot);
    });
    left.appendChild(slotsEl);

    // cột phải: pool + nút
    const right = UI.el('div', 'dd-side');
    right.appendChild(UI.el('p', null, '<b>Nhãn:</b>'));
    const pool = UI.el('div', 'chip-pool');
    shuffled.forEach(function (label, i) {
      const chip = UI.el('span', 'chip', label);
      chip.draggable = true;
      chip.dataset.chipid = 'c' + i;
      chip.dataset.inpool = '1';
      chip.title = 'Kéo thả vào ô, hoặc bấm chọn rồi bấm vào ô';
      chip.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', chip.dataset.chipid);
      });
      chip.addEventListener('click', function () {
        const was = chip.classList.contains('selected');
        wrap.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('selected'); });
        if (!was) chip.classList.add('selected');
      });
      pool.appendChild(chip);
    });
    right.appendChild(pool);

    const checkBtn = UI.el('button', 'btn btn-primary', '✓ Kiểm tra');
    checkBtn.style.marginTop = '10px';
    right.appendChild(checkBtn);
    const clearBtn = UI.el('button', 'btn', '↺ Làm lại');
    clearBtn.style.marginTop = '10px';
    clearBtn.style.marginLeft = '6px';
    right.appendChild(clearBtn);
    right.appendChild(UI.el('p', 'note', '<br>Bấm vào chip đã nằm trong ô để trả nó về pool.'));

    wrap.appendChild(left);
    wrap.appendChild(right);
    container.appendChild(wrap);

    function placeChip(chip, slot) {
      wrap.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('selected'); });
      // nếu slot đã có chip thì trả chip cũ về pool
      const old = slot.querySelector('.chip');
      if (old) returnChip(old);
      chip.dataset.inpool = '';
      slot.dataset.filled = chip.textContent;
      slot.querySelector('.slot-fill').replaceWith(chip);
      slot.classList.remove('correct', 'wrong');
    }

    function returnChip(chip) {
      const slot = chip.closest('.slot');
      if (slot) {
        slot.dataset.filled = '';
        slot.classList.remove('correct', 'wrong');
        const fill = UI.el('span', 'slot-fill', '— kéo nhãn vào đây — (' +
          slots.find(function (s) { return String(s.addr) === slot.dataset.addr; }).hintSize + ')');
        chip.replaceWith(fill);
      }
      chip.dataset.inpool = '1';
      pool.appendChild(chip);
    }

    clearBtn.addEventListener('click', function () {
      slotEls.forEach(function (slot) {
        const chip = slot.querySelector('.chip');
        if (chip) returnChip(chip);
      });
    });

    checkBtn.addEventListener('click', function () {
      const unfilled = [];
      const wrong = [];
      slotEls.forEach(function (slot, i) {
        const filled = slot.dataset.filled;
        if (!filled) { unfilled.push(slots[i].addr); return; }
        const ok = filled === slots[i].correct;
        slot.classList.toggle('correct', ok);
        slot.classList.toggle('wrong', !ok);
        if (!ok) wrong.push(slots[i]);
      });

      if (unfilled.length) {
        api.fail('Còn ô chưa gán nhãn: <b>' + unfilled.map(function (a) { return E.hex(a, 6); }).join(', ') + '</b> — gán hết đã nhé.');
        return;
      }
      if (wrong.length) {
        const detail = 'Sai ' + wrong.length + ' ô: ' + wrong.map(function (s) {
          return 'ô <b>' + E.hex(s.addr, 6) + '</b> chưa đúng';
        }).join('; ') + '. Ô nào đang viền đỏ nghĩa là nhãn sai — soát lại lý thuyết: ' +
          'biến cục bộ ở [rbp-x], saved RBP ở [rbp], return address ở [rbp+4].';
        api.fail(detail);
        return;
      }
      api.pass();
    });
  }
});
