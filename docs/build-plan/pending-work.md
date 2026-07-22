# Việc còn treo

> **Mục đích:** ghi lại mọi thứ đã biết là chưa làm, để không phải nhớ bằng đầu và không
> ai tưởng nhầm là đã xong. Cập nhật lần cuối **2026-07-22**.
>
> Quy tắc của file này: chỉ ghi việc **đã xác định**, kèm **vì sao nó quan trọng** và
> **điều gì đang chặn**. Không ghi ý tưởng chưa chín — chỗ đó là decision register.
>
> Mục đã xong **giữ nguyên số hiệu** và được đánh dấu ✅ thay vì xoá đi. Xoá thì lần rà sau
> rất dễ có người thêm lại đúng mục đó vì không thấy dấu vết nào.

---

## A. Chờ quyết định của chủ dự án

Agent **không** tự quyết mục nào trong phần này (DEC-G01).

### A1. Recovery flow — ĐANG CHẶN EXIT GATE P2

Luồng khôi phục truy cập khi người dùng quên mật khẩu.

§18 của phase-2 nêu rõ: phải **hoặc** hiện thực, **hoặc** ra quyết định loại bỏ rồi cập
nhật đồng bộ **bốn** nguồn — `docs/index.md`, `docs/modular.md`, OpenAPI/browser contract,
và build plan. Có quyết định mà chưa cập nhật đủ bốn thì P2 vẫn `blocked`.

**Đã kiểm chứng (2026-07-21):** Logto **có sẵn** luồng quên mật khẩu qua email, nhưng
hiện **không dùng được**:

```
connectors:        0 dòng          ← chưa có kênh gửi email
signIn.methods:    username only   ← chưa bật email làm định danh
trang /sign-in:    không có link "Forgot password"
```

Logto tự ẩn chức năng này khi thiếu hai điều kiện trên — không phải bị tắt ở đâu đó.

**Cần chốt:** nhà cung cấp email. Đây là quyết định có ràng buộc về **nơi lưu dữ liệu**,
cùng lý do đã khiến bỏ Auth0 (DEC-T22):

| Hướng | Đánh đổi |
|---|---|
| SMTP tự vận hành | Dữ liệu không rời hạ tầng của chủ dự án. Phải tự lo deliverability, SPF/DKIM/DMARC |
| Nhà cung cấp trong nước | Cân bằng giữa tiện và nơi trú dữ liệu |
| SendGrid / Mailgun / SES | Dễ nhất, deliverability tốt, nhưng email người dùng đi ra máy chủ nước ngoài |

Sau khi có email connector, **phía Talosmine không phải viết thêm dòng code nào** — bật
lên trong Logto Admin Console là chạy. Đó là toàn bộ giá trị của việc giao xác thực cho IdP.

Lưu ý: tài khoản đã tồn tại hiện có `email` rỗng (đăng ký bằng username), nên chưa khôi
phục được cho tới khi bổ sung email.

### A2. CAPTCHA — DEC-T23 (`proposed`)

Logto có bảng `captcha_providers` nên hỗ trợ sẵn ở tầng IdP. Cần chốt nhà cung cấp.

Ghi chú kỹ thuật đã có trong decision register: CAPTCHA chống **bot đăng ký hàng loạt**;
chống **brute-force mật khẩu** thì rate limiting hiệu quả hơn nhiều. Cần cả hai, đúng chỗ.

### A3. Xoay Logto App Secret — VIỆC BẢO MẬT

App Secret hiện dùng **đã lộ trong hội thoại**. Phải thay:

1. Logto Admin Console (`localhost:3002`) → Applications → app đang dùng → tạo secret mới
2. Cập nhật `OIDC_CLIENT_SECRET` ở **cả hai** nơi: `.env.dev` và `apps/web/.env.local`
3. Khởi động lại BFF

### A4. DEC-B01 — danh sách ứng dụng của Hub

`open` từ đầu dự án. **Chặn P3, P6, P7.** Không tồn tại ở bất kỳ đâu trong repo.

Cần: có những app nào, ai sở hữu, chạy ở domain nào.

**Hệ quả cụ thể đang thấy được (2026-07-22):** `CATALOG_ALLOWED_HOSTS` đang **rỗng**, nên
mọi URL nhập vào danh mục đều bị từ chối. Đó là hành vi đúng theo thiết kế, không phải lỗi
— cơ chế đã dựng và có 31 test, chỉ là danh sách chưa có nội dung. Giao diện quản trị
`/admin/catalog` đã chạy nhưng chưa tạo được ứng dụng nào cho tới khi có host hợp lệ.

Câu hỏi lớn hơn nằm dưới DEC-B01, cần chốt trước: **Talosmine là hub ~10 ứng dụng do chủ
dự án kiểm soát** (như `docs/index.md` mô tả), **hay là thư mục công cụ AI mở cho người
ngoài gửi lên** (như wireframe Figma mô tả với "10.000+ công cụ", "Submit a Tool")? Hai thứ
này cần hai lược đồ dữ liệu khác nhau. Xem thêm A8.

### A5. DEC-B05 — đơn vị đo của `usage_metrics`

`open`. **Chặn toàn bộ endpoint chỉ số sử dụng của P3.**

Cột `unit` là `NOT NULL`, và §3 của phase-3 nói rõ: giá trị phải được chủ dự án duyệt
**trước khi tạo bất kỳ dòng nào**. Không có giá trị mặc định, không có placeholder — hạn
mức ở P5 tính trên chính con số này, nên một đơn vị gõ đại sẽ làm sai mọi phép tính về sau.

Cần: danh sách đơn vị hợp lệ (ví dụ "lượt", "phút", "MB"), và quy tắc chọn đơn vị cho một
chỉ số mới.

`counting_point` và `failure_treatment` **không** chặn: chúng được phép để trống ở trạng
thái nháp cho tới quyết định của P5.

### A6. Exact redirect URI của từng ứng dụng

`open`. Chặn việc **kích hoạt** bất kỳ ứng dụng nào.

Cơ chế đã xong: allowlist so khớp chính xác từng ký tự, không wildcard, lưu ở dạng chuẩn
hoá. Thiếu là **nội dung**: mỗi app dùng URI đăng nhập/đăng xuất nào.

§3 của phase-3 còn đòi thêm một bước quy trình: **chủ ứng dụng phải xác nhận quyền sở hữu
domain trước khi kích hoạt**. Bước này hiện chưa có ai định nghĩa là làm thế nào.

### A7. Metadata baseline cho `service_identities`

`open`. Chưa chặn gì đang chạy, nhưng chặn bước onboarding ứng dụng.

Cần: issuer, M2M client ID đã cấp, tên hiển thị, chủ sở hữu và trạng thái ban đầu của từng
ứng dụng.

**Không** cần và **không** được cung cấp: client secret, access token, refresh token. Bảng
cố ý không có cột cho chúng.

### A8. Blog, "Gửi công cụ", "Liên hệ" — chưa thuộc phase nào

Xem D1. Ghi ở đây vì đây là quyết định của chủ dự án, không phải việc kỹ thuật.

---

## B. Việc kỹ thuật P2 còn thiếu

Không chờ ai — agent làm được ngay.

### B1. Negative test cho luồng OIDC — ƯU TIÊN CAO NHẤT

§14 yêu cầu test cho: `state` sai/hết hạn, `nonce` sai, PKCE thất bại, sai
issuer/audience/chữ ký/hạn dùng, callback replay, và open redirect (host/path/port gần
giống, wildcard, encoded payload, protocol-relative).

**Hiện chưa có test nào cho luồng auth.** Nó mới chỉ được chứng minh bằng việc chủ dự án
bấm đăng nhập thành công một lần. Đây là khoảng trống lớn nhất còn lại của P2.

Cài đặt cần kiểm: [`oidc-verifier.ts`](../../apps/control-plane/src/modules/identity/oidc-verifier.ts),
[`callback/route.ts`](../../apps/web/app/auth/callback/route.ts), `safeReturnTo` trong
[`oidc.ts`](../../apps/web/server/oidc.ts).

### B2. E2E cho các trang cần đăng nhập

**108 test e2e** (2026-07-22) phủ: shell, CSP trên từng trang, lưới cột, responsive, bàn
phím, breadcrumb.

**Chưa phủ — tất cả đều cần một phiên đăng nhập thật:** đăng nhập, `/account`,
`/account/sessions`, `/admin`, `/admin/audit`, `/admin/roles`, `/admin/catalog`.

Khoảng trống chung là **fixture phiên admin cho Playwright**: chưa có cách dựng một phiên
hợp lệ trong e2e, nên mọi màn hình sau đăng nhập đều nằm ngoài tầm phủ. Làm cái đó một lần
sẽ mở khoá toàn bộ danh sách trên.

§17 cũng đòi accessibility (hoàn tất bằng bàn phím) và responsive cho các màn hình đó.

### B3. Observability — §17

- **Correlation ID xuyên BFF → API → audit.** Control Plane đã có
  (`shared/correlation.ts`); **BFF chưa nối** — nó không truyền correlation ID sang.
- **Metric** cho callback outcome, session revoke, RBAC deny: **chưa có gì**.

### B4. Rollback rehearsal — §17 — ✅ ĐÃ XONG (2026-07-22)

Ba file gỡ ở [`apps/control-plane/drizzle/rollback/`](../../apps/control-plane/drizzle/rollback/)
và bài diễn tập tự động ở `tests/integration/migration-rollback.test.ts` (11 test): dựng
schema đầy đủ trên PostgreSQL thật, gỡ ngược lại, kiểm chứng schema quay đúng về trạng thái
cuối P2 — gồm cả việc ràng buộc actor của audit trở lại dạng chỉ `account`/`system`, trigger
append-only còn nguyên và vẫn chặn `UPDATE`.

Đã kiểm chứng bằng cách phá: đảo thứ tự gỡ thì **4 test đỏ** đúng chỗ.

**Đính chính tên:** trigger tên là `audit_events_append_only`, **không** có hậu tố `_trg`.
Phase-3 §15 đang gọi sai tên — xem F9.

### B5. Kết quả CI

Commit `e0e362d` đã push lên `origin/main`. Cần xem CI xanh hay đỏ — đây là điều kiện 7
của exit gate P1, chưa từng được xác nhận.

---

## C. Thiết kế / UI còn treo

### C1. Thang typography cho mobile và tablet

Quy chuẩn của chủ dự án **chỉ có bảng Desktop** (đã đối chiếu 2026-07-21: khớp 100%).
Thang mobile hiện tại trong `globals.css` **do agent ước lượng**, không đến từ Figma.

**Cần:** `font-size` + `line-height` của 9 style ở frame **390px** và **1024px**.

Hệ quả đang tồn tại: thang desktop bật từ **768px**, nên màn 1024px nhận hero **64px**.
Đó là cách lấp chỗ trống, và nó **mâu thuẫn** với chính bảng breakpoint (Desktop = 1280px).
Có bảng tablet thì sửa được cả hai.

### C2. Nhịp cột đọc từ ảnh chụp — cần số chính xác từ Figma

Đo pixel trên ảnh không đủ chính xác để suy ngược ra số cột. Các giá trị sau là **ước lượng**:

| Khối | Đang dùng (mobile/tablet/desktop) |
|---|---|
| Hero heading / lead / search | 4-6-**10** · 4-6-6 · 4-7-8 |
| Danh mục (nhịp lặp 7 ô) | 3+5+4 rồi 3+4+3+2 |
| Blog nổi bật / phụ | 4-8-6 · 4-8-6 |
| FAQ giới thiệu / danh sách | 4-8-5 · 4-8-7 |

Sửa = đổi con số trong `page.module.css`, **không dựng lại layout**.

### C3. Tương tác chưa có

Tất cả đều là **nút có mặt đúng chỗ trong bố cục nhưng chưa gắn hành vi**. Không cái nào
giả vờ chạy: nút chưa có backend thì để `disabled` hoặc render bằng chữ, không phải link.

- **Mũi tên băng đối tác** (trang chủ) — băng chạy tự động và cuộn tay được, hai nút mũi
  tên chưa có hành vi (cần client component + state).
- **Mũi tên dải danh mục** (`/tools`) — cùng tình trạng. Bàn phím vẫn tới được mọi pill nhờ
  Tab, nên không ai bị kẹt.
- **Tab lọc chủ đề** (`/blog`) — sẽ chuyển sang `searchParams` khi có dữ liệu thật, để lọc
  nằm trên URL và chia sẻ được link.
- **Ô tìm kiếm ở hero** và **bộ lọc `/tools`** — chưa có đích đến, chặn bởi F1.
- **Form newsletter** — chưa có backend.
- **Biểu mẫu đăng nhập / đăng ký** (`/auth`, `/auth/sign-up`) — cố ý chưa nối. Xem C5.
- **"Mở ứng dụng thư" và "Gửi lại"** (`/auth/check-email`) — chặn bởi A1 (chưa có SMTP).

### C5. Biểu mẫu xác thực theo Figma — quyết định kiến trúc chưa chốt

`/auth`, `/auth/sign-up` và `/auth/check-email` đã dựng theo thiết kế Figma, nhưng **biểu
mẫu không nối vào đâu, và đó là chủ đích**.

Hiện tại mật khẩu người dùng **chưa bao giờ đi qua code của Talosmine**: `/auth/login` đẩy
sang Logto, người dùng gõ mật khẩu ở đó, rồi quay về với một authorization code. Đường đăng
nhập thật vẫn còn nguyên ở cuối trang.

Ba hướng, chủ dự án chọn:

| Hướng | Giao diện | Mật khẩu đi tới |
|---|---|---|
| Giữ nguyên | Trang mặc định của Logto | Logto |
| **Bring your own UI** (`customUiAssets`) | **Thiết kế Figma** | **Logto** |
| Experience API trong Next.js | Thiết kế Figma | **App của ta** rồi mới tới Logto |

Hướng giữa cho đúng thứ đang cần mà không kéo mật khẩu vào phạm vi code của mình. Cái giá:
gói tải lên là HTML/CSS/JS **tĩnh thuần**, nên bố cục hiện tại phải chuyển thể chứ không
copy được.

Ba thứ cần sửa ở Logto trước, độc lập với hướng nào (đã đọc từ API của instance đang chạy,
2026-07-22):

```
branding.logoUrl: "https://logto.io/logo.svg"   ← trang đăng nhập đang tải logo TỪ MÁY CHỦ
                                                   CỦA LOGTO: rò IP và Referer của người
                                                   dùng sang bên thứ ba
languageInfo:     { autoDetect: true, fallbackLanguage: "en" }
                                                ← lý do giao diện nhảy sang tiếng Pháp
hideLogtoBranding: false                        ← dòng "Powered by Logto" ở chân trang
signUp.identifiers: ["username"]                ← đăng ký bằng tên đăng nhập, KHÔNG phải email
socialSignIn:     {}                            ← chưa có connector Google nào
```

Logto 1.41 **không có tiếng Việt** (đã thử `?lng=vi` → rơi về tiếng Anh). Muốn tiếng Việt
phải tự thêm qua Custom Phrases.

Cấu hình này nằm trong **database của Logto, không nằm trong git**. Chỉnh tay qua Admin
Console thì máy dev một kiểu, production một kiểu. Nên viết script gọi Management API đặt
trong `infra/` — cùng lý do không tạo bảng bằng tay mà viết migration.

### C4. Bảng màu dark

`globals.css` khoá `color-scheme: light`. Quy chuẩn chỉ định nghĩa bảng sáng; bật dark mà
tự bịa màu sẽ lệch thiết kế. Cần chủ dự án cung cấp bảng dark.

---

## D. Khoảng trống giữa thiết kế và kế hoạch

### D1. Blog, "Gửi công cụ", "Liên hệ" không nằm trong phase nào

Ba mục này có trong thiết kế Figma và **đã dựng bố cục đầy đủ**, nhưng **build plan P0–P9
không có mục nào** cho hệ thống blog, luồng đề xuất công cụ hay trang liên hệ.

| Route | Trạng thái (2026-07-22) |
|---|---|
| `/blog` | Bố cục đầy đủ, dữ liệu mẫu |
| `/blog/[slug]` | Bố cục đầy đủ, dữ liệu mẫu, chưa đọc `slug` |
| `/submit` | Trang chỗ giữ chỗ |
| `/contact` | Trang chỗ giữ chỗ |

Blog còn thiếu **toàn bộ tầng dữ liệu**: chưa có bảng, chưa có API, chưa có trang quản trị
soạn bài. Bố cục dựng trước theo yêu cầu của chủ dự án.

**Cần chủ dự án quyết định:** đưa vào phase nào, hay bỏ khỏi thiết kế.

### D2. Trang chủ và `/tools` đã lấn sang P3 — có chủ đích

Lưới "Tìm đúng công cụ" / "Khám phá danh mục" ở trang chủ, và toàn bộ trang `/tools`
(bộ lọc, dải danh mục, lưới kết quả) chính là UI catalog mà §10 của phase-3 mô tả. Layout
dựng trước theo yêu cầu, dữ liệu là mẫu (`PLACEHOLDER_*`).

**Sang P3 chỉ thay các mảng đó bằng lời gọi API — không dựng lại layout.** Ghi ở đây để
người làm P3 không tưởng là phải làm lại từ đầu. Việc còn lại xem F2.

### D3. `/categories` tồn tại nhưng chưa có nghĩa

Route `/categories` đang là trang chỗ giữ chỗ. **Build plan không định nghĩa taxonomy nào**,
và §3 của phase-3 nói thẳng: *"Không tự thêm taxonomy/category nếu requirement chưa có."*

Đã kiểm: database không có bảng `categories`, `applications` không có cột `category`, và
toàn bộ `apps/control-plane` không có một chữ "category" nào.

Mục "Danh mục" đã được **gỡ khỏi menu người dùng** (2026-07-22) theo yêu cầu chủ dự án, vì
nó là do agent tự thêm chứ không có trong header của wireframe. Route và link ở footer vẫn
còn.

**Cần chủ dự án quyết định:** `/categories` là trang lưới danh mục riêng, hay trùng với
`/tools` và nên xoá.

---

## E. Ngoài phạm vi hiện tại nhưng cần nhớ

### E1. Production deploy — thuộc P8

Chưa có: Dockerfile cho `apps/web` và `apps/control-plane`, compose production, cấu hình
Caddy/HTTPS, trình quản lý tiến trình.

Ràng buộc đã biết: cookie `__Host-` **bắt buộc HTTPS**; cổng 3002 (Admin Console Logto)
**không được** mở ra internet.

### E2. Back-channel logout từ IdP

Cột `web_sessions.idp_sid` đã có sẵn cho mục đích này nhưng **chưa có endpoint** nhận tín
hiệu logout từ Logto. Khi người dùng đăng xuất ở phía IdP, phiên Talosmine hiện vẫn sống
tới khi hết hạn.

---

## F. Phase 3 — việc kỹ thuật còn lại

Trạng thái tổng thể (2026-07-22), đối chiếu với 14 bước ở §15 của phase-3:

| Bước | Nội dung | Trạng thái |
|---|---|---|
| 1 | Thu quyết định nghiệp vụ | ⚠ Còn A4, A5, A6, A7 và F1 |
| 2 | Freeze OpenAPI | ✅ 30 path, lint valid, drift OK |
| 3–6 | Bốn migration theo thứ tự phụ thuộc | ✅ `0007`–`0009` |
| 7 | Test thứ tự migration + rollback | ✅ Xem B4 |
| 8 | Domain, port, URL policy | ✅ Gồm cả `CatalogLookupPort` |
| 9 | Controller user + admin | ◐ Thiếu endpoint chỉ số — chặn bởi A5 |
| 10 | UI danh mục người dùng | ◐ Bố cục xong, chưa nối API — xem F2 |
| 11 | UI quản trị danh mục | ◐ Đã chạy được, còn thiếu — xem F3 |
| 12 | Bộ test | ◐ Xem F4 |
| 13 | Tích hợp, chạy thật, evidence | ✗ Xem F6 |
| 14 | QA / reviewer sign-off | ✗ Xem F7 |

**Đã xong trong đợt 2026-07-22:** `CatalogLookupPort` (18 test), tách module
`service-identity`, rollback rehearsal (11 test), CMS quản trị danh mục.

### F1. Yêu cầu tìm kiếm / lọc thật — cần chốt trước khi viết

§3: *"Chốt yêu cầu search/filter thực tế: trường được tìm, filter trạng thái, sort và
pagination."*

Trang `/tools` hiện có bộ lọc **giao diện suông**: ô tìm tên, chọn giá, nhóm tính năng,
nhóm mô hình, sắp xếp. Không cái nào nối vào đâu, và nhãn là chữ đánh số vì taxonomy chưa
có (xem D3).

Cần biết: tìm theo trường nào, lọc theo gì, sắp xếp theo gì. Chưa có thì viết endpoint tìm
kiếm là đoán mò.

### F2. UI danh mục phía người dùng — nối API và ba thứ còn thiếu

Bố cục xong (xem D2). Còn lại:

- **Nối API.** Thay `PLACEHOLDER_*` ở `app/(user)/page.tsx` và `app/(user)/tools/page.tsx`
  bằng lời gọi `/v1/catalog/applications`.
- **Trang chi tiết ứng dụng.** `§10` đòi có; hiện **chưa tồn tại** route nào. Dự kiến
  `/tools/[key]` — tra theo `key` chứ không phải `id`, khớp với endpoint đã có.
- **Hành vi mở ứng dụng.** Nút mở dùng `launch_url` **đã lưu và đã kiểm** từ phản hồi
  catalog, tuyệt đối không ghép host/path từ đầu vào người dùng. App `draft`/`inactive`
  không mở được từ danh mục công khai.
- **Câu "thấy ≠ được dùng".** §10 đòi UI nói rõ điều này. Phía quản trị đã có; phía người
  dùng chưa.
- **Ảnh.** Chưa có `next/image` ở bất kỳ đâu, chưa có ảnh dự phòng, chưa có `alt` theo vai
  trò. DEC-T12 đã chốt ảnh đi qua Next image optimizer — chưa hiện thực.

### F3. UI quản trị danh mục — phần còn thiếu

`/admin/catalog` và `/admin/catalog/[applicationId]` đã chạy: tạo/sửa ứng dụng, đổi trạng
thái, quản lý redirect URI, tạo và đổi trạng thái tính năng.

Còn thiếu:

- **Xem trước ảnh.** Cố ý chưa làm. Render thẳng URL admin vừa gõ sẽ khiến trình duyệt của
  chính họ gửi request tới host đó **trước khi server kịp kiểm** — rò IP và Referer của
  người quản trị cho một địa chỉ chưa xác minh. Muốn có, phải thêm một endpoint phía server
  trả ảnh **đã qua chính sách**, rồi UI mới trỏ vào đó.
- **Form sửa metadata tính năng.** API đã có `PATCH`, giao diện chưa có ô nhập.
- **Sắp xếp và phân trang** bảng ứng dụng. Chưa cần khi danh sách còn rỗng, sẽ cần khi có
  hàng chục dòng.
- **Giao diện chỉ số sử dụng.** Chặn bởi A5.

### F4. Bộ test P3 còn thiếu

Hiện có **277 test** unit+integration. Theo §14 còn thiếu:

- **Chỉ số:** `unit` thiếu/rỗng/placeholder/chưa duyệt thì không tạo được dòng nào. Chặn
  bởi A5 — chưa có endpoint để kiểm.
- **Service identity và audit:** chứng minh không có cột/payload/log nào chứa secret hay
  token; một service identity không bind được sang app khác; audit với actor `service`
  thiếu FK hoặc trỏ id không tồn tại thì bị từ chối.
- **URL ảnh:** bộ test âm — URL có token presigned, URL chuyển hướng tới host nội bộ, phản
  hồi quá lớn hoặc không phải ảnh. Phạm vi phụ thuộc F2 (có fetch ảnh phía server hay không).
- **Tương tranh:** hai lệnh tạo cùng `key`, hai lệnh đổi trạng thái cạnh tranh, hai lệnh
  thêm cùng redirect — phải cho một kết quả nhất quán, không nhân đôi, và audit không tách
  khỏi transaction.
- **Accessibility và responsive** cho màn hình danh mục, cả phía người dùng lẫn quản trị.
  Chặn bởi B2 (thiếu fixture phiên admin cho e2e).

### F5. Runbook vận hành — deliverable của §6, chưa tồn tại

Cần viết: quy trình kích hoạt / tắt một ứng dụng, đổi redirect hoặc ảnh, xử lý khi một URL
bị chiếm dụng, và rollback một bản phát hành.

Phần rollback migration đã có (B4); phần **quy trình vận hành** thì chưa có gì.

### F6. Bước tích hợp và evidence — §15 bước 13

Chưa chạy trọn chuỗi lệnh và lưu output thật:

```
pnpm install --frozen-lockfile → typecheck → lint → openapi:lint + openapi:drift
→ db:migrate → test → test:e2e → build
```

Cũng chưa: **migration dry-run trên database thật** theo đúng thứ tự, và kiểm cấu hình
CSP/allowlist ảnh **theo từng môi trường**.

### F7. QA và reviewer sign-off — §20

Chưa có. §20 nói rõ: **người viết implementation không tự chứng nhận phần mình**. Toàn bộ
P3 tới giờ do một agent viết, nên bước này còn nguyên.

### F8. Đồng bộ tài liệu — mục "docs" của §17

Cần cập nhật cho khớp thực tế: ma trận permission, cách biểu diễn "chưa quyết định" cho
`counting_point`/`failure_treatment`, delta schema của service identity và audit, và các
chỗ giữ chỗ cấu hình CSP.

### F9. Sai tên trigger trong phase-3 §15

§15 bước 6 gọi trigger là `audit_events_append_only_trg`. Tên thật trong migration `0004`
là **`audit_events_append_only`**, không có hậu tố.

Tài liệu sai chứ không phải code. Sửa một chữ, nhưng để nguyên thì lần sau lại có người
viết test tìm nhầm tên — đã xảy ra một lần rồi (2026-07-22).

### F10. Lệch khỏi bảng target path §7 — đã sửa một nửa

| Kế hoạch | Thực tế |
|---|---|
| `modules/application-catalog` | ✅ Đã đổi đúng tên (2026-07-22) |
| `modules/service-identity` | ✅ Đã tách ra module riêng (2026-07-22) |
| `apps/web/src/bff/auth/features` | ✗ BFF thật nằm ở `apps/web/app/api/bff/` và `apps/web/server/` |

Dòng cuối chưa xử lý: hoặc đổi code cho khớp kế hoạch, hoặc sửa kế hoạch cho khớp code.
Nghiêng về vế sau — cấu trúc hiện tại theo đúng quy ước App Router của Next.

---

## Tài liệu liên quan

- [`decision-register.md`](./decision-register.md) — quyết định đã chốt và đang chờ
- [`phase-2-identity-account-admin-security.md`](./phase-2-identity-account-admin-security.md) — trạng thái P2 chi tiết
- [`phase-3-application-catalog.md`](./phase-3-application-catalog.md) — 14 bước của P3 và exit gate
- [`../identity-provider.md`](../identity-provider.md) — cơ chế Logto và ranh giới dữ liệu
- [`../url-policy.md`](../url-policy.md) — chống SSRF, allowlist host, các cách qua mặt
- [`../frontend-css-rules.md`](../frontend-css-rules.md) — quy tắc lưới và typography
