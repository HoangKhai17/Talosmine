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

/**
 * Dựng URL kết thúc phiên ở IdP (RP-Initiated Logout).
 *
 * VÌ SAO KHÔNG DÙNG `id_token_hint`: spec cho phép thay bằng `client_id`, và Logto chấp nhận.
 * Dùng `client_id` giữ được nguyên tắc đã ghi ở `/auth/callback` — **không giữ token của
 * IdP**. Đi đường `id_token_hint` sẽ buộc phải lưu `id_token` suốt vòng đời phiên, tức là
 * thêm một bản sao claim của người dùng nằm trên đĩa hoặc trong cookie mà không đổi lại
 * được gì.
 *
 * `postLogoutRedirectUri` phải KHỚP CHÍNH XÁC giá trị đã đăng ký trong Logto
 * (Applications → Talosmine Hub → Post sign-out redirect URIs). Thừa một dấu `/` ở cuối là
 * bị từ chối — vì vậy hàm này truyền thẳng `appBaseUrl`, không ghép thêm path.
 *
 * Hàm THUẦN, tách khỏi discovery để test được mà không chạm mạng.
 */
export function buildEndSessionUrl(input: {
  endSessionEndpoint: string;
  clientId: string;
  postLogoutRedirectUri: string;
}): string {
  const url = new URL(input.endSessionEndpoint);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('post_logout_redirect_uri', input.postLogoutRedirectUri);
  return url.toString();
}

/**
 * URL kết thúc phiên IdP cho cấu hình hiện tại, hoặc `null` nếu IdP không hỗ trợ.
 *
 * Trả `null` thay vì ném lỗi: đăng xuất khỏi Talosmine phải thành công kể cả khi IdP không
 * có `end_session_endpoint`. Một IdP thiếu tính năng không được biến nút đăng xuất thành nút
 * báo lỗi.
 */
export async function endSessionUrl(): Promise<string | null> {
  const cfg = requireOidcConfig();

  try {
    const configuration = await getOidcConfiguration();
    const endpoint = configuration.serverMetadata().end_session_endpoint;
    if (!endpoint) return null;

    return buildEndSessionUrl({
      endSessionEndpoint: endpoint,
      clientId: cfg.clientId,
      postLogoutRedirectUri: cfg.appBaseUrl,
    });
  } catch (error) {
    console.error('[auth/logout] không đọc được end_session_endpoint:', error);
    return null;
  }
}

export interface Transaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** Đường dẫn nội bộ để quay lại sau khi đăng nhập xong. */
  returnTo: string;
}

/**
 * `returnTo` đến từ query string, tức là từ người dùng. Chỉ chấp nhận đường dẫn NỘI BỘ —
 * nếu không, kẻ tấn công gửi link `?returnTo=…` và biến trang đăng nhập của ta thành open
 * redirect: người dùng đăng nhập thật vào Talosmine rồi bị bắn sang trang giả mạo.
 *
 * ⚠ CHỈ SO CHUỖI LÀ KHÔNG ĐỦ — đã có lỗ hổng thật ở bản trước (rà soát 2026-07-23).
 * Bản cũ chặn `//evil.com` bằng `startsWith('//')`, nhưng bộ phân giải URL của trình duyệt
 * (và của `new URL` mà callback dùng để redirect) XOÁ tab/newline (`\t \n \r`) và ĐỔI `\`
 * thành `/` TRƯỚC khi phân giải. Nên các payload này lọt qua kiểm chuỗi rồi lại thành origin
 * NGOÀI:
 *
 *     returnTo=/%09/evil.com   → lưu "/\t/evil.com" → new URL xoá tab → "//evil.com" → evil.com
 *     returnTo=/\evil.com      → "\" thành "/"      → "//evil.com" → evil.com
 *
 * Vì vậy phải hỏi ĐÚNG cái parser sẽ dùng để redirect: dựng URL tương đối với `baseUrl` rồi
 * so `origin`. Khác origin → vứt về `/`. Cách này chống được cả những ký tự lạ ta chưa nghĩ
 * tới, vì nó không đoán mà giao cho chính parser đó quyết định.
 *
 * Trả về đường dẫn ĐÃ CHUẨN HOÁ (không kèm origin) để nơi gọi ghép lại an toàn.
 */
export function safeReturnTo(value: string | null, baseUrl: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';

  let resolved: URL;
  try {
    resolved = new URL(value, baseUrl);
  } catch {
    return '/';
  }

  if (resolved.origin !== new URL(baseUrl).origin) return '/';
  return resolved.pathname + resolved.search + resolved.hash;
}
