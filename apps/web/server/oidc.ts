import * as client from 'openid-client';
import { type OidcConfig, requireOidcConfig } from './env';

/**
 * Luồng OIDC phía BFF (DEC-T22).
 *
 * VÌ SAO KHÔNG dùng SDK sẵn có của IdP: SDK quản lý session BẰNG COOKIE CỦA NÓ. Chúng ta
 * đã có bảng `web_sessions` ở Control Plane với thu hồi, liệt kê thiết bị và audit. Dùng
 * cả hai sẽ tạo hai hệ thống phiên song song — trang "phiên của tôi" và nút thu hồi của
 * admin sẽ không nhìn thấy phiên do SDK tạo, tức là toàn bộ hạ tầng phiên thành vô dụng.
 *
 * Vì vậy OIDC ở đây chỉ làm ĐÚNG MỘT VIỆC: chứng minh "bạn là ai". Ngay sau khi có
 * `id_token`, ta đổi nó lấy phiên của chính mình và quên IdP đi.
 *
 * Luồng: /auth/login → IdP → /auth/callback → đổi code lấy id_token →
 *        POST /v1/auth/sessions (Control Plane tự verify chữ ký) → cookie phiên của TA.
 */

/** Cookie giữ state/nonce/code_verifier giữa hai chặng redirect. Sống ngắn, xoá ở callback. */
export const TRANSACTION_COOKIE = '__Host-talos_tx';
/** Cookie phiên — giá trị là session token do Control Plane phát. */
export const SESSION_COOKIE = '__Host-talos_session';
/** CSRF token đi kèm phiên. KHÔNG HttpOnly: client phải đọc được để gắn vào header. */
export const CSRF_COOKIE = '__Host-talos_csrf';

export const SCOPE = 'openid profile email offline_access';

let configPromise: Promise<client.Configuration> | undefined;
let configuredIssuer: string | undefined;

/**
 * OIDC discovery, cache theo issuer.
 *
 * Discovery là một request mạng tới IdP; cache lại để mỗi lần đăng nhập không phải gọi
 * thêm. Cache bị bỏ nếu issuer đổi (đổi provider lúc dev) để không dùng metadata cũ.
 */
export async function getOidcConfiguration(): Promise<client.Configuration> {
  const cfg = requireOidcConfig();

  if (configPromise && configuredIssuer === cfg.issuerUrl) {
    return configPromise;
  }

  configuredIssuer = cfg.issuerUrl;
  configPromise = discover(cfg);
  return configPromise;
}

async function discover(cfg: OidcConfig): Promise<client.Configuration> {
  const issuer = new URL(cfg.issuerUrl);

  // openid-client v6 CHẶN HTTP theo mặc định — đúng, vì token đi qua đường truyền này.
  // Chỉ mở ngoại lệ cho loopback lúc dev (Logto self-host chạy http://localhost:3001).
  // Điều kiện là hostname loopback, KHÔNG phải `NODE_ENV`: một .env production trỏ nhầm
  // sang http của host khác vẫn phải bị chặn.
  const isLoopback = issuer.hostname === 'localhost' || issuer.hostname === '127.0.0.1';
  const execute =
    issuer.protocol === 'http:' && isLoopback ? [client.allowInsecureRequests] : undefined;

  return client.discovery(
    issuer,
    cfg.clientId,
    cfg.clientSecret,
    // Traditional Web App trong Logto = client_secret_basic.
    client.ClientSecretBasic(cfg.clientSecret),
    execute ? { execute } : undefined,
  );
}

export function redirectUri(cfg: OidcConfig): string {
  return new URL('/auth/callback', cfg.appBaseUrl).toString();
}

export interface Transaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** Đường dẫn nội bộ để quay lại sau khi đăng nhập xong. */
  returnTo: string;
}

/**
 * `returnTo` đến từ query string, tức là từ người dùng. Chỉ chấp nhận đường dẫn nội bộ
 * bắt đầu bằng một dấu `/` — nếu không, kẻ tấn công gửi link `?returnTo=https://evil`
 * và biến trang đăng nhập của ta thành open redirect.
 *
 * `//evil.com` cũng bị loại: trình duyệt hiểu nó là protocol-relative URL ra ngoài.
 */
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
