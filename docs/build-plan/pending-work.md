# Việc còn treo

> **Mục đích:** ghi lại mọi thứ đã biết là chưa làm, để không phải nhớ bằng đầu và không
> ai tưởng nhầm là đã xong. Cập nhật lần cuối **2026-07-21**.
>
> Quy tắc của file này: chỉ ghi việc **đã xác định**, kèm **vì sao nó quan trọng** và
> **điều gì đang chặn**. Không ghi ý tưởng chưa chín — chỗ đó là decision register.

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

### B2. E2E cho các trang mới

48 test e2e hiện phủ: shell, CSP, lưới cột, responsive, bàn phím. **Chưa phủ**: đăng nhập
thật, `/account`, `/account/sessions`, `/admin`, `/admin/audit`, `/admin/roles`.

§17 cũng đòi accessibility (chỉ dùng bàn phím hoàn tất) và responsive cho các màn hình đó.

### B3. Observability — §17

- **Correlation ID xuyên BFF → API → audit.** Control Plane đã có
  (`shared/correlation.ts`); **BFF chưa nối** — nó không truyền correlation ID sang.
- **Metric** cho callback outcome, session revoke, RBAC deny: **chưa có gì**.

### B4. Rollback rehearsal — §17

Diễn tập rollback migration/application, và chứng minh sau rollback thì
`audit_events_append_only_trg` vẫn còn, runtime vẫn không `TRUNCATE` được.

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

- **Nút mũi tên carousel đối tác** — hiện băng chạy tự động và cuộn tay được, nhưng hai
  nút mũi tên trong thiết kế chưa có hành vi (cần JS + state).
- **Ô tìm kiếm ở hero** — chưa có đích đến, dữ liệu thuộc P3.
- **Form newsletter** — chưa có backend.

### C4. Bảng màu dark

`globals.css` khoá `color-scheme: light`. Quy chuẩn chỉ định nghĩa bảng sáng; bật dark mà
tự bịa màu sẽ lệch thiết kế. Cần chủ dự án cung cấp bảng dark.

---

## D. Khoảng trống giữa thiết kế và kế hoạch

### D1. Blog và "Gửi công cụ" không nằm trong phase nào

Hai mục này có trong thiết kế Figma và đã dựng trang chỗ giữ chỗ (`/blog`, `/submit`),
nhưng **build plan P0–P9 không có mục nào** cho hệ thống blog hay luồng đề xuất công cụ.

**Cần chủ dự án quyết định:** đưa vào phase nào, hay bỏ khỏi thiết kế.

### D2. Trang chủ đã lấn sang P3 — có chủ đích

Lưới "Tìm đúng công cụ" và "Khám phá danh mục" chính là UI catalog mà §10 của phase-3
mô tả. Layout dựng trước theo yêu cầu, dữ liệu là mẫu (`PLACEHOLDER_*`).

**Sang P3 chỉ thay các mảng đó bằng lời gọi API — không dựng lại layout.** Ghi ở đây để
người làm P3 không tưởng là phải làm lại từ đầu.

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

## Tài liệu liên quan

- [`decision-register.md`](./decision-register.md) — quyết định đã chốt và đang chờ
- [`phase-2-identity-account-admin-security.md`](./phase-2-identity-account-admin-security.md) — trạng thái P2 chi tiết
- [`../identity-provider.md`](../identity-provider.md) — cơ chế Logto và ranh giới dữ liệu
- [`../frontend-css-rules.md`](../frontend-css-rules.md) — quy tắc lưới và typography
