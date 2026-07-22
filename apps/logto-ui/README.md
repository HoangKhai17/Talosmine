# Giao diện đăng nhập Talosmine (chạy trong Logto)

Một gói tĩnh thay thế giao diện mặc định của Logto ở `/sign-in` và `/register`.

## Vì sao nó nằm ở đây chứ không trong `apps/web`

Mật khẩu người dùng đi **thẳng từ trình duyệt tới Logto**, không đi qua web app của
Talosmine. Nếu dựng biểu mẫu này trong Next.js thì mọi lỗ XSS và mọi thư viện trong cây phụ
thuộc của web app đều trở thành rủi ro lộ mật khẩu.

Ở đây bề mặt rủi ro đúng bằng vài file không phụ thuộc gì: **không React, không bundler,
không một package nào**. Đây là trang người dùng gõ mật khẩu — mỗi phụ thuộc là một cửa nữa
cho tấn công chuỗi cung ứng.

## Cách nó được nạp

`infra/compose/docker-compose.yml` mount thư mục này đè lên thư mục giao diện của Logto:

```yaml
- ../../apps/logto-ui:/etc/logto/packages/experience/dist:ro
```

Không dùng tính năng "custom UI assets" có sẵn của Logto vì hai lý do:

1. Nó nhận một **file zip** rồi đẩy lên **object storage**. Instance hiện tại chưa cấu hình
   storage provider nào — bảng `systems` chỉ có `alterationState` — nên upload trả 500.
2. Kể cả có storage, giao diện khi đó nằm trong database dưới dạng một zip mờ đục: không
   diff được, không review được, không có trong git.

Đổi giao diện = sửa file ở đây. **Không cần build, không cần restart** — bind mount đọc
thẳng từ đĩa.

## ⚠ Sửa file xong phải tăng `?v=` trong `index.html`

Logto phục vụ file tĩnh với `Cache-Control: max-age=604800` — **bảy ngày** — và ta không đổi
được header đó (static server của Logto, không phải của mình).

Riêng `index.html` là `no-cache` nên luôn tải mới. Vì vậy đổi số `v` trong đó là cách **duy
nhất** buộc trình duyệt lấy bản mới của `app.js` / `globals.css` / `auth.css`:

```html
<link rel="stylesheet" href="/globals.css?v=10" />
<script src="/app.js?v=10"></script>
```

**Quên tăng số = sửa xong nhưng không ai thấy gì thay đổi, kể cả sau khi F5.** Đã mắc đúng
lỗi này ngày 2026-07-22: nhiều vòng sửa liên tiếp không hiện ra vì trình duyệt vẫn dùng bản
cũ trong cache, và mất khá lâu mới nhận ra vấn đề không nằm ở code.

Thư mục `fonts/` không cần `?v=`: đổi font là đổi tên file.

## Luồng gọi API

Mọi màn hình dùng **Experience API** của chính Logto, cùng origin.
`credentials: 'same-origin'` là bắt buộc — phiên tương tác nằm trong cookie Logto đặt lúc
`/oidc/auth` chuyển hướng tới đây.

**Đăng nhập** — bốn chặng, nhận cả email lẫn tên đăng nhập:

```
PUT  /api/experience                        {interactionEvent:'SignIn'}
POST /api/experience/verification/password  {identifier:{type,value}, password}
POST /api/experience/identification         {verificationId}
POST /api/experience/submit              -> {redirectTo}
```

`identifier.type` do `identifierFor()` chọn: có dấu `@` thì `email`, không thì `username`.

**Đăng ký** — HAI BƯỚC, vì phải chứng minh người đăng ký sở hữu hộp thư đó. Không có bước
này thì ai cũng đăng ký bằng địa chỉ của người khác rồi chiếm luôn đường khôi phục mật khẩu
của họ.

```
Bước 1 (màn hình biểu mẫu)
  PUT  /api/experience                                  {interactionEvent:'Register'}
  POST /api/experience/verification/verification-code   {identifier, interactionEvent}
                                                     -> {verificationId}

Bước 2 (màn hình nhập mã)
  POST /api/experience/verification/verification-code/verify  {identifier, verificationId, code}
                                                           -> {verificationId MỚI}
  POST /api/experience/profile     {type:'email', verificationId}
  POST /api/experience/profile     {type:'password', value}
  POST /api/experience/profile     {type:'extraProfile', values}   (tuỳ chọn)
  POST /api/experience/identification  {}      <- chính bước này TẠO tài khoản
  POST /api/experience/submit               -> {redirectTo}
```

Thứ tự không đổi được. Gắn hồ sơ SAU bước định danh thì dữ liệu không vào tài khoản vừa tạo.

Màn hình nhập mã **thay nội dung, không chuyển trang**: phiên tương tác nằm trong cookie phía
máy chủ và mã gắn với chính phiên đó. Điều hướng sang URL khác sẽ khởi tạo lại phiên, và
người dùng gõ đúng mã vẫn bị báo sai.

Sau chặng cuối, trình duyệt đi tới `redirectTo` và luồng OIDC hiện có của Talosmine tiếp
quản: `/auth/callback` đổi code lấy phiên và tạo tài khoản trong Control Plane. **Không có
dòng code nào ở phía Talosmine phải sửa.**

**Quên mật khẩu** — BỐN chặng, và mỗi chặng có một cái bẫy riêng:

```
Bước 1 (nhập địa chỉ thư)
  PUT  /api/experience                                  {interactionEvent:'ForgotPassword'}
  POST /api/experience/verification/verification-code   {identifier, interactionEvent}
                                                     -> {verificationId}

Bước 2 (nhập mã)
  POST /api/experience/verification/verification-code/verify  -> {verificationId MỚI}
  POST /api/experience/identification  {verificationId}       -> 204

Bước 3 (mật khẩu mới)
  PUT  /api/experience/profile/password  {password}     <- PUT, và đường dẫn KHÁC /profile
  POST /api/experience/submit                           -> 204, KHÔNG có redirectTo

Bước 4  màn hình báo xong (không gọi API)
```

Ba chỗ tài liệu của Logto nói một đằng, máy chủ chạy một nẻo — cả ba đều đo được bằng luồng
thật, không phải suy đoán:

| Chỗ | Swagger khai | Thực tế |
|---|---|---|
| `submit` | 200 kèm `redirectTo` bắt buộc | **204 rỗng** |
| sau `submit` | ngụ ý có nơi để chuyển tới | người dùng **không** được đăng nhập vào |
| `identification` | dùng được cho `ForgotPassword` | đúng, **nhưng** chỉ khi `forgotPasswordMethods` ở sign-in experience có `EmailVerificationCode`; mặc định là **mảng rỗng** → `422 session.not_supported_for_forgot_password` |

Hệ quả của cái đầu tiên nếu không biết: `result.redirectTo` ném TypeError, `describeError`
không nhận ra đó là lỗi API nên hiện "Không kết nối được tới máy chủ" — **ngay sau khi mật
khẩu đã đổi thành công**. Người dùng được báo là hỏng trong khi mọi thứ đã xong, rồi họ thử
lại bằng mật khẩu cũ.

Vì vậy bước 4 (màn hình "Đã đổi mật khẩu") là **bắt buộc**, không phải trang trí: không có
chuyển hướng nào tự xảy ra, nên thiếu nó thì biểu mẫu đứng im sau khi bấm.

Bước 2 và bước 3 **tách rời có chủ đích**. Gộp lại thì một mật khẩu bị chính sách từ chối sẽ
tiêu luôn cái mã, và người dùng phải quay lại hộp thư xin mã mới chỉ vì gõ ngắn quá.

Ô "nhập lại mật khẩu" chỉ có ở màn hình này, không có ở đăng ký: gõ sai lúc đăng ký thì phát
hiện ngay lần đăng nhập kế tiếp và vẫn còn đường khôi phục; gõ sai ở đây thì đường khôi phục
vừa dùng xong.

`forgotPasswordMethods` được bật bởi `infra/scripts/configure-logto-sign-in.mjs`, và script
đó **đọc lại để kiểm** rồi ném lỗi nếu không vào — thiếu nó thì luồng hỏng ở bước cuối cùng,
chỗ tệ nhất để phát hiện vì người dùng đã nhập mã xong.

## Vào màn hình đăng ký

Logto nhận `first_screen=register` trên authorization request (đã kiểm chứng trên bản 1.41;
tham số cũ `interaction_mode=signUp` cũng còn chạy). Không có tham số thì vào `/sign-in`.

## Giới hạn đang có

**Mount này thay TOÀN BỘ giao diện của Logto.** Mọi đường dẫn chưa dựng rơi vào màn hình dự
phòng trong `app.js` — nó nói thẳng "chưa có", thay vì để trang trắng.

Màn hình nhập mã (`codeStep`) **dùng chung** cho đăng ký và khôi phục mật khẩu: hai luồng
cần đúng một thứ, và hai bản sao là cách chắc chắn để sau này sửa một bên rồi quên bên kia.

| Màn hình | Trạng thái |
|---|---|
| `/sign-in` | ✅ email hoặc tên đăng nhập + mật khẩu |
| `/register` | ✅ email + xác minh bằng mã |
| `/forgot-password` | ✅ thư → mã → mật khẩu mới → báo xong |
| `/unknown-session` | ✅ giải thích + đường quay lại |
| MFA, đăng nhập mạng xã hội, màn hình đồng ý | ✗ chưa bật ở Logto nên chưa tới được |

## ⚠ KHÔNG mở thẳng `localhost:3001/sign-in`

Gõ địa chỉ đó vào thanh địa chỉ luôn cho ra `/unknown-session`. **Đây là hành vi của Logto,
không phải lỗi giao diện** — đã đo:

```
localhost:3001/sign-in         -> 302 /unknown-session
localhost:3001/register        -> 302 /unknown-session
localhost:3001/forgot-password -> 302 /unknown-session

localhost:3000/auth            -> localhost:3001/sign-in?app_id=…   ✅
localhost:3000/auth/sign-up    -> localhost:3001/register?app_id=…  ✅
```

Phiên tương tác được tạo ở `/oidc/auth`, tức là khi web app khởi động luồng đăng nhập. Không
có bước đó thì Logto không biết đang đăng nhập vào ứng dụng nào, với `redirect_uri` nào,
`state` nào — nên nó không thể dựng màn hình đăng nhập, dù giao diện đã sẵn sàng.

**Cửa vào duy nhất là `localhost:3000/auth`** (hoặc `/auth/sign-up`).

**BẬT THÊM BẤT KỲ THỨ GÌ Ở LOGTO THÌ PHẢI DỰNG THÊM MÀN HÌNH Ở ĐÂY TRƯỚC.**

Những thứ có trong bố cục nhưng chưa chạy — không cái nào giả vờ chạy được:

- **"Tiếp tục với Google"** — nút `disabled`, chưa cấu hình connector (`socialSignIn: {}`)
- **"Điều khoản dịch vụ" / "Chính sách riêng tư"** — chữ mang màu nhấn như thiết kế nhưng
  không phải link: hai văn bản chưa được soạn

**Link "Về trang chủ"** đọc `window.TALOSMINE_APP_URL` từ `config.js` và **tự ẩn khi trống**.
Trang này do Logto phục vụ nên không suy ra được địa chỉ web app: `redirect_uri` không lộ cho
JavaScript, `document.referrer` mất qua chuỗi chuyển hướng. `config.js` trong git để TRỐNG
(an toàn cho production); `docker-compose.dev.yml` mount đè `config.dev.js` cho máy cá nhân.

## Cấu trúc CSS — giống hệt `apps/web`

```
globals.css   token, reset, thang chu, class tien ich   <- ban port cua apps/web/app/globals.css
auth.css      bo cuc rieng cua trang nay                <- KHONG co mot font-size nao
fonts/        Montserrat, hai bang ma latin + vietnamese (46KB)
```

Cách phân chia giống `apps/web`: cỡ chữ đến từ class tiện ích (`typeH2`, `typeBodySmall`,
`typeCaption`…), file bố cục chỉ nói về vị trí và khoảng cách. **Thấy `font-size` xuất hiện
trong `auth.css` là dấu hiệu ai đó vừa đi tắt.**

### Lưới: tràn viền NHƯNG vẫn trong container

Trang này không dùng class `.container`, nhưng `.page` dựng lại đúng hệ cột đó:

```
[full-start] lề [content-start] 12 cột nội dung [content-end] lề [full-end]
```

Nền kéo tới `full-start`/`full-end` nên chạm mép màn hình theo thiết kế; chữ bám vào các
track `content` nên nằm đúng mốc cột như mọi trang khác. Hai việc khác nhau, và bản trước
gộp làm một nên mất luôn container.

Ba chỗ đã đo sai rồi sửa, ghi lại để không ai lặp lại:

| Viết sai | Đo được | Vì sao |
|---|---|---|
| `minmax(--container-gutter, 1fr)` cho track lề | nội dung bắt đầu ở 144px thay vì 250px tại 1920 | `1fr` không "nuốt phần dư" — nó chia đều với 12 cột cũng là `1fr`, nên lề rộng đúng bằng một cột |
| lề không trừ `--grid-gap` | lệch đúng 24px mỗi bên | `column-gap` chèn thêm một khoảng giữa track lề và cột 1 |
| `grid-column: full-start / 7` | vùng trái chỉ chiếm 5 cột → chia 5\|7 | số vạch đếm cả track lề, nên vạch 7 rơi vào đầu cột 6. Đã thay bằng vạch có tên `[mid]` |

Số đo hiện tại (bề rộng phần nội dung): 1920 → 1420 · 1440 → 1200 · 1280 → 1040 ·
1024 → 960 · 390 → 350. Trùng khớp `.container` của `apps/web` ở mọi mốc.

Bản CSS trước viết cỡ chữ thẳng vào từng class bố cục, nên chữ ở đây trôi khỏi thang chung
mà không ai nhận ra cho tới khi đặt hai trang cạnh nhau.

### Font

Hai file subset Montserrat được **chép thẳng** từ kết quả build của Next
(`apps/web/.next/static/media/`). Chỉ lấy latin + vietnamese, bỏ cyrillic — 46KB thay vì
hơn 100KB.

Montserrat là font **biến thiên**: một file phục vụ mọi độ đậm, nên khai `font-weight` theo
khoảng `400 600` thay vì ba khối `@font-face` trỏ cùng một file.

**Không chép Inter.** Ở bản gốc Inter chỉ là font dự phòng đứng sau Montserrat; khi
Montserrat tải được thì Inter không bao giờ hiện.

Không tải từ Google Fonts — cùng lý do `next/font` self-host ở web app: mỗi tài nguyên từ
bên thứ ba là một lượt rò IP và Referer của người dùng, ngay tại trang gõ mật khẩu.

### Đồng bộ

**Đổi bảng màu hoặc thang chữ ở `apps/web/app/globals.css` thì phải sửa cả `globals.css` ở
đây.** Token, thang chữ và class tiện ích giữ đúng tên và đúng giá trị với bản gốc — đã đo
đối chiếu và khớp từng giá trị (font, `typeH1`, `typeH2`, `typeCardTitle`, `typeBody`,
`typeBodySmall`, `typeCaption`, `--container-gutter`, `--grid-columns`).

Đã lược bỏ phần trang đăng nhập không dùng: token chiều cao ảnh danh mục/blog,
`.gridDebug`, `.skipLink`. Lược để danh sách phải đồng bộ càng ngắn càng tốt.

### Ngoại lệ duy nhất: màu nhấn

`--color-accent` không có ở bản gốc. Thiết kế Figma của trang đăng nhập dùng một màu tím
cho từ được nhấn, nút chính và link; bảng màu đã duyệt hiện đơn sắc.

Giá trị hiện tại là **ước lượng đọc từ ảnh thiết kế**, không phải mã lấy từ Figma. Muốn cả
site dùng màu này thì phải thêm token vào `globals.css` bản gốc — quyết định về bảng màu,
thuộc quyền chủ dự án.
