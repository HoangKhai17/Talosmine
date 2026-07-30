/**
 * Nạp `.env.dev` cho tiến trình chạy Playwright, cùng khuôn với `drizzle.config.ts`.
 *
 * Dùng `process.loadEnvFile` — API built-in của Node (20.12+), không thêm `dotenv` (ngoài
 * bảng D của decision register). Biến đã có trong môi trường (CI) được ƯU TIÊN: chỉ nạp
 * file khi thiếu, và bọc try/catch để môi trường không có `.env.dev` (CI, container) vẫn
 * chạy — lỗi thật sẽ hiện rõ ở nơi thật sự cần biến đó.
 *
 * Đường dẫn TƯƠNG ĐỐI theo cwd: `playwright test` chạy từ gốc repo (script `test:e2e` ở
 * `package.json` gốc), nên `.env.dev` không cần tiền tố `../`.
 */
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env.dev');
  } catch {
    // Không có .env.dev là bình thường trên CI/container.
  }
}
