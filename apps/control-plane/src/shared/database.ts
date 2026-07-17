import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

/**
 * Kết nối runtime tới PostgreSQL QUA Supavisor (DEC-T09).
 *
 * `prepare: false` là RÀNG BUỘC BẮT BUỘC, không phải tuỳ chọn tuning:
 * Supavisor chạy ở transaction pooling mode, nên connection bị trả về pool giữa các
 * statement. Prepared statement có tên sống trên session sẽ không còn ở đó lần sau
 * → lỗi ngẫu nhiên, khó tái hiện, chỉ xuất hiện khi có tải.
 *
 * Hệ quả kéo theo (docs/modular.md mục 9.4) — cấm mọi thứ phụ thuộc session state:
 *   - session-level advisory lock  -> dùng row lock trong một transaction
 *   - temp table                   -> không dùng
 *   - `SET` ngoài transaction      -> dùng `SET LOCAL` trong transaction
 *
 * Toàn bộ hard quota ở P5 đứng trên giả định này. Spike P1.5 phải chứng minh
 * transaction pinning hoạt động TRƯỚC khi P5 được build.
 */
export function createDatabaseClient(databaseUrl: string) {
  const sql = postgres(databaseUrl, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return { sql, db: drizzle(sql) };
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
