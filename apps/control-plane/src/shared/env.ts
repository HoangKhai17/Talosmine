import { z } from 'zod';

/**
 * Env contract của Control Plane.
 *
 * Nguyên tắc (phase-1 mục 9): thiếu biến bắt buộc thì process FAIL FAST lúc khởi động.
 * Không chạy với default ngầm — một service chạy được nhưng cấu hình sai còn nguy hiểm
 * hơn một service không chạy, vì nó vỡ ra muộn và ở chỗ khó tìm.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_HOST: z.string().min(1).default('0.0.0.0'),

  /**
   * Runtime connection — BẮT BUỘC đi qua Supavisor (DEC-T09).
   * Driver postgres.js phải đặt `prepare: false` vì Supavisor chạy transaction pooling:
   * connection bị trả về pool giữa các statement nên prepared statement có tên sẽ vỡ.
   * Xem src/shared/database.ts.
   */
  DATABASE_URL: z.string().url(),

  /**
   * Migration connection — nối TRỰC TIẾP PostgreSQL, KHÔNG qua Supavisor, bằng role
   * migration riêng có quyền DDL. Runtime role không được có CREATE/ALTER/DROP.
   * Chỉ drizzle-kit dùng biến này; API/worker không đọc nó.
   */
  MIGRATION_DATABASE_URL: z.string().url().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * Auth0 — P1 chỉ tạo boundary, CHƯA wiring (DEC-B03 chưa chốt tenant thật).
   * Để optional ở P1; P2 sẽ chuyển thành bắt buộc khi login thật được bật.
   */
  AUTH0_ISSUER_URL: z.string().url().optional(),
  AUTH0_AUDIENCE: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    // In ra tên biến sai và lý do — nhưng KHÔNG in giá trị, vì chúng có thể là secret.
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');

    throw new Error(
      `Cấu hình môi trường không hợp lệ. Process dừng thay vì chạy với cấu hình sai.\n${issues}\n` +
        `Xem .env.example để biết các biến bắt buộc.`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Chỉ dùng trong test để reset state giữa các case. */
export function resetEnvCache(): void {
  cached = undefined;
}
