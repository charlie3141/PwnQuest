/* ============================================================
 * PwnQuest — Level 7: ROP cơ bản
 * ============================================================ */
window.PwnQuest = window.PwnQuest || {};
PwnQuest.levels = PwnQuest.levels || [];
PwnQuest.levels.push({
  id: 7,
  title: 'ROP cơ bản',
  goal: 'Ghép gadget "pop rdi; ret" với "/bin/sh" và system() thành một ROP chain để spawn shell giả lập.',
  flag: 'PWN{g4dg3t_ch41n_g0}',

  hints: [
    'Không có win() thì tự "vẽ" hành vi mình cần: mỗi "gadget" là 1–2 lệnh kết thúc bằng ret, và ret sẽ nhảy tới GIÁ TRỊ TIẾP THEO trên stack. Vì thế chuỗi [gadget1][data][gadget2]… trên stack thực thi tuần tự như code.',
    'Chuỗi cần 3 mắt xích sau 20 byte padding: (1) 0x08050125 = "pop rdi; ret" — pop rdi lấy GIÁ TRỊ KẾ TIẾP trên stack làm đối số; (2) 0x0804B0F0 = địa chỉ chuỗi "/bin/sh"; (3) 0x0804A2C0 = system(). Kết quả: system("/bin/sh").',
    'Gần như đáp án: payload = "AAAAAAAAAAAAAAAAAAAA 0x08050125 0x0804B0F0 0x0804A2C0" — các giá trị cách nhau bởi khoảng trắng (chỉ là phân tách, không ghi byte).'
  ],

  /* ------------------------------------------------ THEORY */
  theory: [
    '# Level 7 — ROP cơ bản',
    '',
    '> **TL;DR:** Không có hàm win() để nhảy? Tự lắp. **Gadget** = vài lệnh máy có sẵn trong binary kết thúc bằng `ret`. Vì `ret` pop giá trị kế tiếp trên stack làm địa chỉ tiếp theo, chuỗi gadget đặt cạnh nhau trên stack sẽ **thực thi tuần tự** — Return-Oriented Programming. Chuỗi kinh điển: `pop rdi; ret` → `&"/bin/sh"` → `system` = gọi `system("/bin/sh")` = shell.',
    '',
    '## 1. Vì sao ret tạo ra "mã lệnh" từ dữ liệu?',
    '',
    '```',
    'ret:  rip = [rsp]; rsp += 4;   ← nhảy tới giá trị vừa pop',
    '```',
    '',
    'Nếu stack (từ vị trí ret) chứa: `[pop_rdi][binsh][system]` thì:',
    '',
    '```',
    '1. ret → rip = pop_rdi  (0x08050125)',
    '2. pop rdi → rdi = 0x0804B0F0 ("/bin/sh"); rsp tăng → chỉ vào system',
    '3. ret (cuối gadget) → rip = system (0x0804A2C0)',
    '4. system(rdi) = system("/bin/sh") → SHELL 💀',
    '```',
    '',
    'Stack của bạn — vốn là **dữ liệu** — vừa chạy như **chương trình**. NX (không thực thi được stack) vô dụng: code thật nằm trong binary, chỉ có *địa chỉ* nằm trên stack.',
    '',
    '## 2. Tìm gadget trong binary',
    '',
    'Dùng ROPgadget/ropper quét byte của binary tìm chuỗi `5f c3` (pop rdi; ret):',
    '',
    '```asm',
    '0x08050125: pop rdi ; ret     ; §1',
    '0x08050140: ret               ; §2  (gadget căn chỉnh stack)',
    '0x0804a2c0 <system>           ; §3  hàm libc',
    '0x0804b0f0: "/bin/sh"         ; §4  chuỗi có sẵn trong binary',
    '```',
    '',
    '```asm',
    'pop rdi ; ret:                ; §1',
    '    5f    pop rdi              ; §1  rdi = tham số 1 của hàm',
    '    c3    ret                  ; §1  nhảy tiếp theo chuỗi',
    '```',
    '',
    '## 3. ROP chain hoàn chỉnh',
    '',
    '```',
    'padding 20 byte | 0x08050125    | 0x0804B0F0      | 0x0804A2C0',
    'lấp buf+rbp     | pop rdi; ret  | "&/bin/sh"→rdi  | system → ret tới đây',
    '```',
    '',
    'Đây là **ret2libc** — không cần shellcode, không cần win(), chỉ cần đủ gadget. Trong đời thật còn phải tính cả stack alignment (gadget `ret` trần trụi ở trên chính là để chèn 1 lần nhảy 2/4/8 byte cho tròn 16-byte boundary của movaps trong libc mới).',
    '',
    'Hết lộ trình! Sau level này bạn đã đi trọn đường: hex → stack → overflow → ret2win → canary → leak → ROP.'
  ].join('\n'),

  solution: [
    '# Solution — Level 7',
    '',
    '## Payload',
    '',
    '```',
    'AAAAAAAAAAAAAAAAAAAA 0x08050125 0x0804B0F0 0x0804A2C0',
    '```',
    '',
    '(Khoảng trắng chỉ là dấu phân tách token — parser tự chuyển mỗi địa chỉ thành 4 byte little-endian.)',
    '',
    '## Giải thích từng bước — chạy cùng memory viewer',
    '',
    '| Stack | Giá trị | Ý nghĩa | Khi CPU tới đây |',
    '|---|---|---|---|',
    '| `0xFFD034` | `0x08050125` | gadget `pop rdi; ret` | `ret` của vuln() nhảy vào gadget |',
    '| `0xFFD038` | `0x0804B0F0` | địa chỉ `"/bin/sh"` | `pop rdi` lấy nó vào rdi, rồi `ret` nhảy qua |',
    '| `0xFFD03C` | `0x0804A2C0` | `system` | `ret` cuối gadget nhảy vào system |',
    '',
    'Trạng thái khi system bắt đầu chạy: `rdi = 0x0804B0F0` (tham số 1 = "/bin/sh"), `rsp` trỏ lên trên (byte 33+ của payload — giờ là "frame" của system).',
    '',
    '→ `system("/bin/sh")` → shell → `cat flag.txt`: `PWN{g4dg3t_ch41n_g0}`',
    '',
    '## Các lỗi kinh điển',
    '',
    '- **Đảo thứ tự** `system` trước `pop rdi`: system chạy với rdi rác → shell biến mất ngay.',
    '- **Thiếu địa chỉ `"/bin/sh"`**: pop rdi lấy nhầm system làm đối số → system(system_address) → crash.',
    '- **Padding thiếu** (19 byte): cả chain lệch 1 byte — mọi địa chỉ trong chain trở thành rác.',
    '',
    '## Sau PwnQuest',
    '',
    'Bạn đã đủ nền để chơi CTF thật: cài pwntools, dùng `cyclic`, `p32()`, `ROP()` tự động hoá chính những gì bạn vừa làm TAY ở 8 level. Happy hunting! 🏴'
  ].join('\n'),

  /* ------------------------------------------------ DEMO */
  initDemo: function (container, api) {
    const UI = api.UI, E = api.Engine;

    const POP_RDI = 0x08050125, BINSH = 0x0804b0f0, SYSTEM = 0x0804a2c0;

    const mem = new E.SimMemory({
      base: 0xffd000,
      size: 64,
      labels: [
        { name: 'buf+rbp', addr: 0xffd020, size: 20, cls: 'buf', desc: '20 byte padding (buf 16 + saved RBP 4)' },
        { name: 'ROP chain', addr: 0xffd034, size: 12, cls: 'ret', desc: 'pop_rdi | "/bin/sh" | system' }
      ]
    });

    const box = UI.el('div', 'demo-box');
    box.appendChild(UI.el('div', 'demo-title', '⚙️ Gadget có sẵn trong "binary" này'));
    const gadgetList = UI.el('div');
    const gadgets = [
      { addr: POP_RDI, asm: 'pop rdi ; ret', note: 'pop rdi = lấy giá trị kế tiếp trên stack vào rdi (tham số 1)' },
      { addr: 0x08050140, asm: 'ret', note: 'gadget trần — dùng để căn chỉnh stack (chưa cần ở đây)' },
      { addr: SYSTEM, asm: 'system @ libc', note: 'giống gõ lệnh trong terminal: system("/bin/sh") = shell' },
      { addr: BINSH, asm: '"/bin/sh"', note: 'chuỗi có sẵn trong binary — không cần tự gửi' }
    ];
    gadgets.forEach(function (g) {
      const r = UI.el('div', 'field-row');
      r.appendChild(UI.el('span', 'legend-chip rg-ret', E.hex(g.addr, 8)));
      r.appendChild(UI.el('code', null, g.asm));
      r.appendChild(UI.el('span', null, '<span style="color:var(--muted);font-size:12px"> — ' + g.note + '</span>'));
      gadgetList.appendChild(r);
    });
    box.appendChild(gadgetList);
    container.appendChild(box);

    const box2 = UI.el('div', 'demo-box');
    box2.appendChild(UI.el('div', 'demo-title', '👣 Chạy ROP chain từng bước'));
    const controls = UI.el('div', 'field-row');
    const buildBtn = UI.el('button', 'btn', '🧱 Đặt chain mẫu lên stack');
    const stepBtn = UI.el('button', 'btn btn-primary', '▶ Step');
    const resetBtn = UI.el('button', 'btn', '↺ Reset');
    controls.appendChild(buildBtn);
    controls.appendChild(stepBtn);
    controls.appendChild(resetBtn);
    const regs = UI.el('span', null, '');
    regs.style.cssText = 'font-family:var(--mono);font-size:13px;color:var(--cyan);margin-left:8px';
    controls.appendChild(regs);
    box2.appendChild(controls);

    const caption = UI.el('div', 'step-caption', 'Đặt chain mẫu rồi bấm Step để mô phỏng CPU chạy theo chuỗi gadget.');
    box2.appendChild(caption);
    container.appendChild(box2);
    const view = UI.memView(box2, mem, { animate: true });

    function reset() {
      mem.reset();
      mem.write32(0xffd034, 0x080412a7); // ret gốc
      regs.textContent = '';
      caption.innerHTML = 'ret của vuln() = 0x080412A7 (chưa bị đè). Bấm "Đặt chain mẫu".';
      view.refresh();
    }

    let state = 'fresh'; // fresh | built | popped | ret2
    buildBtn.addEventListener('click', function () {
      mem.reset();
      mem.write(0xffd020, new Array(20).fill(0x41));
      mem.write32(0xffd034, POP_RDI);
      mem.write32(0xffd038, BINSH);
      mem.write32(0xffd03c, SYSTEM);
      state = 'built';
      caption.innerHTML = 'Chain đã nằm trên stack: <code>[0xFFD034]=pop_rdi</code> → <code>[0xFFD038]="/bin/sh"</code> → <code>[0xFFD03C]=system</code>. Bấm Step.';
      regs.textContent = 'rip=0x080412A7 rdi=????????';
      view.refresh();
    });

    stepBtn.addEventListener('click', function () {
      if (state === 'fresh') { caption.innerHTML = 'Chưa có chain — bấm "Đặt chain mẫu" trước.'; return; }
      if (state === 'built') {
        state = 'popped';
        regs.textContent = 'rip=0x08050125 rdi=????????';
        caption.innerHTML = '<b>1.</b> vuln() kết thúc: <code>ret</code> pop <code>[0xFFD034]</code> → <b>rip = 0x08050125 (pop rdi; ret)</b>. CPU đang chạy… trong "dữ liệu" của bạn!';
      } else if (state === 'popped') {
        state = 'ret2';
        regs.textContent = 'rip=0x08050125→ret rdi=' + E.hex(BINSH, 8);
        caption.innerHTML = '<b>2.</b> <code>pop rdi</code> → <b>rdi = 0x0804B0F0 ("/bin/sh")</b> — tham số 1 đã sẵn sàng. rsp giờ chỉ vào [0xFFD03C].';
      } else if (state === 'ret2') {
        state = 'done';
        regs.textContent = 'rip=' + E.hex(SYSTEM, 8) + ' rdi=' + E.hex(BINSH, 8);
        caption.innerHTML = '<b>3.</b> <code>ret</code> cuối gadget pop <code>[0xFFD03C]</code> → <b>rip = system</b>!<br><b>4.</b> system(rdi) = <b>system("/bin/sh")</b> → 💀 SHELL! <code>cat flag.txt</code> → PWN{g4dg3t_ch41n_g0}';
      } else {
        reset();
      }
      view.refresh();
    });

    resetBtn.addEventListener('click', function () { state = 'fresh'; reset(); });
  },

  /* ------------------------------------------------ CHALLENGE */
  initChallenge: function (container, api) {
    const UI = api.UI, E = api.Engine;

    const POP_RDI = 0x08050125, BINSH = 0x0804b0f0, SYSTEM = 0x0804a2c0;
    const RET_ADDR = 0xffd034;

    const mem = new E.SimMemory({
      base: 0xffd000,
      size: 64,
      labels: [
        { name: 'buf+savedRBP', addr: 0xffd020, size: 20, cls: 'buf', desc: '20 byte padding' },
        { name: 'ROP chain', addr: RET_ADDR, size: 12, cls: 'ret', desc: '3 eye: gadget | đối số | hàm' },
        { name: 'trên chain', addr: 0xffd040, size: 8, cls: 'caller', desc: 'ghi đè vào đây không chết ngay — nhưng đừng' }
      ]
    });

    container.appendChild(UI.el('p', null,
      '<b>Nhiệm vụ (ret2libc tối thiểu):</b> binary KHÔNG có win(), ASLR tắt, có sẵn: gadget <code>pop rdi; ret</code> @ <code>0x08050125</code>, chuỗi <code>"/bin/sh"</code> @ <code>0x0804B0F0</code>, hàm <code>system</code> @ <code>0x0804A2C0</code>. ' +
      'Buffer 16 byte @ <code>0xFFD020</code> (+ saved RBP 4 byte = padding 20). Ghép ROP chain để chạy <code>system("/bin/sh")</code>.'));

    const box = UI.el('div', 'demo-box');
    const caption = UI.el('div', 'step-caption', 'return address hiện tại = 0x080412A7.');
    box.appendChild(caption);
    container.appendChild(box);
    const view = UI.memView(box, mem, { animate: true });

    UI.payloadForm(container, {
      label: 'Payload:',
      placeholder: 'vd: AAAA... 0x08050125 0x0804B0F0 0x0804A2C0',
      buttonLabel: '▶ Run payload',
      onRun: function (payloadText, out) {
        mem.reset();
        mem.write32(RET_ADDR, 0x080412a7);

        const res = E.applyPayload(mem, 0xffd020, payloadText);
        view.refresh();

        if (res.errors.length) {
          const msg = res.errors.map(function (e) { return e.msg; }).join(' ');
          out.showTerm('<span class="term-err">[payload lỗi]</span> ' + msg);
          api.fail('Payload có lỗi cú pháp: ' + msg);
          return;
        }

        const term = ['<span class="term-dim">$ ./level7  &lt; payload</span>',
          'read() ghi ' + res.written + ' byte vào 0xFFD020',
          'vuln() kết thúc: leave; ret'];

        const g1 = mem.read32(RET_ADDR);
        if (g1 !== POP_RDI) {
          let why;
          if (g1 === SYSTEM) {
            why = 'ret → system chạy ngay, nhưng <b>không ai nạp "/bin/sh" vào rdi</b> — giá trị rdi lúc vuln() trả về là rác không kiểm soát được → system(rác) không ra shell. Cần gadget <code>pop rdi; ret</code> (0x08050125) đứng TRƯỚC system để nạp tham số từ stack.';
          } else if (g1 === BINSH) {
            why = 'ret nhảy tới 0x0804B0F0 — đó là CHUỖI "/bin/sh", không phải code → <b>SEGFAULT (exec trên data)</b>. Mắt xích đầu phải là gadget pop rdi (0x08050125).';
          } else if (res.written <= 20) {
            why = 'Payload ' + res.written + ' byte — ROP chain (byte 21+) chưa được ghi. Cần 20 byte padding + 12 byte chain.';
          } else {
            why = 'ret = ' + E.hex(g1) + ' không phải gadget 0x08050125 → nhảy tới ' + (g1 === 0x41414141 ? '0x41414141 (AAAA) → <b>SEGFAULT</b>.' : 'địa chỉ lạ → <b>SEGFAULT</b>.') + ' Eye xích đầu tiên (byte 21–24) phải là pop rdi; ret.';
          }
          term.push('<span class="term-err">' + (g1 === SYSTEM ? 'rip = system nhưng rdi = rác (chưa có pop rdi) ✗' : 'rip = ' + E.hex(g1) + ' → SEGFAULT') + '</span>');
          out.showTerm(term.join('\n'));
          caption.innerHTML = why;
          api.fail(why);
          return;
        }

        // gadget 1 đúng: pop rdi
        const arg = mem.read32(RET_ADDR + 4);
        const g2 = mem.read32(RET_ADDR + 8);
        if (arg !== BINSH) {
          const why = '<code>pop rdi</code> → rdi = <b>' + E.describeDword(arg) + '</b> ≠ 0x0804B0F0 ("/bin/sh"). Giá trị NGAY SAU gadget trên stack phải là địa chỉ chuỗi "/bin/sh".';
          term.push('pop rdi → rdi = ' + E.hex(arg));
          term.push('<span class="term-err">system(' + E.hex(arg) + ') → sh: invalid call → crash</span>');
          out.showTerm(term.join('\n'));
          caption.innerHTML = why;
          api.fail(why);
          return;
        }
        if (g2 !== SYSTEM) {
          const why = 'rdi = "/bin/sh" ✓ nhưng sau pop rdi, <code>ret</code> nhảy tới <b>' + E.hex(g2) + '</b> ≠ system (0x0804A2C0). Mắt xích thứ 3 trên chain là địa chỉ system.';
          term.push('pop rdi → rdi = 0x0804B0F0 ✓');
          term.push('<span class="term-err">ret → ' + E.hex(g2) + ' → SEGFAULT</span>');
          out.showTerm(term.join('\n'));
          caption.innerHTML = why;
          api.fail(why);
          return;
        }

        term.push('ret → pop rdi; ret');
        term.push('pop rdi → rdi = 0x0804B0F0 ("/bin/sh")');
        term.push('ret → system');
        term.push('<b>system("/bin/sh")</b>');
        term.push('$ whoami');
        term.push('<span class="term-dim">player</span>');
        term.push('$ cat flag.txt');
        term.push('<b>PWN{g4dg3t_ch41n_g0}</b>');
        out.showTerm(term.join('\n'));
        caption.innerHTML = '💀 SHELL! chain hoàn chỉnh: gadget → đối số → hàm. Bạn vừa viết ROP chain đầu đời.';
        api.pass();
      }
    });
  }
});
