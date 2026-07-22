/*
 * Cấu hình theo môi trường cho giao diện đăng nhập.
 *
 * Trang này do Logto phục vụ ở origin của Logto, nên nó KHÔNG biết web app Talosmine nằm ở
 * đâu. Không có cách nào suy ra: `redirect_uri` của OIDC không lộ ra cho JavaScript, và
 * `document.referrer` bị mất qua chuỗi chuyển hướng.
 *
 * Vì vậy địa chỉ web app phải được KHAI BÁO. File này tách riêng để đổi nó không phải đụng
 * vào `app.js`, và để môi trường khác mount đè đúng một file nhỏ.
 *
 * ĐỂ TRỐNG THÌ LINK "Về trang chủ" TỰ ẨN. Đó là mặc định an toàn: thà thiếu một link còn
 * hơn có một link dẫn tới máy chủ sai — nhất là ở trang đăng nhập, nơi một địa chỉ lạ là
 * dấu hiệu của lừa đảo.
 *
 * ⚠ LÊN PRODUCTION PHẢI ĐỔI. Giá trị dưới đây là địa chỉ dev.
 */
window.TALOSMINE_APP_URL = 'http://localhost:3000';
