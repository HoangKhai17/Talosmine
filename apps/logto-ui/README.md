# Giao diện đăng nhập Talosmine (chạy trong Logto)

Ba file tĩnh thay thế giao diện mặc định của Logto ở `/sign-in` và `/register`.

## Vì sao nó nằm ở đây chứ không trong `apps/web`

Mật khẩu người dùng đi **thẳng từ trình duyệt tới Logto**, không đi qua web app của
Talosmine. Nếu dựng biểu mẫu này trong Next.js thì mọi lỗ XSS và mọi thư viện trong cây phụ
thuộc của web app đều trở thành rủi ro lộ mật khẩu.

Ở đây bề mặt rủi ro đúng bằng ba file không phụ thuộc gì: **không React, không bundler,
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

Những thứ khác đang thiếu, có lý do:

- **Không có link "Về trang chủ"** dù thiết kế có. Trang này do Logto phục vụ và không biết
  địa chỉ web app của Talosmine. Đoán một URL sẽ thành link hỏng khi lên production. Muốn
  có thì phải truyền địa chỉ đó vào lúc triển khai.
- **Không có nút "Tiếp tục với Google"** — chưa cấu hình connector nào (`socialSignIn: {}`).
- **Không có "Quên mật khẩu"** — Logto chưa cấu hình SMTP (xem `pending-work.md` A1).
- **Ô nhập là TÊN ĐĂNG NHẬP, không phải email**, khác thiết kế Figma. Đây là quyết định của
  chủ dự án (2026-07-22): giữ `signUp.identifiers: ["username"]`, đổi sang email tính sau.
  Đổi ở Logto thì phải đổi `identifier.type` trong `app.js` theo.
- **Font khác web app.** Web app self-host Montserrat qua `next/font`; trang này dùng ngăn
  xếp font hệ thống vì cố ý không tải font từ CDN. Muốn khớp hẳn thì chép file font vào đây
  và khai `@font-face`.

## Token CSS là bản sao

`styles.css` chép một phần token từ `apps/web/app/globals.css`. Bản sao có chủ đích: file
này không đi qua Next nên không import được, và tải CSS từ origin của web app sẽ khiến trang
đăng nhập phụ thuộc vào một máy chủ khác còn sống.

**Đổi bảng màu hoặc thang chữ ở `globals.css` thì phải sửa cả ở đây.**
