/*
 * Cấu hình giao diện đăng nhập cho MÁY CÁ NHÂN.
 *
 * `docker-compose.dev.yml` mount file này đè lên `config.js`. Lệnh production không nêu
 * overlay đó, nên file này không bao giờ tới production.
 *
 * Xem `config.js` để hiểu vì sao địa chỉ web app phải được khai chứ không suy ra được.
 */
window.TALOSMINE_APP_URL = 'http://localhost:3000';
