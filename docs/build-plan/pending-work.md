# Việc còn treo

> **Mục đích:** ghi lại mọi thứ đã biết là chưa làm, để không phải nhớ bằng đầu và không
> ai tưởng nhầm là đã xong. Cập nhật lần cuối **2026-07-31**.
>
> Quy tắc của file này: chỉ ghi việc **đã xác định**, kèm **vì sao nó quan trọng** và
> **điều gì đang chặn**. Không ghi ý tưởng chưa chín — chỗ đó là decision register.
>
> Mục đã xong **giữ nguyên số hiệu** và được đánh dấu ✅ thay vì xoá đi. Xoá thì lần rà sau
> rất dễ có người thêm lại đúng mục đó vì không thấy dấu vết nào.

---

## A. Chờ quyết định của chủ dự án

Agent **không** tự quyết mục nào trong phần này (DEC-G01).

### A1. Recovery flow — ✅ ĐÃ XONG (2026-07-22)

Luồng khôi phục truy cập khi người dùng quên mật khẩu. **Đã hiện thực và kiểm chứng bằng
trình duyệt thật, đầu đến cuối.**

**Đường đi hiện tại:** `/sign-in` → "Quên mật khẩu?" → `/forgot-password` (giao diện của ta
trong `apps/logto-ui`) → nhập thư → nhận mã qua SMTP → nhập mã → đặt mật khẩu mới → màn hình
báo xong → đăng nhập lại.

Bốn chặng gọi Experience API, ghi chi tiết trong `apps/logto-ui/README.md`.

**Ba thứ chỉ lộ ra khi chạy thật, không có trong tài liệu của Logto:**

| Phát hiện | Hệ quả nếu không biết |
|---|---|
| `forgotPasswordMethods` mặc định là **mảng rỗng** | `identification` trả `422 session.not_supported_for_forgot_password`, nghe như Logto không hỗ trợ |
| `submit` trả **204**, không phải 200 kèm `redirectTo` như swagger khai | Đọc `result.redirectTo` ném TypeError → người dùng thấy "Không kết nối được tới máy chủ" **ngay sau khi mật khẩu đã đổi thành công** |
| Sau `submit`, người dùng **không** được đăng nhập vào | Không có chuyển hướng nào tự xảy ra; thiếu màn hình báo xong thì biểu mẫu đứng im và không ai biết đã xong hay chưa |

Cả ba đều đã sửa. `infra/scripts/configure-logto-sign-in.mjs` bật `forgotPasswordMethods`
và **đọc lại để kiểm**, ném lỗi nếu không vào — vì nếu thiết lập này thiếu thì luồng hỏng ở
bước cuối cùng, chỗ tệ nhất để phát hiện.

**Không lộ tài khoản nào tồn tại:** biểu mẫu quên mật khẩu nhận địa chỉ thư từ người lạ và
không đòi hỏi gì, nên nó là chỗ dò danh sách người dùng dễ nhất. Câu trả lời cho địa chỉ
không có tài khoản giống hệt câu trả lời cho địa chỉ có.

**§18 của phase-2 đã thoả:** đã hiện thực, không phải loại bỏ, nên không cần cập nhật bốn
nguồn theo nhánh "quyết định loại bỏ".

**Còn treo, không chặn:** e2e trong `tests/e2e` chưa có bài đọc Mailpit — chặn bởi B2
(fixture phiên đăng nhập). Việc kiểm chứng hiện làm bằng script chạy tay.

### A2. CAPTCHA — DEC-T23 (`proposed`)

Logto có bảng `captcha_providers` nên hỗ trợ sẵn ở tầng IdP. Cần chốt nhà cung cấp.

Ghi chú kỹ thuật đã có trong decision register: CAPTCHA chống **bot đăng ký hàng loạt**;
chống **brute-force mật khẩu** thì rate limiting hiệu quả hơn nhiều. Cần cả hai, đúng chỗ.

### A3. Xoay Logto App Secret — VIỆC BẢO MẬT

App Secret hiện dùng **đã lộ trong hội thoại**. Phải thay:

1. Logto Admin Console (`localhost:3002`) → Applications → app đang dùng → tạo secret mới
2. Cập nhật `OIDC_CLIENT_SECRET` ở **cả hai** nơi: `.env.dev` và `apps/web/.env.local`
3. Khởi động lại BFF

### A4. DEC-B01 — danh sách ứng dụng của Hub — HƯỚNG ĐÃ CHỐT (2026-07-30), còn chờ dữ liệu

**Hướng đã chốt:** Talosmine là **hub đóng, ~10 ứng dụng do chủ dự án kiểm soát** — không
phải thư mục mở kiểu marketplace. Chi tiết ở `decision-register.md` (DEC-B01).

**Vẫn `open`, vẫn chặn P3, P6, P7:** danh sách ứng dụng THẬT — có những app nào, ai sở hữu,
chạy ở domain nào. Hướng đã chốt chỉ xác định LOẠI schema cần dùng (đóng, không cần luồng
duyệt hàng loạt), không tự sinh ra dữ liệu.

**Hệ quả cụ thể đang thấy được:** `CATALOG_ALLOWED_HOSTS` đang **rỗng**, nên mọi URL nhập
vào danh mục đều bị từ chối. Đó là hành vi đúng theo thiết kế, không phải lỗi — cơ chế đã
dựng và có 31 test, chỉ là danh sách chưa có nội dung. Giao diện quản trị `/admin/catalog`
đã chạy nhưng chưa tạo được ứng dụng nào cho tới khi có host hợp lệ.

**Cần bạn cung cấp:** với MỖI ứng dụng — tên, domain (cho `CATALOG_ALLOWED_HOSTS`), người sở
hữu. Xem thêm A6 (redirect URI) và A7 (metadata service identity) — cả hai đều cần dữ liệu
tương ứng cho từng app này.

### A10. Thời hạn lưu dữ liệu khảo sát — DEC-B11 — HAI TRONG BA CÂU ĐÃ CHỐT (2026-07-30)

`survey_responses` và `survey_answers` (migration 0012) là **loại dữ liệu cá nhân MỚI**, gắn
với `account_id`. Ba câu, đã chốt hai:

1. **VẪN `open`.** Giữ bao lâu? Có ẩn danh hoá sau một thời hạn không? Code cố ý **không ghi
   thời hạn nào** cho tới khi có con số cụ thể.
2. **✅ ĐÃ CHỐT: có, người dùng được tự xem/xoá câu trả lời của mình, cần làm SỚM.** Việc mới
   phát sinh — xem D0 mục 1: một trang ở `/account` (cùng khuôn `/account/sessions`), đọc/xoá
   đúng dữ liệu của phiên đang đăng nhập.
3. **✅ ĐÃ CHỐT: giữ `ON DELETE RESTRICT`** (không đổi schema — đã đúng vậy từ trước, quyết
   định này chính thức hoá lựa chọn đó). Xoá account bị chặn nếu còn câu trả lời khảo sát —
   quy trình xoá account (khi được xây) phải tự xử lý phần này trước, không được âm thầm bỏ
   qua.

**Từ 2026-07-28 câu 1 không còn là giả thuyết:** `/admin/survey/responses` đã tồn tại và trả
`accountId`, nên dữ liệu này đã đọc được qua giao diện. Nó nằm sau `survey_response:read` —
permission riêng, không phải `content:*` — nhưng phân quyền không thay thế được chính sách
lưu trữ. Chi tiết đầy đủ ở `decision-register.md` (DEC-B11).

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

### A8. Blog, "Gửi công cụ", "Liên hệ" — ✅ ĐÃ CHỐT (2026-07-30): gộp vào P3

Ba trang này gộp vào P3, làm cùng đợt với catalog — không phải một phase riêng, không bỏ
khỏi thiết kế. Chi tiết ở `decision-register.md` (DEC-B16). Việc kỹ thuật phát sinh xem D1.

### A9. Đăng nhập bằng Google — ✅ ĐÃ DỰNG, CHỜ CHỦ DỰ ÁN TEST TAY (2026-07-22)

**Chủ dự án chốt hướng A-linking = "tự liên kết, chỉ Google"** (bảng bên dưới), và đã cấu hình
xong connector + publish OAuth app bên Google. Frontend đã dựng và kiểm chứng tới ranh giới
Google; phần đăng nhập Google thật phải test tay vì Google chặn automation.

**Cách nối:**

```
connector Google (Logto)  id = 7ygneqvk0jpw2tnwtrmpo   target = google
sign-in-exp               socialSignInConnectorTargets = ['google']   (bật bởi script)
apps/logto-ui             nút "Tiếp tục với Google" TỰ kích hoạt theo socialConnectors[]
callback                  /callback/<connectorId>  → socialCallbackScreen trong app.js
```

Nút đọc `socialConnectors` từ `/api/.well-known/experience` để tự bật/tắt — không viết cứng
ID. `infra/scripts/configure-logto-sign-in.mjs` suy ra `socialSignInConnectorTargets` từ
connector thực tế, nên chạy lại luôn khớp hiện trạng.

**Luồng bốn chặng** (contract đọc từ swagger + mã connector trong container, không đoán):

```
PUT  /api/experience                                 {interactionEvent:'SignIn'}
POST /api/experience/verification/social/{id}/authorization-uri  {state, redirectUri}
                                                  -> {authorizationUri, verificationId}
   → RỜI TRANG sang Google;  ← Google trả về /callback/{id}?code=…&state=…
POST /api/experience/verification/social/{id}/verify
        {connectorData:{code, redirectUri}, verificationId}      -> {verificationId MỚI}
POST /api/experience/identification  {verificationId, linkSocialIdentity:true}
POST /api/experience/submit                                      -> {redirectTo}
```

Ba điều đã đo/xử lý đúng:

- `connectorData` là `{code, redirectUri}` — đọc từ `authResponseGuard` trong mã connector,
  không phải toàn bộ query params. `redirectUri` phải y hệt ở authorization-uri và verify,
  Google đối chiếu khi đổi token.
- `state` sinh bằng `crypto.getRandomValues`, lưu `sessionStorage` (biến JS mất khi rời
  trang), đối chiếu lúc quay về — chốt chặn CSRF. Logto không kiểm hộ.
- `sessionStorage` dùng MỘT LẦN: xoá ngay khi callback chạy, một lần quay về không phát lại được.

**A-linking đã chốt = tự liên kết chỉ cho Google:**

| | Hành vi | |
|---|---|---|
| A | không liên kết | bỏ |
| **B** | **tự liên kết theo email đã xác minh** (`linkSocialIdentity:true`) | ✅ chọn — Google đảm bảo `email_verified` |
| C | hỏi rồi đòi mật khẩu | bỏ |

`linkSocialIdentity:true` khoá cứng cho luồng Google. Thêm IdP khác thì PHẢI xét lại: IdP nào
không đảm bảo `email_verified` mà auto-link là mở đường chiếm tài khoản.

**HAI LỖI ĐÃ SỬA KHI TEST TAY (2026-07-22), đọc từ audit log Logto `/api/logs`, không đoán:**

`POST /api/experience/identification` phân nhánh theo `interactionEvent` (đọc từ mã core):
`SignIn` → `identifyUser()` (chỉ TÌM), `Register` → `createUser()` (TẠO). Và cờ
`linkSocialIdentity` phải khớp trạng thái liên kết của social — sai là hỏng ở **submit** chứ
không phải identification, nên khó thấy.

| Lỗi (audit log) | Nguyên nhân |
|---|---|
| `identification 404 user_not_exist` / `identity_not_exist` | tài khoản Google MỚI, mà luồng chỉ chạy SignIn (không tạo) |
| `submit 422 user.identity_already_in_use` | tài khoản Google ĐÃ liên kết, nhưng vẫn gửi `linkSocialIdentity:true` → cố liên kết lần nữa |

Sai lầm gốc: gửi `linkSocialIdentity:true` cho MỌI trường hợp. Đã sửa `completeGoogleSignIn`
thành BA TẦNG: (1) định danh thẳng cho user đã liên kết; (2) `linkSocialIdentity:true` gộp
theo email trùng; (3) `PUT Register` + định danh lại cho user mới. Verification record của
Google sống sót qua các lần thử (assert ném trước khi đổi trạng thái). Chính sách social
`{automaticAccountLinking:false, skipRequiredIdentifiers:false}`; register vẫn chạy vì Google
cấp email đã xác minh, password không nằm trong hồ sơ bắt buộc của luồng social.

**Triệu chứng phụ `?error=Không tạo được phiên đăng nhập`** (web app, [callback/route.ts](../../apps/web/app/auth/callback/route.ts))
là do next dev CŨ còn trỏ cổng DB chết (56543) trước khi đổi sang 15432/16543 — restart next
dev là hết. Control Plane ở 3100 nối DB bình thường (kiểm: token rác → 401, có correlationId).

**LỖI TẦNG (3) ĐÃ SỬA (2026-07-23), tìm bằng test tay của chủ dự án + audit log:** tài khoản
Google MỚI báo `session.verification_session_not_found` ở bước định danh Register. Nguyên nhân:
tầng (3) chuyển sang Register bằng `PUT /api/experience` — mà swagger ghi rõ endpoint đó "Init
a NEW interaction, any existing data will be CLEARED", tức XOÁ luôn social verification vừa làm.

Đúng endpoint là `PUT /api/experience/interaction-event` — "switch event between SignIn and
Register, KEEPING all the verification records data". Đã đổi sang dùng nó. Bài học: hai endpoint
nghe giống nhau nhưng làm ngược nhau; đọc mô tả swagger, đừng đoán theo tên.

**Trạng thái test tay:** tầng (1) tài khoản đã liên kết ✅ (chủ dự án đăng nhập được với
`aitreviet@gmail.com`). Tầng (3) tài khoản mới — vừa sửa (v19), chờ test lại. Tầng (2) email
trùng — vẫn chưa test, nhưng cùng cơ chế.

**CÒN TREO — chủ dự án test tay rồi báo lại (sau bản sửa v17):**

1. **Test đầu-đến-cuối bằng Gmail thật** (đã ở Test users). Ba tình huống: (a) tài khoản Google
   HOÀN TOÀN MỚI → phải tự tạo tài khoản; (b) email Google TRÙNG tài khoản email+mật khẩu đã có
   → phải GỘP, không tạo tài khoản thứ hai; (c) bấm Huỷ ở màn hình Google → về màn báo lỗi, không treo.
2. **Chưa đo:** tài khoản chỉ có Google (không mật khẩu) rồi bấm "Quên mật khẩu" — Logto xử lý
   ra sao. Cần kiểm trước khi coi là xong.

**⚠ BẢO MẬT — XOAY CLIENT SECRET.** Ngày 2026-07-22, script đọc connector của agent in cả
`config.clientSecret` ra khung chat, nên Client Secret Google đã lộ vào lịch sử hội thoại.
Mức thấp (client dev, Testing mode, localhost) nhưng **phải xoay trước khi lên production**:
Google Cloud → OAuth client → Add secret → dán vào Logto → xoá secret cũ. Cùng nhóm với A3
(xoay Logto App Secret cũng đã lộ trong chat).

**Chặn PRODUCTION (không chặn dev):** consent screen phải có Privacy Policy + Terms khi rời
Testing mode — chưa soạn, cùng thứ treo ở C5. Ở dev/localhost thì Testing mode + test users là
đủ, không cần hai văn bản đó.

---

## B. Việc kỹ thuật P2 còn thiếu

Không chờ ai — agent làm được ngay.

### B1. Negative test cho luồng OIDC — ƯU TIÊN CAO NHẤT

§14 yêu cầu test cho: `state` sai/hết hạn, `nonce` sai, PKCE thất bại, sai
issuer/audience/chữ ký/hạn dùng, callback replay, và open redirect (host/path/port gần
giống, wildcard, encoded payload, protocol-relative).

Cài đặt cần kiểm: [`oidc-verifier.ts`](../../apps/control-plane/src/modules/identity/oidc-verifier.ts),
[`callback/route.ts`](../../apps/web/app/auth/callback/route.ts), `safeReturnTo` trong
[`oidc.ts`](../../apps/web/server/oidc.ts).

**Phần "sai issuer/audience/chữ ký/hạn dùng" — ĐÃ XONG (2026-07-30).**
[`tests/unit/oidc-verifier.test.ts`](../../tests/unit/oidc-verifier.test.ts), 13 test, dựng
một JWKS server THẬT bằng `node:http` và ký token bằng `jose` — không mock `jose`, đúng tinh
thần DEC-T05 áp cho mạng thay vì DB. Phủ: chữ ký sai (ký bằng khoá khác nhưng khai đúng
`kid` thật — giả mạo danh tính), `kid` không tồn tại trong JWKS, `alg:none` (token tự chế
tay), **alg confusion RS256→HS256** (dùng public key làm secret HMAC — đòn JWT kinh điển),
hết hạn, chưa có hiệu lực (`nbf`), sai issuer, sai audience, thiếu `sub`, và hành vi có chủ
đích "không kiểm audience khi `OIDC_CLIENT_ID` chưa cấu hình". Đã kiểm chứng bằng cách phá:
tắt phép kiểm `sub` trong `oidc-verifier.ts` → đúng 1/13 test đỏ, 12 test còn lại vẫn xanh
(không phụ thuộc chéo).

**Phần `state`/`nonce`/PKCE/callback replay ở tầng BFF — ĐÃ XONG (2026-07-30).**
[`tests/unit/auth-callback.test.ts`](../../tests/unit/auth-callback.test.ts), 7 test cho
`apps/web/app/auth/callback/route.ts`. `state`/`nonce`/`code_verifier` KHÔNG được tự so
sánh trong code của ta — `client.authorizationCodeGrant()` của `openid-client` làm việc đó —
nên bộ test này KHÔNG re-test đúng-sai của phép so sánh đó (đó là việc của bộ test riêng của
thư viện), mà chứng minh route xử lý AN TOÀN khi thư viện TỪ CHỐI, ở CẢ BỐN tình huống (state
sai, nonce sai, PKCE thất bại, và mã đã dùng lại — replay, mô phỏng bằng lỗi kiểu
`invalid_grant`): redirect lỗi CHUNG không lộ chi tiết ra URL, xoá `TRANSACTION_COOKIE`,
không tạo phiên. Cộng hai case phòng thủ replay tầng ngoài (thiếu/hỏng transaction cookie →
dừng trước khi gọi `openid-client`) và một case IdP trả thiếu `id_token`.

Mock `openid-client` + `getOidcConfiguration` (biên ngoài, không phải logic nghiệp vụ — mock
ở đây không phạm DEC-T05) — LẦN ĐẦU repo dùng `vi.mock`. Đã kiểm chứng bằng cách phá: gỡ dòng
`response.cookies.delete(TRANSACTION_COOKIE)` khỏi `failure()` → đúng 4/7 test đỏ (đúng bốn
case kiểm cookie), 3 test còn lại vẫn xanh. Đã khôi phục, diff sạch.

Đường THÀNH CÔNG (đổi code lấy token thật rồi tạo phiên) cố ý NGOÀI phạm vi — cần
`exchangeIdTokenForSession` gọi thật ra Control Plane, thuộc B2/integration có DB thật.
Open redirect (`safeReturnTo`) đã có test từ trước (rà soát bảo mật 2026-07-23).

**B1 coi như đã đóng** theo nghĩa "khoảng trống lớn nhất của P2" đã có test tự động; phần
còn lại (nếu có) là bổ sung case, không phải dựng khung từ đầu.

**RÀ SOÁT BẢO MẬT 2026-07-23 — thăm dò thủ công trên hệ thống đang chạy.** 19 phòng thủ giữ
vững (giả mạo token: alg:none / khoá lạ / alg-confusion HS256 / sai issuer đều 401; chặn
`/admin` ở server không lộ khu quản trị; CSP nonce + frame-ancestors/object-src/base-uri/
form-action; cookie `__Host-` + HttpOnly + Secure + SameSite). **Tìm được MỘT lỗ hổng thật:**

- **OPEN REDIRECT ở `safeReturnTo` — ĐÃ SỬA.** Bản cũ chỉ so chuỗi (`startsWith('//')`).
  `new URL` (mà callback dùng để redirect) XOÁ `\t \n \r` và đổi `\`→`/` TRƯỚC khi phân giải,
  nên `returnTo=/%09/evil.com` và `/\evil.com` lọt qua rồi thành origin ngoài — người dùng
  đăng nhập thật xong bị bắn sang `evil.com`. Xác nhận đi hết luồng (cookie transaction lưu
  `/\t/evil.com` → callback redirect `http://evil.com/`). Sửa: `safeReturnTo` giờ dựng URL
  bằng chính parser đó rồi so `origin`, khác origin → `/`. Có unit test hồi quy
  [`safe-return-to.test.ts`](../../tests/unit/safe-return-to.test.ts) (7 case) + đã kiểm bản
  sửa đóng lỗ trên server thật. Chữ ký đổi thành `safeReturnTo(value, baseUrl)`.

Việc B1 vẫn còn: rà soát trên là THĂM DÒ thủ công, chưa phải bộ test tự động đủ theo §14
(state/nonce/PKCE/replay chưa có test). Nhưng open-redirect — mục §14 nêu đích danh — nay đã
có test.

### B2. E2E cho các trang cần đăng nhập — ✅ ĐÃ XONG (2026-07-30)

**108 test e2e** (2026-07-22) phủ: shell, CSP trên từng trang, lưới cột, responsive, bàn
phím, breadcrumb.

**Cơ chế fixture phiên — ĐÃ MỞ KHOÁ (2026-07-30).**
[`tests/e2e/support/session-fixture.ts`](../../tests/e2e/support/session-fixture.ts) ghi
thẳng một phiên THẬT vào `web_sessions` bằng đúng hàm Control Plane dùng
(`provisionByExternalIdentity` + `createWebSession`), bỏ qua OIDC hoàn toàn — không phải giả
lập, mà là một phiên thật qua con đường thật, chỉ bỏ qua bước "gõ mật khẩu trên trang của
Google" (không tự động hoá được, đã ghi ở A9).
[`tests/e2e/authenticated.spec.ts`](../../tests/e2e/authenticated.spec.ts), **5 test** chứng
minh cơ chế chạy đúng: dữ liệu tài khoản thật cho người đã đăng nhập; chưa đăng nhập bị đưa
khỏi `/account`; `account:read` → `/admin` 200; `audit:read` → `/admin/audit` 200 (quyền
riêng từng trang, không chỉ cần vào được `/admin`); đã đăng nhập nhưng không có quyền quản
trị nào → `/admin` bị chặn 403 ngay ở `proxy.ts` (không phải 404 — 404 chỉ xảy ra ở lớp
phòng thủ thứ hai nếu lớp thứ nhất bị bỏ qua).

`playwright.config.ts` được thêm một `webServer` thứ hai chạy Control Plane thật
(`dev:api`, health-check `/health/ready`) — trước đây chỉ tự quản lý `next start`. Yêu cầu hạ
tầng: Docker (`talosmine-db`, `talosmine-pooler`) đã bật.

**Ba lỗi không hiển nhiên đã gặp và giải quyết khi dựng cơ chế này** (đáng lưu vì có thể tái
diễn khi mở rộng bộ test):
- Playwright's TS loader resolve `.js`-suffixed import theo đúng nghĩa đen (không tự bỏ đuôi
  sang `.ts` như vitest/Vite) — fixture phải nhập từ `apps/control-plane/dist/` (đã build)
  thay vì `src/`, còn type thì đọc riêng từ `src/` qua `import type` (bị xoá lúc biên dịch).
- `context.addCookies` (CDP `Storage.setCookies`) có bug đã biết
  (microsoft/playwright#11372, #27473): từ chối thẳng cookie tên bắt đầu bằng `__Host-`/
  `__Secure-` với lỗi chung chung "Invalid cookie fields", dù mọi field đều đúng. Đường vòng:
  `context.route(...).fulfill({ headers: { 'set-cookie': ... } })` — tạo một response THẬT ở
  tầng network mà Chromium xử lý Set-Cookie đúng như một response từ server, cùng cơ chế
  `setSessionCookies` (`apps/web/server/session.ts`) đã dùng khi đăng nhập thật.
- `/admin` cho một phiên đã đăng nhập nhưng KHÔNG có quyền nào trả **403** (chặn ở
  `proxy.ts`), không phải 404 (đó là lớp phòng thủ thứ hai ở `app/admin/layout.tsx`, chỉ
  chạy nếu lớp thứ nhất bị bỏ qua) — ban đầu viết nhầm kỳ vọng, đã sửa test theo đúng hành vi
  đã thiết kế (xem comment ở `proxy.ts:182-213`).

**Ba trang còn lại — ĐÃ PHỦ (2026-07-30).**
[`tests/e2e/admin-pages.spec.ts`](../../tests/e2e/admin-pages.spec.ts), **9 test** (×3
viewport = 27 lượt chạy) cho `/account/sessions`, `/admin/roles`, `/admin/catalog` — mỗi
trang: truy cập đúng quyền/đúng dữ liệu, không tràn ngang (responsive), và focus nhìn thấy
được khi tab (accessibility), dùng lại nguyên `session-fixture.ts`.

**TÌM ĐƯỢC MỘT LỖ HỔNG RESPONSIVE THẬT KHI CHẠY TEST MOBILE (390px) — ĐÃ SỬA.** `/admin/roles`
và `/admin/catalog` tràn ngang thật ở viewport mobile (`scrollWidth` 412px so với 390px). Gốc
rễ nằm ở khung sườn `/admin` ([`apps/web/app/admin/layout.module.css`](../../apps/web/app/admin/layout.module.css)),
KHÔNG phải ở từng trang riêng — mọi trang `/admin/*` đều bị ảnh hưởng như nhau, nhưng trước
đây chưa từng bị bắt vì `authenticated.spec.ts` chỉ chạy `/admin`/`/admin/audit` trên project
`desktop`. Ba tầng lồng nhau của CÙNG một lỗi CSS kinh điển ("track/item không co dưới kích
thước nội dung của chính nó" — `1fr` một mình và flex item mặc định đều có sàn `auto`, phải
đổi tường minh về `0`):
1. `.shell` (`display: grid`, không khai `grid-template-columns`) — cột ẩn giữ sàn theo nội
   dung rộng nhất bên trong.
2. `.body` (`grid-template-columns: 1fr`) — cùng lỗi, một tầng con.
3. `.sidebar` (item của `.body`, có `overflow-x: auto` nhưng thiếu `min-width: 0`) — nội
   dung `.navList` (`min-width: max-content`, danh sách trang quản trị xếp hàng ngang ở mobile)
   ép `.sidebar` rộng ra thay vì tự cuộn trong khung của chính nó.

Sửa cả ba tầng bằng `minmax(0, 1fr)` (thay `1fr` trơn) và `min-width: 0`. Đã kiểm bằng cách đo
trực tiếp `document.documentElement.scrollWidth` trước/sau: 412px → đúng bằng `clientWidth`
(390px) sau khi sửa — không còn lệch một pixel nào, không phải "thu hẹp cho qua test". Toàn
bộ 221 test e2e (3 viewport) xanh sau khi sửa; đã kiểm riêng multiple lần để loại trừ
flaky do tài nguyên khi chạy song song nhiều worker (một lần đỏ ngẫu nhiên trong lượt chạy
225 test cùng lúc, không tái diễn qua 4 lần chạy lại riêng lẻ và một lượt full-suite sạch).

Cùng class CSS này (`.tableWrap` thiếu `min-width: 0` khi là con của flex column) cũng được vá
ở `admin/roles/page.module.css` và `admin/catalog/page.module.css` — không phải nguyên nhân
chính (nguyên nhân chính là khung sườn ở trên) nhưng là một lỗi thật độc lập, phòng khi bảng
đó thật sự rộng hơn khung sườn cho phép.

**BA TRANG CÒN LẠI — ĐÃ ĐO VÀ ĐÃ SỬA (2026-07-31).** Nghi ngờ ở bản ghi trước là ĐÚNG: cả ba
đều tràn ngang thật ở viewport 390px — `/admin` **554px**, `/admin/audit` **742px**,
`/admin/accounts/[accountId]` **542px** (so với clientWidth 390px). Không trang nào tự lộ ra
trước đây vì bảng của chúng CHỈ render khi có dữ liệu, mà chưa bài test nào từng dựng dữ liệu
đó rồi đo ở màn hẹp.

[`tests/e2e/admin-tables.spec.ts`](../../tests/e2e/admin-tables.spec.ts), **3 test** (×3
viewport = 9 lượt). Mỗi test BẮT BUỘC bảng phải hiện ra trước khi đo — `/admin` tra chính
account của fixture theo UUID (`searchAccounts` so khớp chính xác), `/admin/audit` tự ghi một
sự kiện qua `createAuditEvent` (fixture mới), trang chi tiết dùng luôn phiên vừa gắn cookie.
Riêng ở mobile còn khẳng định thêm bảng THẬT SỰ rộng hơn khung chứa nó: thiếu phép đo đó,
"không tràn ngang" chỉ đang chứng minh một bảng nhỏ thì không tràn.

**Nguyên nhân KHÁC với lần trước, và `min-width: 0` KHÔNG sửa được.** Đã thử từng declaration
ngay trên DOM của bản production (đo, không đoán): `min-width: 0` giữ nguyên 742px — tức sàn
`min-width: auto` KHÔNG phải nguyên nhân ở đây, khác hẳn ghi chú đang có trong
`admin/roles/page.module.css`. Ba tầng nguyên nhân thật:

1. **`.stack` (globals.css) có `align-items: flex-start`** — con của nó KHÔNG giãn theo bề
   ngang cha mà tự lấy kích thước theo nội dung, nên `.tableWrap` bị `min-width` của `.table`
   (640/720/520px) kéo rộng ra bất kể `overflow-x: auto`. Sửa bằng `align-self: stretch`.
2. **Trang chi tiết account có `.stack` LỒNG trong `.stack`.** Sửa riêng `.tableWrap` xong vẫn
   tràn 542px vì chính `<section class="stack">` mới là thứ rộng 522px. Phải thêm
   `.sessionsSection { align-self: stretch }` cho tầng cha — sửa tầng con mà bỏ tầng cha thì
   chỉ dời chỗ tràn.
3. **`/admin`: một `<span class="visuallyHidden">` THOÁT khỏi khung cuộn.** Class này là
   `position: absolute`; khung cuộn ở trạng thái `static` nên không phải containing block của
   nó → nó không bị `overflow-x: auto` cắt, neo vào vị trí tĩnh trong bảng 640px và đẩy
   scrollWidth của cả trang lên 554px trong khi khung chỉ rộng 350px. Tìm ra bằng cách ẩn từng
   phần tử rồi đo lại; sửa bằng `position: relative` trên `.tableWrap`.

Đã kiểm chứng bằng cách phá: gỡ riêng `position: relative` → **đúng 1/9 test đỏ** (`/admin`
mobile), 8 test còn lại vẫn xanh. Sau khi sửa: 9/9 xanh, và toàn bộ `pnpm run test` (475
test) + `pnpm exec playwright test` (252 test) chạy lại đều xanh.

**Cùng pattern còn ở `admin/roles` và `admin/catalog`** (cũng có `visuallyHidden` trong cột
hành động) nhưng test hiện tại của hai trang đó vẫn xanh — cái span ở đó rơi trong phạm vi
viewport nên chưa thành lỗi. Không vá sẵn theo đúng quy tắc "chưa đo thì chưa sửa"; ghi lại ở
đây để lần sau bảng của chúng rộng ra thì biết ngay chỗ phải nhìn.

### B3. Observability — §17 — ✅ ĐÃ XONG (2026-07-30)

**Correlation ID xuyên BFF → API → audit — ĐÃ NỐI.**
[`control-plane-boundary.ts`](../../apps/web/server/control-plane-boundary.ts) (`callControlPlane`,
điểm ra DUY NHẤT từ web sang Control Plane cho mọi trang admin) giờ LUÔN gắn header
`x-correlation-id` — tự sinh (`crypto.randomUUID()`) nếu caller không truyền sẵn. Hai lời gọi
`fetch` trực tiếp còn lại (không qua boundary vì xảy ra trước/ngoài phiên đã xác thực) cũng
được gắn cùng header: `exchangeIdTokenForSession` (`server/session.ts`, đổi id_token lấy
phiên) và `auth/logout/route.ts` (thu hồi phiên). Control Plane đã đọc đúng header này từ
trước (`shared/correlation.ts`) và đưa vào mọi audit event — không cần đổi gì phía đó.

**Log có cấu trúc cho ba sự kiện** (chọn mức "structured log", chưa cần metric/APM thật):
- `apps/web/server/logger.ts` (mới) — logger JSON tối giản, là nơi DUY NHẤT trong `apps/web`
  được phép gọi `console.*` (override `noConsole` trong `biome.json` chỉ áp cho đúng file
  này). Mọi log vận hành khác trong `apps/web` phải đi qua đây.
- **Callback outcome**: `auth/callback/route.ts` — `auth.callback.token_exchange_failed`,
  `auth.callback.session_exchange_failed`, `auth.callback.success` (mới, trước đây đường
  thành công không log gì). Ba `console.error` cũ (đã bị `noConsole` cảnh báo từ trước) được
  thay bằng log có cấu trúc, kèm `correlationId`.
- **Session revoke**: cả hai phía. BFF — `auth/logout/route.ts` log
  `auth.logout.success`/`auth.logout.revoke_rejected`/`auth.logout.revoke_failed`. Control
  Plane (nguồn sự thật) — `AuthController.logout` (tự đăng xuất) và
  `SessionController.revokeAll`/`revokeOne` (đăng xuất mọi nơi / thu hồi một phiên cụ thể) mỗi
  nơi thêm một dòng `Logger.log` kèm `correlationId`. Nhánh admin thu hồi phiên của account
  khác (`admin.controller.ts`) đã có audit từ trước, không cần thêm.
- **RBAC deny**: `proxy.ts` (lớp chặn admin thứ nhất) log `admin.access_denied` (mức `warn`)
  khi một phiên ĐÃ XÁC THỰC bị từ chối vào `/admin` — cố ý KHÔNG log nhánh `NO_SESSION` (khách
  vãng lai, không phải một quyết định RBAC).

**Đã kiểm chứng bằng hạ tầng thật, không chỉ đọc code:**
- `admin.access_denied` — xác nhận xuất hiện đúng trong log `webServer` khi chạy
  `tests/e2e/authenticated.spec.ts` (case "không có quyền quản trị nào"): dòng JSON đầy đủ
  `{"level":"warn","event":"admin.access_denied","correlationId":"...","reason":"NO_ADMIN_PERMISSION","path":"/admin"}`.
- Session revoke phía Control Plane — tạo một phiên thật qua DB, gọi thẳng
  `DELETE /v1/auth/sessions/current` bằng `curl` với `x-correlation-id` tự chọn, xác nhận log
  `[AuthController] Phiên đã bị thu hồi (đăng xuất)` xuất hiện kèm ĐÚNG `correlationId`,
  `accountId`, `sessionId` đã gửi.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run test` (462 test) và
  `pnpm exec playwright test` (194 test) đều xanh sau các đổi này.

**Chưa kiểm bằng hạ tầng thật (chỉ suy luận từ cùng cơ chế đã kiểm ở trên):** `auth.callback.*`
và `auth.logout.success`/`revoke_rejected` ở phía BFF — dùng lại NGUYÊN VẸN `logger.ts` (đã
kiểm qua `admin.access_denied`) và cùng kiểu header `fetch` (đã kiểm qua session revoke phía
Control Plane), nhưng đường callback thật cần một lượt OIDC thật qua Logto (không tự động hoá
được, xem A9) nên chưa chạy qua trình duyệt thật lượt này.

### B4. Rollback rehearsal — §17 — ✅ ĐÃ XONG (2026-07-22)

Ba file gỡ ở [`apps/control-plane/drizzle/rollback/`](../../apps/control-plane/drizzle/rollback/)
và bài diễn tập tự động ở `tests/integration/migration-rollback.test.ts` (11 test): dựng
schema đầy đủ trên PostgreSQL thật, gỡ ngược lại, kiểm chứng schema quay đúng về trạng thái
cuối P2 — gồm cả việc ràng buộc actor của audit trở lại dạng chỉ `account`/`system`, trigger
append-only còn nguyên và vẫn chặn `UPDATE`.

Đã kiểm chứng bằng cách phá: đảo thứ tự gỡ thì **4 test đỏ** đúng chỗ.

**Đính chính tên:** trigger tên là `audit_events_append_only`, **không** có hậu tố `_trg`.
Phase-3 §15 đang gọi sai tên — xem F9.

### B5. Kết quả CI — TÌM ĐƯỢC MỘT NGUYÊN NHÂN ĐỎ THẬT (2026-07-31), vẫn chờ chủ dự án xem run

Điều kiện 7 của exit gate P1, vẫn chưa ai NHÌN vào một run thật.

**Agent không đọc được trạng thái run:** repo `HoangKhai17/Talosmine` là private, máy dev không
có `gh` CLI và git không có credential lưu (`git ls-remote` đòi đăng nhập). Cần chủ dự án mở
`https://github.com/HoangKhai17/Talosmine/actions` và báo lại bốn job (`quality`, `test`, `db`,
`build`) xanh hay đỏ. Đây là việc DUY NHẤT của B5 mà agent không làm thay được.

**Nhưng chạy được chính các lệnh CI chạy, và job `quality` CHẮC CHẮN ĐỎ ở commit đã push.**
`pnpm lint` (biome) báo lỗi format thật trong `tests/e2e/authenticated.spec.ts` — file commit
hôm 2026-07-30: hai lời gọi `test(...)` có tham số vượt `lineWidth: 100`, biome đòi xuống dòng
`({ browser })` thành nhiều dòng. Đây là lỗi NỘI DUNG, không phải hiện tượng kết thúc dòng của
Windows: blob trong git là LF, và `biome.json` cũng đặt `lineEnding: "lf"`. CI chạy đúng
`pnpm lint` không kèm `continue-on-error` nên job dừng ngay tại đó — nghĩa là gitleaks (điều 8
của exit gate) cũng chưa từng chạy, vì nó nằm SAU bước lint trong cùng job.

Đã sửa (`biome check --write`). Sau khi sửa, các lệnh của job `quality` và `test` đều xanh trên
máy dev: `typecheck`, `lint`, `openapi:lint`, `openapi:drift`, `test` (475 test).

**Còn lại chưa kiểm được ở máy dev:** job `db` (dựng PostgreSQL từ volume RỖNG rồi migrate —
máy dev đang có dữ liệu, chạy sẽ phá), job `build` (build hai image Docker), và bước gitleaks.
Ba thứ này chỉ CI trả lời được.

**Bẫy cần biết khi đọc lint ở máy này:** `core.autocrlf=true` mà repo không có `.gitattributes`,
nên file nào git vừa ghi lại (checkout, stash/pop) sẽ thành CRLF trong working tree và biome
báo "needs to be formatted" hàng loạt — TOÀN LÀ NHIỄU, không phải lỗi thật, và không lên tới CI
(blob vẫn là LF, `git diff` vẫn sạch). Cách phân biệt: lỗi thật thì `biome check <file>` vẫn báo
sau khi đã chuyển file về LF.

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

Phần lớn là **nút có mặt đúng chỗ trong bố cục nhưng chưa gắn hành vi** (trừ băng đối tác —
xem đính chính bên dưới). Không cái nào giả vờ chạy: nút chưa có backend thì để `disabled`
hoặc render bằng chữ, không phải link.

- **Băng đối tác** (trang chủ) — đính chính (2026-07-30): **không có nút mũi tên nào trong
  code**, khác mô tả cũ ở đây. Thực tế là animation CSS tự chạy, dừng khi hover/focus, và
  cuộn tay được qua `overflow-x: auto` khi `prefers-reduced-motion: reduce`
  (`page.module.css`) — không phải "có nút nhưng chưa gắn hành vi". Không có việc gì cần làm
  trừ khi chủ dự án muốn thêm nút điều khiển thật.
- **Mũi tên dải danh mục** (`/tools`) — cùng tình trạng. Bàn phím vẫn tới được mọi pill nhờ
  Tab, nên không ai bị kẹt.
- **Tab lọc chủ đề** (`/blog`) — sẽ chuyển sang `searchParams` khi có dữ liệu thật, để lọc
  nằm trên URL và chia sẻ được link.
- **Ô tìm kiếm ở hero** và **bộ lọc `/tools`** — chưa có đích đến, chặn bởi F1.
- **Form newsletter** — chưa có backend.
- ~~**Biểu mẫu đăng nhập / đăng ký**~~ — ✅ đã nối, xem C5. `/auth` và `/auth/sign-up` giờ
  chuyển hướng 307 sang Logto; biểu mẫu thật nằm ở `apps/logto-ui`.
- **`/auth/check-email` trong Next.js** — giờ **không còn đường nào tới**. Việc nhập mã đã
  chuyển vào `apps/logto-ui` (cùng trang, không đổi URL — phiên tương tác nằm trong cookie
  của Logto). **Cần chủ dự án quyết: giữ hay xoá.** Để nguyên thì nó là một trang chết mà
  người rà soát sau sẽ tưởng là còn dùng.

### C5. Biểu mẫu xác thực theo Figma — ✅ ĐÃ CHỐT VÀ ĐÃ LÀM (2026-07-22)

**Chủ dự án chọn hướng "Bring your own UI".** Mật khẩu người dùng đi **thẳng từ trình duyệt
tới Logto**, không đi qua code của Talosmine — giữ nguyên tính chất đã có, chỉ thay lớp giao
diện.

| Hướng | Giao diện | Mật khẩu đi tới | |
|---|---|---|---|
| Giữ nguyên | Trang mặc định của Logto | Logto | bỏ |
| **Bring your own UI** | **Thiết kế Figma** | **Logto** | ✅ chọn |
| Experience API trong Next.js | Thiết kế Figma | **App của ta** rồi mới tới Logto | bỏ — kéo mật khẩu vào phạm vi code của mình |

**Không dùng tính năng `customUiAssets` có sẵn của Logto.** Nó nhận một file zip rồi đẩy lên
object storage; instance hiện chưa cấu hình storage provider nào nên upload trả 500. Và kể
cả có, giao diện khi đó nằm trong database dưới dạng một zip mờ đục — không diff được, không
review được, không có trong git. Thay vào đó `docker-compose.yml` **mount đè** thư mục
`apps/logto-ui` lên thư mục giao diện của Logto.

Đã dựng: `/sign-in`, `/register`, `/forgot-password`. Chi tiết trong
`apps/logto-ui/README.md`.

Bốn thứ ở Logto nêu trong bản cũ của mục này **đã xử lý xong**, bằng script chứ không bấm
tay (`infra/scripts/configure-logto-*.mjs`) — cấu hình này nằm trong database của Logto,
không nằm trong git, nên bấm tay thì máy dev một kiểu và production một kiểu:

```
branding.logoUrl    -> xoa han (truoc do tai logo TU MAY CHU CUA LOGTO, ro IP va Referer
                       cua nguoi dung sang ben thu ba ngay tai trang go mat khau)
languageInfo        -> { autoDetect: false, fallbackLanguage: 'en' }  (ly do giao dien tung
                       nhay sang tieng Phap)
signUp.identifiers  -> ['email'] co xac minh; signIn nhan ca email lan username
forgotPasswordMethods -> ['EmailVerificationCode']   (xem A1)
```

Hai thứ **chưa** xử lý được:

- `hideLogtoBranding` là tính năng **trả phí**, bản OSS từ chối thẳng. Không cần: dòng
  "Powered by Logto" nằm trong giao diện mặc định, mà ta đã thay toàn bộ.
- `socialSignIn: {}` — chưa có connector Google. Nút "Tiếp tục với Google" để `disabled` kèm
  ghi chú, không giả vờ chạy được.

Logto 1.41 **không có tiếng Việt** (đã thử `?lng=vi` → rơi về tiếng Anh). Giao diện của ta
viết cứng tiếng Việt nên phần lớn chữ không phụ thuộc thiết lập này.

**Còn treo, thu hẹp (2026-07-29):** cơ chế đã xong — `/terms` và `/privacy` tồn tại trên web
app, khe nội dung `legal.terms`/`legal.privacy` (migration 0014) sửa được trong
`/admin/content/pages`, và biểu mẫu đăng ký ở `apps/logto-ui` đã trỏ hai link đó (mở tab
mới, không phá form đang điền). **Việc còn lại chỉ là NỘI DUNG**: hai văn bản thật chưa được
soạn — chủ dự án cần điền vào hai khe đó trước khi phát hành. Trang hiện thông báo "đang
được biên soạn" thay vì 404 hay trắng.

### C4. Bảng màu dark

`globals.css` khoá `color-scheme: light`. Quy chuẩn chỉ định nghĩa bảng sáng; bật dark mà
tự bịa màu sẽ lệch thiết kế. Cần chủ dự án cung cấp bảng dark.

---

## D. Khoảng trống giữa thiết kế và kế hoạch

### D0. Module Site Content + i18n — ĐÃ LÀM, nằm ngoài P0–P9

Ghi ở đây vì build plan không có mục nào cho hai việc này; chúng đến từ yêu cầu trực tiếp
của chủ dự án (2026-07-27) và đã được chốt bằng DEC-T25, DEC-T26, DEC-B15.

**Đã xong:**

| Phần | Trạng thái |
|---|---|
| i18n khung (`/vi`, `/en`, proxy, `<html lang>`, hreflang) | Xong, có test |
| Dịch toàn bộ nhánh `(user)` + `loading`/`not-found`/`error` | Xong |
| Migration `0010_site_nav` + rollback + diễn tập | Xong |
| API `/v1/site/nav` (công khai) + `/v1/admin/site/nav` | Xong, trong OpenAPI |
| Trang `/admin/content/nav` | Xong (gồm cả ô đặt logo) |
| Logo quản trị được — **tải file lên** (`site_assets`, migration 0015) | Xong; URL cũ (0011) giữ làm dự phòng |
| Văn bản pháp lý — `/terms`, `/privacy` + khe CMS (migration 0014) | Xong khung + cơ chế; **nội dung chưa soạn** |
| Header mobile: logo + nút ba gạch | Xong |
| Khảo sát onboarding — luồng người dùng (migration 0012) | Xong |
| Khảo sát — quản trị nội dung (`/admin/content/survey`) | Xong, có test |
| Khảo sát — báo cáo kết quả (`/admin/survey/responses`) | Xong, có test |
| Đọc nav ở web: cache 60s + fallback | Xong |

**Chưa làm — việc kế tiếp của hướng này:**

1. **KHẢO SÁT — tự xem/xoá câu trả lời (DEC-B11 câu 2) — ✅ ĐÃ XONG (2026-07-30).**
   `GET`/`DELETE /v1/me/onboarding/response` (Control Plane) + trang
   [`/account/survey`](../../apps/web/app/[locale]/(user)/account/survey) (web), cùng khuôn
   `/account/sessions`. GET trả nội dung ĐỌC ĐƯỢC (câu hỏi + lựa chọn đã dịch theo locale,
   khác `SurveyResponseRecord` của admin chỉ trả khoá thô); vẫn hiển thị đúng lựa chọn đã bị
   admin tắt SAU khi trả lời (không lọc theo `active` — đây là lịch sử, không phải bộ câu hỏi
   hiện hành). DELETE xoá cả `survey_answers` theo tầng (`ON DELETE CASCADE`), account quay
   lại trạng thái "chưa onboard".

   **Cần migration 0016** (`survey_response_self_delete`): migration 0012 CỐ Ý không cấp
   quyền DELETE trên `survey_responses`/`survey_answers` cho `talosmine_runtime` — đúng ở
   thời điểm đó (chưa có đường xoá hợp lệ nào), sai bây giờ (DEC-B11 câu 2 tạo ra một đường
   hợp lệ). Đã kiểm chứng THẬT bằng container Postgres riêng, role bị giới hạn: `ON DELETE
   CASCADE` KHÔNG đòi quyền DELETE trên bảng con, nên chỉ cấp GRANT trên `survey_responses`,
   giữ nguyên bất biến "không có đường DELETE trực tiếp vào `survey_answers`".

   **Tìm được HAI lỗi thật ở tầng BFF khi test qua trình duyệt thật (`tests/e2e/survey-answers.spec.ts`),
   cả hai đều đã tồn tại từ trước, chưa ai chạm tới:**
   - `apps/web/app/api/bff/[[...segments]]/route.ts` bỏ rơi QUERY STRING (`?locale=vi`) khi
     forward sang Control Plane — catch-all chỉ bắt path segments. Ảnh hưởng MỌI endpoint cần
     tham số qua GET gọi từ trình duyệt (kể cả endpoint có từ trước, chỉ là chưa ai gọi kèm
     query qua đường này).
   - Cùng file: MỌI request khác GET bị coi là "có body", kể cả DELETE không kèm body (thu
     hồi phiên của chính mình, xoá câu trả lời khảo sát) — gửi `content-type: application/json`
     với thân RỖNG, bị Fastify từ chối thẳng ("Body cannot be empty..."). **Đây là lỗi có
     thật, ảnh hưởng cả nút "Thu hồi" ở `/account/sessions` đã có từ trước** — chưa từng lộ ra
     vì chưa có e2e nào từng BẤM nút đó qua trình duyệt thật (chỉ test API trực tiếp qua
     `app.inject`). Đã sửa: đọc body thật rồi kiểm độ dài, không suy theo method.

   Test: 28 integration mới ở `tests/integration/survey-api.test.ts` (gồm cả cách ly cross-
   account: không đọc/xoá được response của người khác), 6 e2e mới, cộng 3 test cũ về quyền
   role runtime được viết lại cho khớp thực tế (`survey_responses` giờ CÓ DELETE,
   `survey_answers` vẫn KHÔNG).
   - **Vẫn `open`:** thời hạn lưu cụ thể (câu 1 của DEC-B11) — cần trước khi phát hành ra
     người dùng thật.
   - **Chưa có xuất CSV.** Báo cáo hiện chỉ đọc trên màn hình; xuất file là một bề mặt rò dữ
     liệu mới nên chờ chính sách lưu trữ (câu 1) trước.
2. ~~Content slot + SEO theo route~~ — **ĐÃ LÀM (2026-07-28, migration 0013)**: 41 khe cho 6
   trang + footer/newsletter, gồm cả `<title>` và meta description theo route; sửa ở
   `/admin/content/pages`. Chưa có: ảnh OG (chờ object storage), và FAQ trên trang chủ vẫn
   là placeholder (cần cấu trúc Q&A riêng, không phải khe chữ đơn).
3. **Vô hiệu hoá cache xuyên tiến trình.** DEC-T26 chấp nhận độ trễ 60 giây và cache theo
   từng tiến trình web. Khi chạy nhiều instance, hai người dùng có thể thấy hai phiên bản
   menu trong vòng một phút. Cần pub/sub khi việc đó thành vấn đề thật.
4. ~~UPLOAD FILE LOGO — chặn ở hạ tầng~~ — **ĐÃ LÀM (2026-07-29, migration 0015)**, đi đường
   KHÁC với kế hoạch gốc: object storage vẫn CHƯA được dựng, nên logo được lưu thẳng trong
   PostgreSQL (bảng `site_assets`, cột `bytea`, trần 512KB, chỉ nhận png/jpeg/webp — không
   SVG). Quản trị viên tải file trực tiếp ở `/admin/content/nav`, không cần dán URL hay khai
   `CATALOG_ALLOWED_HOSTS` nữa. Đây là giải pháp CHO RIÊNG một file nhỏ đọc qua cache 60s,
   không thay thế DEC-T12: ảnh catalog (nhiều, lớn hơn) vẫn cần object storage thật khi tới
   lượt P3. URL cũ (`site_settings.logo.url`) giữ lại làm đường dự phòng, file tải lên
   luôn thắng nếu có cả hai.
5. **Icon mạng xã hội ở footer** vẫn là `<span>` không link — chưa có tài khoản thật, và
   mô hình `nav_items` bắt buộc mọi mục phải có `href` nên chúng chưa vào CMS được.
6. **Mục `footerPending`** (Giới thiệu, Hướng dẫn, Bản tin, FAQ) vẫn hardcode: chúng cố ý
   không có đích đến. Khi trang tương ứng ra đời thì xoá khỏi code và thêm vào CMS.
   **`Chính sách riêng tư` đã rời khỏi danh sách này từ 2026-07-28** — route `/privacy` đã
   tồn tại thật (xem C5), chỉ còn 4 mục trên là thật sự chưa có đích.

### D1. Blog, "Gửi công cụ", "Liên hệ" — ✅ ĐÃ CHỐT vào P3 (2026-07-30, xem A8/DEC-B16)

Ba mục này có trong thiết kế Figma và **đã dựng bố cục đầy đủ**. Trước đây build plan P0–P9
không có mục nào cho chúng — nay đã chốt **gộp vào P3**, làm cùng đợt với catalog.

| Route | Trạng thái (2026-07-30) |
|---|---|
| `/blog` | Bố cục đầy đủ, dữ liệu mẫu |
| `/blog/[slug]` | Bố cục đầy đủ, dữ liệu mẫu, chưa đọc `slug` |
| `/submit` | Trang chỗ giữ chỗ — dùng chung component `ComingSoon` |
| `/contact` | Trang chỗ giữ chỗ — dùng chung component `ComingSoon` |

Blog còn thiếu **toàn bộ tầng dữ liệu**: chưa có bảng, chưa có API, chưa có trang quản trị
soạn bài. Bố cục dựng trước theo yêu cầu của chủ dự án.

`/submit`, `/contact` cần xác định form ghi vào đâu (bảng mới trong Control Plane, hay chỉ
gửi email) — chưa thiết kế, là việc kỹ thuật kế tiếp khi P3 tới lượt hai trang này.

### D2. Trang chủ và `/tools` đã lấn sang P3 — có chủ đích

Lưới "Tìm đúng công cụ" / "Khám phá danh mục" ở trang chủ, và toàn bộ trang `/tools`
(bộ lọc, dải danh mục, lưới kết quả) chính là UI catalog mà §10 của phase-3 mô tả. Layout
dựng trước theo yêu cầu, dữ liệu là mẫu — biến đặt tên `PLACEHOLDER_*` trước đây đã đổi
thành tên cụ thể hơn (`CATEGORY_TAB_COUNT`, `MODEL_FILTER_COUNT`, `RESULT_IDS`…), bản chất
không đổi: vẫn hoàn toàn tĩnh, không gọi API nào.

**Sang P3 chỉ thay các mảng đó bằng lời gọi API — không dựng lại layout.** Ghi ở đây để
người làm P3 không tưởng là phải làm lại từ đầu. Việc còn lại xem F2.

### D3. `/categories` tồn tại nhưng chưa có nghĩa

Route `/categories` đang là trang chỗ giữ chỗ (dùng chung component `ComingSoon` như
`/submit`/`/contact`). **Build plan không định nghĩa taxonomy nào**,
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

### E1. Production deploy — thuộc P8 — ĐÍNH CHÍNH LỚN (2026-07-30): mô tả cũ đã sai

**Dockerfile và Caddy ĐÃ CÓ**, khác hẳn mô tả cũ ("chưa có"):
- [`infra/docker/web.Dockerfile`](../../infra/docker/web.Dockerfile) — multi-stage cho
  `apps/web` (Next 16), user non-root.
- [`infra/docker/control-plane.Dockerfile`](../../infra/docker/control-plane.Dockerfile) —
  multi-stage cho `apps/control-plane`, MỘT image dùng chung cho cả API (`dist/main-api.js`)
  và worker (`dist/main-worker.js`), chỉ đổi `command:` lúc chạy.
- [`infra/caddy/Caddyfile`](../../infra/caddy/Caddyfile) — route `/v1/*`, `/health/*` sang
  `control-plane:3001`, còn lại sang `web:3000`; security headers; ACME/Let's Encrypt tự
  động qua biến `TALOSMINE_SITE_ADDRESS`. CSP **cố ý không** đặt ở Caddy — Next tự sinh nonce
  theo từng request ở `apps/web/proxy.ts`, đặt CSP ở Caddy sẽ lệch nonce.

**Vẫn thiếu, và đây mới là chỗ chặn thật:** `infra/compose/docker-compose.yml` (compose
PRODUCTION — khác `docker-compose.dev.yml` là overlay cho dev) hiện chỉ có 3 service (`db`,
`supavisor`, `logto`). **Chưa có service `web`, `control-plane`, `caddy`** — hai Dockerfile
và Caddyfile ở trên trỏ tới các hostname (`web:3000`, `control-plane:3001`) chưa tồn tại
trong compose, tự Caddyfile cũng ghi nhận điều này (khối "TRẠNG THÁI THẬT"). Và **trình quản
lý tiến trình vẫn chưa có** (không PM2/systemd/supervisor nào trong repo) — đúng phần này
mô tả cũ không sai.

Ràng buộc đã biết: cookie `__Host-` **bắt buộc HTTPS**; cổng 3002 (Admin Console Logto)
**không được** mở ra internet.

### E2. Back-channel logout từ IdP

Cột `web_sessions.idp_sid` đã có sẵn cho mục đích này nhưng **chưa có endpoint** nhận tín
hiệu logout từ Logto. Khi người dùng đăng xuất ở phía IdP, phiên Talosmine hiện vẫn sống
tới khi hết hạn.

**Sâu hơn mô tả cũ (2026-07-30):** cột `idp_sid` hiện **chưa từng được GHI giá trị**, không
chỉ thiếu endpoint đọc. `createWebSession()` nhận `opts.idpSid` optional
([`web-session.ts:53-56`](../../apps/control-plane/src/modules/identity/web-session.ts)),
nhưng lời gọi duy nhất tới nó — ở `AuthController.exchange`
([`auth.controller.ts:101-103`](../../apps/control-plane/src/modules/identity/auth.controller.ts)) —
không truyền `idpSid`, và claim đã verify từ id_token cũng không có field `sid`. Kết quả: cột
này luôn `NULL`. Xây endpoint nhận tín hiệu logout ngay bây giờ cũng vô dụng — chưa có gì để
tra cứu. Cần sửa CẢ nơi tạo phiên (đọc claim `sid` từ Logto, truyền vào `createWebSession`)
TRƯỚC khi endpoint có ý nghĩa. Chi tiết đầy đủ hơn đã có ở
[`docs/identity-provider.md` mục 15](../identity-provider.md) — bao gồm việc Logto discovery
tự khai `backchannel_logout_supported: true`.

---

## F. Phase 3 — việc kỹ thuật còn lại

> **Rà lại 2026-07-30:** mục F chưa được cập nhật kể từ 2026-07-22 dù nhiều mốc khác của tài
> liệu (mục B) đã tiến xa hơn — đây là phần lệch nhịp rõ nhất của file này. Đã đối chiếu lại
> từng bước với code thật; các mục dưới đã cập nhật, ngày trong ngoặc là ngày rà chứ không
> phải ngày viết code.

Trạng thái tổng thể (rà lại 2026-07-30), đối chiếu với 14 bước ở §15 của phase-3:

| Bước | Nội dung | Trạng thái |
|---|---|---|
| 1 | Thu quyết định nghiệp vụ | ⚠ A4 đã chốt hướng (2026-07-30) nhưng còn chờ dữ liệu app thật; còn A5, A6, A7 và F1 |
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

**Thu hẹp được nhờ DEC-B01 (2026-07-30):** hướng "hub đóng ~10 app" nghĩa là danh sách rất
nhỏ — không cần pagination phức tạp, không cần full-text search hạng nặng. Một gợi ý tối
giản để bạn duyệt nhanh (thay vì phải tự nghĩ từ đầu): tìm theo tên (client-side, không cần
endpoint riêng), lọc theo trạng thái hiển thị công khai, sắp xếp theo tên hoặc thứ tự admin tự
xếp tay. Nếu đồng ý hướng này thì F1 coi như chốt; nếu muốn khác (ví dụ lọc theo loại hình,
theo mô hình AI dùng) thì cần nói rõ trường nào.

### F2. UI danh mục phía người dùng — nối API và ba thứ còn thiếu

Bố cục xong (xem D2). Còn lại:

- **Nối API.** Thay dữ liệu mẫu ở `app/[locale]/(user)/page.tsx` và
  `app/[locale]/(user)/tools/page.tsx` (tên biến đã đổi từ `PLACEHOLDER_*` sang tên cụ thể
  hơn — `CATEGORY_TAB_COUNT`, `RESULT_IDS`… — bản chất không đổi) bằng lời gọi
  `/v1/catalog/applications`.
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

**Con số cập nhật (2026-07-31):** **475 test** unit+integration (`pnpm run test`) và **252
test e2e** (`pnpm exec playwright test`, xem B2). Theo §14 còn thiếu:

- **Chỉ số:** `unit` thiếu/rỗng/placeholder/chưa duyệt thì không tạo được dòng nào. Chặn
  bởi A5 — chưa có endpoint để kiểm.
- **Service identity và audit — MỘT PHẦN ĐÃ CÓ (đính chính 2026-07-30).** Khác mô tả cũ
  "chưa có": [`tests/integration/catalog-schema.test.ts`](../../tests/integration/catalog-schema.test.ts)
  đã có `describe('service_identities')` (không cột nào chứa secret/token) và
  `describe('audit — nâng cấp actor của P3')` (actor `service` phải trỏ FK hợp lệ, thiếu FK
  bị từ chối). **Vẫn thiếu:** test hành vi "một service identity không bind được sang app
  khác" — module `service-identity` mới có `schema.ts`, chưa có controller/service nên chưa
  có gì để gọi mà test.
- **URL ảnh:** bộ test âm — URL có token presigned, URL chuyển hướng tới host nội bộ, phản
  hồi quá lớn hoặc không phải ảnh. Phạm vi phụ thuộc F2 (có fetch ảnh phía server hay không).
- **Tương tranh:** hai lệnh tạo cùng `key`, hai lệnh đổi trạng thái cạnh tranh, hai lệnh
  thêm cùng redirect — phải cho một kết quả nhất quán, không nhân đôi, và audit không tách
  khỏi transaction. `tests/concurrency/row-lock.test.ts` hiện chỉ test khoá dòng cho
  quota/balance (generic), chưa có case catalog nào chạy thật đồng thời (`Promise.all`) —
  các test "key trùng → 409" hiện có đều là tuần tự, không phải race thật. Vẫn thiếu.
- **Accessibility và responsive cho màn hình danh mục — BLOCKER B2 ĐÃ GỠ (2026-07-30).**
  Khác mô tả cũ "chặn bởi B2": phía quản trị,
  [`tests/e2e/admin-pages.spec.ts`](../../tests/e2e/admin-pages.spec.ts) đã có 3 test cho
  `/admin/catalog` (trạng thái rỗng, không tràn ngang, focus khi tab). Phía người dùng,
  `/tools` đã có trong bộ test bố cục tĩnh (`web-shell.spec.ts`, `grid.spec.ts`) nhưng đó là
  test LAYOUT TĨNH — chưa test được hành vi sau khi nối API thật vì F2 (nối API) chưa làm.

### F11. Ứng dụng `hosted` — ĐỢT 1 ĐÃ XONG (2026-07-31), bốn khoản nợ tạm còn treo

DEC-B17 + DEC-T27 (duyệt 2026-07-31) mở loại ứng dụng thứ hai: Hub tự chạy giao diện và gọi
API nhà cung cấp thứ ba. **Đợt 1 (backend) đã xong và chạy được**; đây là danh sách những gì
CỐ Ý chưa làm, để lần rà sau không tưởng là bỏ sót.

**Đã có:** migration `0017` (`applications.kind`, `launch_url` thành nullable có điều kiện,
bảng `application_hosted_bindings`) + rollback + bài diễn tập gỡ RIÊNG 0017;
[`outbound-fetch.ts`](../../apps/control-plane/src/shared/outbound-fetch.ts) là đường ra
Internet duy nhất; `POST /v1/catalog/applications/{key}/run`; quản trị binding qua
`PUT`/`DELETE .../hosted-binding`; adapter HuggingFace. **34 test mới** (12 unit + 22
integration), nhà cung cấp là HTTP server THẬT dựng bằng `node:http`, không mock `fetch`.

**Bốn khoản nợ tạm, tất cả đảo ngược được:**

1. **Khoá API còn ở biến môi trường** (`HUGGINGFACE_API_TOKEN`), chưa phải bảng mã hoá
   at-rest như DEC-T27 chốt. Đủ an toàn cho một người vận hành, KHÔNG đủ khi có nhiều nhà
   cung cấp hoặc nhiều người quản trị.
2. **Gọi đồng bộ, chưa có hàng đợi.** Trần `timeout_ms` tối đa 300s và CHECK trong database
   chặn cao hơn thế — cố ý, vì dài hơn là việc của hàng đợi. `main-worker.ts` vẫn chưa có
   job nào.
3. **Chưa trừ điểm tín dụng, chưa ghi `usage_metrics`.** Chặn bởi phần sub của DEC-B18 (chủ
   dự án đang chốt) và DEC-B05 (đơn vị đo). Lượt chạy hiện chỉ ghi `audit_events`.
4. **Còn một khoảng hở DNS rebinding hẹp.** `outboundFetch` phân giải DNS và kiểm MỌI địa chỉ
   trước khi gọi, nhưng vẫn `fetch` theo hostname chứ chưa kết nối thẳng tới địa chỉ đã kiểm
   — nên về lý thuyết bản ghi DNS có thể đổi giữa lúc kiểm và lúc nối. Đóng hẳn cần dispatcher
   tuỳ biến của `undici`. Ghi ra đây thay vì ỉm: mức rủi ro thấp (allowlist host vẫn là cửa
   đầu tiên, và nhà cung cấp là danh mục đóng khoá bằng CHECK), nhưng nó có thật.

**CHƯA CHẠY THẬT VỚI NHÀ CUNG CẤP THẬT.** Toàn bộ test dùng một HTTP server tự dựng đóng vai
HuggingFace. Cơ chế phía ta đã kiểm đầu-đến-cuối, nhưng **hợp đồng với API thật của
HuggingFace thì chưa** — cần một API token thật để biết payload và định dạng phản hồi có
khớp không. Đây là việc kế tiếp, không phải việc đã làm.

**Đợt 2 chưa làm:** trang `/tools/[key]` để người dùng thật sự bấm chạy, và form quản trị
binding trong `/admin/catalog`.

### F12. Khu `/account` — 5 trang đã dựng GIAO DIỆN (2026-08-06), backend còn thiếu

Chủ dự án cung cấp mockup cho Profile · Save tools · Notifications · Security · Help Center.
Đã dựng theo hướng **layout trước, backend sau** — cùng cách trang chủ và `/tools` đang làm.

**Đã có:** `layout.tsx` chung (sidebar + breadcrumb) cho TOÀN BỘ `/account`, nên ba trang cũ
(`account`, `sessions`, `survey`) cũng nhận được khung này và bỏ được phần `container section`
tự khai ở mỗi trang. Bốn trang mới + Profile cập nhật. **27 test e2e** (`account-pages.spec.ts`).

**CHƯA CÓ BACKEND — mọi điều khiển liên quan đều `disabled` thật, có test giữ:**

1. **Save tools** — chưa có bảng bookmark, chưa có API. Trang hiện trạng thái RỖNG thật, cố ý
   KHÔNG render thẻ mẫu: thẻ giả sau vài tuần trông y hệt thẻ thật.
2. **Notifications** — chưa có bảng preferences, chưa có hạ tầng gửi thư ngoài SMTP của Logto.
3. **Profile: `username`, `bio`, ảnh đại diện** — `accounts` không có cột nào cho chúng. Thêm
   cột cần quyết định sản phẩm trước (username có duy nhất không, có công khai không).
4. **Đổi mật khẩu** — xem dưới.

**Đổi mật khẩu — đã ĐO, chưa nối.** Chủ dự án chốt hướng: form nằm trong Hub nhưng mật khẩu đi
**thẳng từ trình duyệt tới Logto**, giữ nguyên tắc C5. Kiểm chứng trên Logto 1.41 đang chạy:

- Account API **có thật**: `POST /api/verifications/password` + `POST /api/my-account/password`.
- **Nhưng `GET /api/account-center` trả `enabled: false`, `fields: {}`** — API có mà cổng đóng.

Còn hai việc: (a) script `configure-logto-account-center.mjs` theo khuôn
`configure-logto-sign-in.mjs` (ghi rồi **đọc lại để kiểm**); (b) thiết kế cách đưa access token
audience `me` xuống trình duyệt cho an toàn — hệ thống đang là BFF nên trình duyệt hiện KHÔNG
giữ token nào, đó là điểm cần cân nhắc chứ không phải chi tiết kỹ thuật.

**Ba chỗ mockup đi ngược quyết định đã chốt, đã làm theo quyết định chứ không theo mockup:**
ngôn ngữ chỉ `vi`+`en` (DEC-B15, mockup có Korean/Japanese) · theme chỉ Light (C4 chưa có bảng
màu dark) · "Upgrade to Pro" để `disabled` (DEC-B18 chưa chốt cơ chế sub).

**Email cố ý CHỈ ĐỌC**, khác mockup: `identity-provider.md` §5 ghi Logto sở hữu email, ta chỉ
giữ bản sao. Cho sửa ở đây là tạo nguồn sự thật thứ hai.

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

### F9. Sai tên trigger trong phase-3 §15 — ✅ ĐÃ SỬA (2026-07-30)

§15 bước 6 gọi trigger là `audit_events_append_only_trg`. Tên thật trong migration `0004`
là **`audit_events_append_only`**, không có hậu tố.

Tài liệu sai chứ không phải code. Đã sửa cả hai chỗ gọi sai trong
[`phase-3-application-catalog.md`](./phase-3-application-catalog.md) (bước 6, mục Hành động
và Verify) về đúng tên thật.

### F10. Lệch khỏi bảng target path §7 — ✅ ĐÃ SỬA (2026-07-30)

| Kế hoạch cũ | Thực tế | Trạng thái |
|---|---|---|
| `modules/application-catalog` | đúng | ✅ Đã đổi đúng tên (2026-07-22) |
| `modules/service-identity` | đúng | ✅ Đã tách ra module riêng (2026-07-22) |
| `apps/web/src/bff/auth/features` | `apps/web/app/api/bff/` + `apps/web/server/` | ✅ Đã sửa kế hoạch cho khớp code (2026-07-30) |

Đã sửa `phase-3-application-catalog.md` (bảng §7 + hai chỗ nhắc lại trong bước 10) theo
hướng "sửa kế hoạch cho khớp code" — cấu trúc hiện tại theo đúng quy ước App Router của Next,
đổi code cho khớp kế hoạch cũ sẽ là đi ngược quy ước không có lý do tốt. Nhân dịp sửa cũng
cập nhật `apps/web/app/(user)` → `apps/web/app/[locale]/(user)` ở cùng bảng đó (route i18n
thêm vào sau khi bảng target path gốc được viết, cùng lớp lỗi thời với hàng BFF).

---

## Tài liệu liên quan

- [`decision-register.md`](./decision-register.md) — quyết định đã chốt và đang chờ
- [`phase-2-identity-account-admin-security.md`](./phase-2-identity-account-admin-security.md) — trạng thái P2 chi tiết
- [`phase-3-application-catalog.md`](./phase-3-application-catalog.md) — 14 bước của P3 và exit gate
- [`../identity-provider.md`](../identity-provider.md) — cơ chế Logto và ranh giới dữ liệu
- [`../url-policy.md`](../url-policy.md) — chống SSRF, allowlist host, các cách qua mặt
- [`../frontend-css-rules.md`](../frontend-css-rules.md) — quy tắc lưới và typography
