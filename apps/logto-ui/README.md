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
<link rel="stylesheet" href="/globals.css?v=2" />
<script src="/app.js?v=2"></script>
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

## Vào màn hình đăng ký

Logto nhận `first_screen=register` trên authorization request (đã kiểm chứng trên bản 1.41;
tham số cũ `interaction_mode=signUp` cũng còn chạy). Không có tham số thì vào `/sign-in`.

## Giới hạn đang có

**Mount này thay TOÀN BỘ giao diện của Logto.** Mọi đường dẫn chưa dựng rơi vào màn hình dự
phòng trong `app.js` — nó nói thẳng "chưa có", thay vì để trang trắng.

| Màn hình | Trạng thái |
|---|---|
| `/sign-in` | ✅ email hoặc tên đăng nhập + mật khẩu |
| `/register` | ✅ email + xác minh bằng mã |
| `/forgot-password` | ✗ **màn hình dự phòng** — Logto hỗ trợ và connector thư đã sẵn sàng, chỉ chưa dựng giao diện |
| MFA, đăng nhập mạng xã hội, màn hình đồng ý | ✗ chưa bật ở Logto nên chưa tới được |

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
