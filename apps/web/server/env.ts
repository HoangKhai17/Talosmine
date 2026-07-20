import { z } from 'zod';

/**
 * Env của riêng `apps/web`, chỉ đọc trên server.
 *
 * Không biến nào có tiền tố `NEXT_PUBLIC_` — đó là điều kiện để bundler của Next
 * không thể inline giá trị vào client bundle. Nhờ vậy client secret của BFF và
 * cấu hình M2M không bao giờ rời khỏi process server (modular.md mục 10.1).
 *
 * Tên biến TRUNG TÍNH (`OIDC_*`, không phải `LOGTO_*`) theo DEC-T22: BFF chỉ nói chuyện
 * bằng chuẩn OIDC. Đổi identity provider = đổi giá trị biến, không sửa code.
 *
 * Vẫn `optional`: trang public phải render được kể cả khi IdP chưa cấu hình. Route nào
 * cần thì gọi `requireOidcConfig()` và fail với thông điệp chỉ rõ biến nào thiếu.
 */
const serverEnvSchema = z.object({
  CONTROL_PLANE_BASE_URL: z.url().optional(),

  /** Issuer của IdP, ví dụ http://localhost:3001/oidc — dùng cho OIDC discovery. */
  OIDC_ISSUER_URL: z.url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  /** Chỉ tồn tại phía server. Lộ ra client là mất toàn bộ bảo đảm của luồng Authorization Code. */
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),

  /** Base URL của chính app này — dùng dựng redirect_uri. */
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

export interface OidcConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  appBaseUrl: string;
  controlPlaneBaseUrl: string;
}

/**
 * Env bắt buộc cho luồng đăng nhập. Tách khỏi `readServerEnv` để phần còn lại của app
 * không bị chết chỉ vì chưa cấu hình IdP.
 *
 * Báo TÊN biến thiếu, KHÔNG báo giá trị — client secret không được lọt vào log.
 */
export function requireOidcConfig(): OidcConfig {
  const env = readServerEnv();

  const missing: string[] = [];
  if (!env.OIDC_ISSUER_URL) missing.push('OIDC_ISSUER_URL');
  if (!env.OIDC_CLIENT_ID) missing.push('OIDC_CLIENT_ID');
  if (!env.OIDC_CLIENT_SECRET) missing.push('OIDC_CLIENT_SECRET');
  if (!env.APP_BASE_URL) missing.push('APP_BASE_URL');
  if (!env.CONTROL_PLANE_BASE_URL) missing.push('CONTROL_PLANE_BASE_URL');

  if (missing.length > 0) {
    throw new Error(
      `Chưa cấu hình đăng nhập. Thiếu biến môi trường: ${missing.join(', ')}. Xem .env.example.`,
    );
  }

  return {
    issuerUrl: env.OIDC_ISSUER_URL as string,
    clientId: env.OIDC_CLIENT_ID as string,
    clientSecret: env.OIDC_CLIENT_SECRET as string,
    appBaseUrl: env.APP_BASE_URL as string,
    controlPlaneBaseUrl: env.CONTROL_PLANE_BASE_URL as string,
  };
}

/** Cho test reset giữa các case. */
export function resetServerEnvCache(): void {
  cachedEnv = undefined;
}
