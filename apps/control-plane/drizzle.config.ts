import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config (DEC-T09).
 *
 * Lưu ý quan trọng: migration nối TRỰC TIẾP PostgreSQL, KHÔNG qua Supavisor.
 * Lý do: DDL cần session ổn định, trong khi Supavisor chạy transaction pooling và
 * trả connection về pool giữa các statement. Nó cũng dùng role migration riêng có
 * quyền DDL — role runtime KHÔNG được có CREATE/ALTER/DROP.
 *
 * Vì vậy config này đọc MIGRATION_DATABASE_URL chứ không phải DATABASE_URL.
 */
/**
 * Nạp `.env.dev` khi chạy trên host mà biến chưa được set sẵn.
 *
 * Dùng `process.loadEnvFile` — API BUILT-IN của Node (20.12+), nên không phải thêm
 * `dotenv` hay `dotenv-cli` (cả hai đều ngoài bảng D của decision register).
 *
 * Biến đã có trong môi trường (ví dụ CI) được ƯU TIÊN: chỉ nạp file khi thiếu, và bọc
 * try/catch để CI không có file vẫn chạy bình thường.
 */
if (!process.env.MIGRATION_DATABASE_URL) {
  try {
    // Đường dẫn TƯƠNG ĐỐI theo cwd (drizzle-kit chạy từ apps/control-plane).
    // KHÔNG dùng `new URL(...).pathname`: trên Windows nó trả '/D:/...' với dấu '/'
    // thừa ở đầu, và fs không mở được đường dẫn đó.
    process.loadEnvFile('../../.env.dev');
  } catch {
    // Không có .env.dev là bình thường (CI, container). Lỗi thật sẽ hiện ở kiểm tra dưới.
  }
}

const migrationUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    'Thiếu MIGRATION_DATABASE_URL. Migration phải dùng role migration riêng và nối ' +
      'trực tiếp PostgreSQL (không qua Supavisor). Xem .env.example.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/**/schema.ts',
  out: './drizzle/migrations',
  dbCredentials: { url: migrationUrl },
  schemaFilter: ['control_plane'],
  strict: true,
  verbose: true,
});
