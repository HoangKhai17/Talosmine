/*
 * Cấu hình theo môi trường cho giao diện đăng nhập.
 *
 * Trang này do Logto phục vụ ở origin của Logto, nên nó KHÔNG biết web app Talosmine nằm ở
 * đâu. Không có cách nào suy ra: `redirect_uri` của OIDC không lộ ra cho JavaScript, và
 * `document.referrer` bị mất qua chuỗi chuyển hướng.
 *
 * GIÁ TRỊ Ở ĐÂY LÀ MẶC ĐỊNH CHO PRODUCTION, và nó cố ý ĐỂ TRỐNG.
 *
 * Để trống thì link "Về trang chủ" TỰ ẨN. Đó là mặc định nghiêng về an toàn: quên cấu hình
 * thì mất một link, chứ không phải có một link trỏ về `localhost` trên trang đăng nhập
 * production — mà ở trang đăng nhập, một địa chỉ lạ chính là dấu hiệu của lừa đảo.
 *
 * Dev KHÔNG sửa file này. `docker-compose.dev.yml` mount đè `config.dev.js` lên nó.
 *
 * Khi có tên miền thật: điền vào đây và commit. Không sửa file lúc deploy.
 */
window.TALOSMINE_APP_URL = '';
