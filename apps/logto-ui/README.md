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

Đổi giao diện = sửa file ở đây + `docker compose restart logto`. Không cần build.

## Luồng gọi API

Cả hai màn hình dùng **Experience API** của chính Logto, cùng origin, bốn chặng:

| Chặng | Đăng nhập | Đăng ký |
|---|---|---|
| 1 | `PUT /api/experience` `{interactionEvent:'SignIn'}` | `{interactionEvent:'Register'}` |
| 2 | `POST /api/experience/verification/password` | `POST /api/experience/verification/new-password-identity` |
| 3 | `POST /api/experience/identification` `{verificationId}` | như bên trái |
| 4 | `POST /api/experience/submit` → `{redirectTo}` | như bên trái |

`credentials: 'same-origin'` là bắt buộc — phiên tương tác nằm trong cookie Logto đặt lúc
`/oidc/auth` chuyển hướng tới đây.

Sau chặng 4, trình duyệt đi tới `redirectTo`, và từ đó luồng OIDC hiện có của Talosmine
tiếp quản: `/auth/callback` đổi code lấy phiên và tạo tài khoản trong Control Plane. **Không
có dòng code nào ở phía Talosmine phải sửa.**

## Vào màn hình đăng ký

Logto nhận tham số `first_screen=register` trên authorization request (đã kiểm chứng trên
bản 1.41; tham số cũ `interaction_mode=signUp` cũng còn chạy). Không có tham số thì vào
`/sign-in`.

## Giới hạn đang có

**Mount này thay TOÀN BỘ giao diện của Logto, không chỉ hai màn hình.** Mọi đường dẫn khác
rơi vào màn hình dự phòng trong `app.js`.

Hiện không đường nào trong số đó tới được, vì cấu hình Logto chỉ bật username + mật khẩu:
không social connector, không MFA, không SMTP. **Bật thêm bất kỳ thứ gì thì phải dựng thêm
màn hình ở đây trước.**

Những thứ có mặt trong bố cục nhưng CHƯA CHẠY. Không cái nào giả vờ chạy được: nút chưa có
gì phía sau thì để `disabled`, chữ chưa có đích đến thì không phải link.

- **"Tiếp tục với Google"** — nút `disabled`, chưa cấu hình connector nào (`socialSignIn: {}`).
- **"Quên mật khẩu?"** — chữ, không phải link. Logto chưa cấu hình SMTP (`pending-work.md` A1).
- **"Điều khoản dịch vụ" / "Chính sách riêng tư"** — chữ mang màu nhấn như thiết kế nhưng
  không phải link: hai văn bản chưa được soạn.
- **Ô nhập là TÊN ĐĂNG NHẬP, không phải email**, khác thiết kế Figma. Đây là quyết định của
  chủ dự án (2026-07-22): giữ `signUp.identifiers: ["username"]`, đổi sang email tính sau.
  Đổi ở Logto thì phải đổi `identifier.type` trong `app.js` theo. Ô đăng nhập ĐÃ nhận diện
  sẵn địa chỉ thư (có dấu `@` thì gửi `type: 'email'`), nên bật email ở Logto là chạy.

**Link "Về trang chủ"** đọc `window.TALOSMINE_APP_URL` từ `config.js` và **tự ẩn khi để
trống**. Trang này do Logto phục vụ nên không suy ra được địa chỉ web app: `redirect_uri`
không lộ cho JavaScript, `document.referrer` mất qua chuỗi chuyển hướng. ⚠ Giá trị mặc định
là địa chỉ dev — **lên production phải đổi**.

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
