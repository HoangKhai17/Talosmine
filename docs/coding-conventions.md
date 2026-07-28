# Quy ước viết code — Talosmine

> **Đối tượng:** mọi agent viết code trong repo này, và người review.
> **Bắt buộc đọc trước khi sửa file đầu tiên của một task.**

---

## 0. File này KHÔNG phải danh sách "clean code"

Những nguyên tắc chung ("viết code sạch", "DRY", "đặt tên rõ ràng") thì ai cũng đồng ý và
không ai làm sai vì thiếu chúng. Chúng không ngăn được lỗi nào.

File này chỉ ghi **những kiểu sai đã thật sự xảy ra trong repo này**, mỗi kiểu kèm:

- **Luật** — phát biểu kiểm được, không phải lời khuyên.
- **Vì sao** — sự cố cụ thể đã xảy ra.
- **Cách kiểm** — thao tác làm được trong 30 giây.

Không mục nào ở đây là ý kiến. Nếu bạn thấy một luật cản trở việc đúng, đó là dấu hiệu luật
cần sửa — hãy nói ra, đừng lách.

---

## 1. Không viết code chưa có nơi gọi

**Luật.** Mọi hàm/type/hằng được `export` phải có ít nhất một nơi gọi thật **trong cùng lượt
làm việc**, hoặc một test gọi nó. Không có → không viết.

Cấm tuyệt đối: viết sẵn hàm "để sau này dùng", tham số "để sau này mở rộng", nhánh `if` cho
trường hợp chưa tồn tại.

**Vì sao.** 2026-07-27, `i18n/messages/index.ts` có hàm `translate()` với logic fallback đầy
đủ và **không nơi nào gọi**. Nó trông hữu ích nên suýt được giữ lại. Vấn đề: *một hàm fallback
chưa ai gọi là một hàm chưa ai chạy thử*. Khi có người gọi lần đầu, nó sẽ là code chưa từng
chạy đội lốt code đã có sẵn. Đã xoá; phần fallback thật được viết cùng nơi gọi nó ở bước sau.

**Cách kiểm.** Với mỗi thứ vừa `export`:

```bash
grep -rn "tênHàm" --include="*.ts" --include="*.tsx" apps/ tests/ | grep -v node_modules
```

Chỉ ra đúng một dòng (chính chỗ khai báo) → xoá nó đi.

---

## 2. Thay thế thì xoá bản cũ ngay trong cùng lượt

**Luật.** Khi một đoạn code bị thay bằng đoạn khác, bản cũ bị **xoá** — không comment lại,
không đổi tên thành `xxxOld`, không để lại "phòng khi cần".

**Ngoại lệ duy nhất:** bản cũ có **vai trò mới, có nơi gọi**. Lúc đó nó không phải rác.

**Vì sao.** Git đã giữ lịch sử. Code chết để lại thì lần đọc sau không ai biết nhánh nào còn
sống, và người sửa phải giữ trong đầu cả hai.

**Phân biệt bằng ví dụ thật.** Khi CMS thay nhãn menu hardcode:

- ✅ Hằng cũ **giữ lại** thành `fallbackNav()` — có nơi gọi, có lý do (Control Plane chết thì
  trang vẫn render), có test.
- ❌ Nếu chỉ để đó "biết đâu cần" thì phải xoá.

Khác biệt không nằm ở đoạn code, mà ở chỗ **có trả lời được câu "ai gọi nó, khi nào"** hay không.

**Cách kiểm.** `git diff` cuối lượt: mỗi khối thêm vào phải có khối bị xoá tương ứng, hoặc
giải thích được vì sao không có.

---

## 3. Trước khi "sửa lỗi", phải biết chỗ đó có chủ đích hay không

**Luật.** Gặp một giá trị hoặc cách viết trông sai, **tìm bằng chứng về chủ đích trước khi
sửa**: comment giải thích, test khoá giá trị, record trong `build-plan/decision-register.md`.

- Có bằng chứng → **tôn trọng nó**. Muốn đổi thì đó là quyết định thiết kế, phải nêu ra và
  sửa cả test.
- Không có → sửa được, nhưng nói rõ trong báo cáo mình đã đổi cái gì.

**Vì sao.** Đây là kiểu sai **đặc trưng của AI**: thấy "bất đối xứng" thì tưởng là lỗi rồi
"dọn dẹp".

Sự cố thật, 2026-07-27: footer ở tablet để `.footerBrand { grid-column: span 8 }`, khiến ba
cột link chỉ lấp 6/8 và chừa hai cột trống. Trông y như lỗi. Đã sửa thành `span 2` cho "đều".
Chạy e2e → đỏ: [`grid.spec.ts`](../tests/e2e/grid.spec.ts) khoá cứng
`{ desktop: 3, tablet: 8, mobile: 4 }`, khớp comment trong CSS. Hai cột trống là **chủ đích** —
khối thương hiệu có đoạn mô tả nên được cả hàng, và 8 không chia hết cho 3. Đã hoàn tác.

Nếu bộ test không có bài đó, một quyết định thiết kế đã bị xoá âm thầm.

**Cách kiểm.** Trước khi đổi một giá trị "trông lạ":

```bash
grep -rn "<giá trị>" tests/ docs/ --include="*.ts" --include="*.md" | grep -v node_modules
```

---

## 4. Hardcode: bốn loại, xử lý khác nhau

Không phải mọi giá trị viết thẳng đều là hardcode xấu. Phân loại trước khi xử lý.

| Loại | Ví dụ | Chỗ đúng |
|---|---|---|
| **Giá trị nghiệp vụ** | quota, giá, SLA, danh sách app, retention | **Chỉ chủ dự án chốt.** Chưa có → để `‹cần chốt: …›` và **DỪNG** |
| **Cấu hình môi trường** | base URL, port, host, secret | biến env, đọc qua `server/env.ts` hoặc `shared/env.ts` |
| **Chữ hiển thị** | nhãn nút, tiêu đề, thông báo lỗi | message catalog (`i18n/messages`) hoặc CMS — xem DEC-T25 |
| **Hằng kỹ thuật** | TTL cache, độ dài tối đa, số lần thử lại | hằng **có tên**, khai gần nơi dùng, kèm comment nêu **vì sao đúng giá trị đó** |

**Luật.** Một số hoặc chuỗi trần nằm giữa logic là lỗi, **trừ khi** nó vừa có tên vừa trả lời
được câu "vì sao là giá trị này, không phải giá trị khác".

```ts
// ❌ số trần, không ai biết vì sao 60000
if (Date.now() - cached.at < 60000) return cached.value;

// ✅ có tên, có lý do, có nguồn quyết định
/** TTL 60 giây (DEC-T26). Đổi số này là đổi độ trễ người biên tập nhìn thấy. */
const TTL_MS = 60_000;
```

**Nhắc riêng về loại 1.** Agent tự điền một giá trị nghiệp vụ là **lỗi nghiêm trọng nhất**
trong dự án này — nó biến một blocker nhìn thấy được thành một giả định ẩn. Xem `AGENTS.md`,
mục "Ranh giới ủy quyền".

---

## 5. Tái sử dụng: gom ở lần thứ hai, đừng trừu tượng hoá ở lần thứ nhất

**Luật hai chiều.**

- Thấy **lần thứ hai** một đoạn logic giống nhau (>3 dòng) → **gom lại ngay**, đừng copy.
- Chỉ có **một** nơi dùng → **không** tạo lớp trừu tượng. Viết thẳng.

Hai lỗi này ngược nhau nhưng cùng một gốc: quyết định trừu tượng hoá không dựa trên bằng chứng.

**Ví dụ đúng, cùng một ngày.**

- Ba cột footer render giống hệt nhau → gom thành hàm `column(items, pending)` ngay trong
  file, không tạo file mới.
- Năm chỗ trong trang admin đều "khoá nút → gọi API → tải lại → hiện thông báo" → gom thành
  `mutate(action, success)`.
- Ngược lại: `checkNavHref` **không** được nhét vào một `utils.ts` chung. Nó là luật của một
  module, sống trong module đó.

**Cấm.** Tạo `utils.ts` / `helpers.ts` / `common.ts` làm nơi chứa mọi thứ không biết để đâu.
Một hàm không biết thuộc module nào là dấu hiệu ranh giới module chưa rõ — xem `modular.md`,
đừng giấu vấn đề vào một cái tên chung chung.

**Cách kiểm.** Sắp copy-paste quá 3 dòng → dừng, gom. Sắp tạo file `*-utils.ts` → dừng, hỏi
"nó thuộc module nào".

---

## 6. Test phải đo đúng thứ nó tuyên bố

**Luật.** Một assertion phải fail được khi thứ nó bảo vệ bị hỏng. Assertion luôn đúng (hoặc
luôn sai) vì lý do môi trường thì **tệ hơn không có** — nó tạo cảm giác an toàn giả.

**Vì sao.** 2026-07-27, khi thêm bảng `nav_items` đã viết:

```ts
expect(await can('nav_items', 'SELECT')).toBe(true);   // luôn false ở test container
```

Ở testcontainers, migration chạy bằng **superuser**, nên `ALTER DEFAULT PRIVILEGES FOR ROLE
talosmine_migration` không áp dụng. Assertion đó đo **môi trường test**, không đo migration.
Đã thu hẹp về đúng thứ kiểm được: `UPDATE`/`DELETE`, vì chúng đến từ câu `GRANT` tường minh
trong migration nên chạy như nhau ở mọi môi trường.

**Cách kiểm.** Với mỗi assertion mới, hỏi: *"Nếu tôi cố ý phá thứ này, bài test có đỏ không?"*
Không chắc → thử phá thật rồi chạy lại.

**Luật kèm theo** (đã có ở `AGENTS.md` §4b, nhắc lại vì hay bị vi phạm nhất): test fail thì
sửa **code**, không sửa test. Bẻ cong thước đo là tự lừa mình.

---

## 7. Môi trường test không phải môi trường chạy thật

**Luật.** Khi thêm bảng, quyền, biến env hay tài nguyên hạ tầng, hỏi: **"kết nối/định danh mà
test dùng có giống cái ứng dụng thật dùng không?"** Khác nhau → phải có phép kiểm riêng.

**Vì sao.** Bug thật, suýt lọt ra production, 2026-07-27.

Migration `0010_site_nav` tạo ba bảng. Test integration: **25/25 xanh**. Nhưng bảng mới chỉ
thừa hưởng `SELECT, INSERT` từ default privileges — thiếu `UPDATE` và `DELETE` cho
`talosmine_runtime`.

Test không bắt được vì testcontainers nối bằng **superuser**, còn ứng dụng nối bằng
`talosmine_runtime`. Ở dev và production, mọi thao tác sửa/xoá/sắp xếp sẽ chết với
`permission denied`; chỉ thêm mới và đọc là chạy.

Phát hiện ra chỉ vì tình cờ thử chèn dữ liệu bằng tay vào DB dev.

**Cách kiểm.** Sau khi migration chạy xong, luôn thử một thao tác **ghi** bằng đúng vai trò
ứng dụng dùng — hoặc viết assertion trên `has_table_privilege`.

---

## 8. Đường mạng ở client: `fetch` và điều hướng không thay thế nhau

**Luật.** Trước khi viết một lời gọi mạng phía client, xác định nó là **fetch** (dữ liệu quay
về code của mình) hay **điều hướng** (trình duyệt rời trang). Chọn sai thì CSP chặn, hoặc
JavaScript của trang đích không bao giờ chạy.

**Hai sự cố thật trong một ngày.**

1. Link "Đăng nhập" dùng `<Link>` nên Next **prefetch** nó → chạy trọn route `/auth/login` →
   sinh state/nonce/PKCE → redirect xuyên origin → dính `connect-src 'self'`. Mỗi lần link lọt
   vào viewport là một transaction OIDC rác. Sửa: `prefetch={false}`.
2. Đăng xuất: nếu route trả `303` sang trang kết thúc phiên của IdP thì `fetch` sẽ **đi theo**
   redirect đó — vừa xuyên origin (CSP), vừa vô ích vì `fetch` không chạy JavaScript, mà trang
   đó **tự submit form bằng JavaScript**. Sửa: route trả JSON, client tự `window.location`.

**Cách kiểm.** Đích đến có nằm ngoài origin của mình không? Có → phải là điều hướng cấp cao
nhất, không phải `fetch`. Mở DevTools Console tìm chữ `Content Security Policy` sau khi thao tác.

---

## 9. CSS

**Không lặp lại ở đây.** [`frontend-css-rules.md`](./frontend-css-rules.md) là nguồn sự thật:
token, cấm giá trị thô, thang spacing, cấm `!important`, đặt tên class, ba luật của lưới,
accessibility, và checklist trước khi commit.

Ba điều hay bị quên nhất, nhắc lại nguyên văn:

1. **Không bao giờ viết giá trị thô** — mọi màu, khoảng cách, bo góc đều từ token.
2. **Không khai lại `display: grid` + `grid-template-columns`** trong CSS Module; dùng class
   `grid` toàn cục.
3. **Chỉ con TRỰC TIẾP của `.grid`** mới đặt được `grid-column`. Bọc thêm một `<div>` là phần
   tử bên trong rơi khỏi lưới.

---

## 10. Giới hạn phạm vi

**Luật.** Chỉ sửa thứ nằm trong yêu cầu. Thấy chỗ khác đáng sửa → **ghi lại và báo**, không
tiện tay sửa.

**Vì sao.** Một diff làm hai việc thì không review được việc nào, và khi có lỗi thì không biết
việc nào gây ra. Với AI, "tiện tay dọn dẹp" còn nguy hiểm hơn vì nó thường dọn nhầm thứ có
chủ đích (mục 3).

**Ngoại lệ.** Sửa đúng thứ mình vừa làm hỏng thì không phải mở rộng phạm vi — đó là hoàn thành
việc. Ví dụ: layout thành async làm hai bài e2e đỏ ngẫu nhiên → sửa hai bài đó là bắt buộc.

---

## 11. Danh sách kiểm trước khi báo "xong"

Chạy hết, không bỏ mục nào. Mục nào không chạy được thì **nói ra**, đừng im lặng.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @talosmine/web run build   # lỗi CSP/nonce CHỈ hiện ở production build
pnpm test:e2e
pnpm openapi:drift                        # nếu có đụng contract
```

Và tự hỏi:

- [ ] Mọi thứ vừa `export` đều có nơi gọi thật? (mục 1)
- [ ] Code cũ bị thay đã **xoá**, không phải comment lại? (mục 2)
- [ ] Có đổi giá trị nào đang được test hay comment bảo vệ không? (mục 3)
- [ ] Còn số/chuỗi trần nào không giải thích được vì sao? (mục 4)
- [ ] Có đoạn nào copy-paste lần thứ hai mà chưa gom? (mục 5)
- [ ] Assertion mới có fail được khi thứ nó bảo vệ hỏng không? (mục 6)
- [ ] Có thêm bảng/quyền nào mà kết nối test khác kết nối app không? (mục 7)
- [ ] Diff có làm việc gì ngoài yêu cầu không? (mục 10)
- [ ] Tài liệu bị thay đổi này làm sai đã cập nhật chưa?

---

## 12. Khi một luật ở đây cản trở việc đúng

Nói ra. Luật sai thì sửa luật, kèm lý do và ngày.

Điều **không** được làm: im lặng lách qua rồi báo xong. Đúng bằng lý do đã ghi ở `AGENTS.md` —
một blocker nói ra thì hữu ích, một cách lách âm thầm là cái bug sẽ lộ ra sau, ở chỗ khó tìm
hơn nhiều.
