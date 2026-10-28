# ☠ PwnQuest

**Game web tương tác dạy binary exploitation (pwn) từ con số 0** — dành cho người chưa từng mở gdb. 8 level, mỗi level dạy trước rồi mới bắt làm; không cần cài gì: mở trang web là chơi.

100% HTML + CSS + vanilla JavaScript. Không build step, không npm, không framework. Chạy được cả bằng double-click `index.html` lẫn GitHub Pages.

---

## 🎮 Cách chơi

Mỗi level có **4 tab**:

| Tab | Nội dung |
|---|---|
| 📖 **THEORY** | Lý thuyết ngắn (TL;DR + ví dụ C/asm song song — hover vào dòng có marker `§n` để soi cặp dòng tương ứng giữa C và assembly) |
| 🔬 **DEMO** | Công cụ tương tác để "sờ" vào khái niệm: converter hex, memory viewer, format string playground, ROP step-through… |
| ⚔️ **CHALLENGE** | Mục tiêu 1 câu + ô nhập payload + memory viewer trực tiếp. Nhập payload → Run → xem từng byte ghi vào stack |
| 🔒 **SOLUTION** | Giải thích từng bước. Chỉ mở khi bạn **solve** hoặc **fail 3 lần** (không ai bị bỏ lại) |

- **3 mức hint** mỗi level: gợi ý khái niệm → gợi ý công cụ → gần như đáp án. Bấm lần lượt, dùng càng ít càng pro.
- **Memory viewer**: địa chỉ hex, byte 2 chữ số, cột ASCII, byte vừa bị ghi **nhấp nháy vàng**, hover từng byte xem địa chỉ + giá trị + thuộc biến nào.
- Thông báo lỗi luôn nói **chính xác** điều gì hỏng, ví dụ: *"return address = 0x41414141 (bạn đã ghi 'AAAA' vào đó) — CPU nhảy tới địa chỉ rác"*.
- Pass level → nhận **flag `PWN{...}`** + confetti. 🎉
- **Tiến độ tự lưu trong localStorage của trình duyệt** (level đã pass, hint đã dùng, số lần fail, level đang chơi). Đóng tab mở lại chơi tiếp như thường. Nút **↺ Reset** trên thanh trên xoá sạch để chơi lại từ đầu.

## 🗺️ Lộ trình 8 level

| # | Level | Bạn học được | Flag |
|---|---|---|---|
| 0 | Registers & Hex | hex, ASCII, little-endian, 6 thanh ghi chính | `PWN{h3x_1s_r34d4bl3}` |
| 1 | Stack frame ảo | biến cục bộ, saved RBP, return address nằm ở đâu | `PWN{fr4m3_of_m1nd}` |
| 2 | Ghi chuỗi vào stack | overflow là byte tràn sang ô kề — không có hàng rào | `PWN{str1ng_0v3rfl0w}` |
| 3 | Buffer overflow đầu tiên | ghi đè biến int bằng `0xdeadbeef`, escape `\xNN` | `PWN{d34db33f_d3l1v3r3d}` |
| 4 | Ghi đè return address | ret2win, cyclic pattern tìm offset | `PWN{r3t_2_w1n}` |
| 5 | Stack canary | cơ chế canary + `*** stack smashing detected ***` | `PWN{sm4sh1ng_d3t3ct3d}` |
| 6 | Bypass canary | leak canary bằng format string, rồi overflow "sạch" | `PWN{l34k_th3n_sm4sh}` |
| 7 | ROP cơ bản | gadget `pop rdi; ret` + `system("/bin/sh")` | `PWN{g4dg3t_ch41n_g0}` |

Payload format (dùng từ Level 3): chuỗi ký tự thường (`AAAA`), escape hex (`\xef\xbe\xad\xde`), số hex tự thành 4 byte little-endian (`0x08049196`), địa chỉ symbol (`&win`). Khoảng trắng chỉ là dấu phân tách token.

## 🚀 Chạy local

Cách 1 — mở thẳng: double-click `index.html`. (Chrome/Edge/Firefox đều chạy được; game không dùng ES module hay fetch nên không cần server.)

Cách 2 — local server (giống GitHub Pages nhất):

```bash
# Linux/macOS
python3 -m http.server 8000

# Windows (kèm sẵn trong repo, dev only)
powershell -ExecutionPolicy Bypass -File serve.ps1   # cổng 8642
```

## 📦 Deploy lên GitHub Pages

1. Push repo lên GitHub.
2. **Settings → Pages → Source: Deploy from a branch**.
3. Chọn branch `main`, thư mục `/ (root)`, Save.
4. Truy cập `https://<username>.github.io/<repo>/`.

Toàn bộ đường dẫn trong code đều **tương đối** (`css/style.css`, `js/...`) nên đặt trong subdirectory nào cũng chạy.

## 🏗️ Kiến trúc

```
index.html            # shell: topbar, level nav, 4 tab panels
css/style.css         # dark terminal theme
js/engine.js          # SimMemory (stack giả lập trên Uint8Array + địa chỉ ảo),
                      # hex/endian utils, payload parser, cyclic pattern
js/ui.js              # router (hash #/N), 4 tabs, hint drawer, localStorage,
                      # memory viewer, mini markdown renderer, syntax highlighter, confetti
js/levels/levelN.js   # mỗi level tự đăng ký 1 object
js/levels/index.js    # boot
serve.ps1             # (dev) static server PowerShell
```

**Mô hình bộ nhớ giả lập**: game không chạy binary C thật. Mỗi level dựng một `SimMemory` — mảng byte thẳng + địa chỉ ảo (`0xFFD000`) + nhãn vùng (`buf`, `canary`, `return address`…). Payload được parse thành mảng byte rồi **ghi tuần tự từ đầu buffer**, đúng cơ chế `read()`/`strcpy()` tràn. Engine đọc lại các ô bị tràn để kết luận: biến nào bị đè thành gì, canary hỏng ở đâu, return address nhảy đi đâu.

**Thêm level mới** (nếu muốn fork): tạo `js/levels/level8.js` export object `{ id, title, goal, flag, hints[3], theory, solution, initDemo(container, api), initChallenge(container, api) }`, push vào `PwnQuest.levels`, thêm `<script>` vào `index.html`. UI, hint, progress, solution-lock hoạt động tự động.

## ⚠️ Disclaimer

Mọi thứ ở đây là **mô phỏng phục vụ học tập** — không có binary thật, không có network. Kiến thức được dạy (buffer overflow, ret2win, canary, format string, ROP) là nền tảng chuẩn của CTF/pentest hợp pháp; hãy chỉ áp dụng trên hệ thống của bạn hoặc có sự cho phép rõ ràng.

---
*Làm với ☕ + vanilla JS. Happy hunting! 🏴*
"# PwnQuest" 
