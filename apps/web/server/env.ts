import { z } from 'zod';

/**
 * Env của riêng `apps/web`, chỉ đọc trên server.
 *
 * Không biến nào có tiền tố `NEXT_PUBLIC_` — đó là điều kiện để bundler của Next
 * không thể inline giá trị vào client bundle. Nhờ vậy client secret của BFF và
 * cấu hình M2M không bao giờ rời khỏi process server (modular.md mục 10.1).
 *
 * Mọi biến đều `optional` ở P1: DEC-B03 (Auth0 tenant/issuer/audience) còn `open`,
 * và P1 chỉ tạo config boundary + biến env rỗng, không wiring Auth0 thật.
 * Khi P2 wiring thật, các biến bắt buộc chuyển sang required và fail fast tại đây.
 */
const serverEnvSchema = z.object({
  CONTROL_PLANE_BASE_URL: z.url().optional(),
  AUTH0_DOMAIN: z.string().min(1).optional(),
  AUTH0_CLIENT_ID: z.string().min(1).optional(),
  AUTH0_CLIENT_SECRET: z.string().min(1).optional(),
  AUTH0_AUDIENCE: z.string().min(1).optional(),
  AUTH0_SECRET: z.string().min(1).optional(),
  APP_BASE_URL: z.url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

/** Parse lười: chỉ chạy khi một boundary server thật sự cần env. */
export function readServerEnv(): ServerEnv {
  if (cachedEnv === undefined) {
    cachedEnv = serverEnvSchema.parse(process.env);
  }
  return cachedEnv;
}
