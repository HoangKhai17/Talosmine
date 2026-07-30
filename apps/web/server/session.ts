import type { NextResponse } from 'next/server';
import { requireOidcConfig } from './env';
import { CSRF_COOKIE, SESSION_COOKIE } from './oidc';

/**
 * Phiên của Talosmine — KHÔNG phải phiên của IdP.
 *
 * Control Plane phát session token và lưu bản băm SHA-256 trong `web_sessions`. BFF chỉ
 * giữ token thô trong cookie `HttpOnly`; browser không bao giờ đọc được nó.
 */

export interface ControlPlaneSession {
  sessionToken: string;
  csrfToken: string;
  expiresAt: string;
  accountId: string;
  created: boolean;
}

/**
 * Đổi `id_token` lấy phiên nội bộ.
 *
 * Ta gửi NGUYÊN id_token chứ không gửi `issuer`/`subject` đã tự parse: Control Plane phải
 * tự verify chữ ký. Nếu nó tin claim do BFF khai, bất cứ ai gọi được endpoint đó đều có
 * thể mạo danh người khác.
 *
 * Gọi thẳng bằng `fetch`, không qua `callControlPlane`: lời gọi này xảy ra TRƯỚC khi có
 * phiên, nên không có `sessionToken` để gắn — nhưng vẫn phải gắn `x-correlation-id` (B3)
 * để nối được với log "callback outcome" ở `auth/callback/route.ts` và với log phía Control
 * Plane (`AuthController.exchange`) cho cùng một lượt đăng nhập.
 */
export async function exchangeIdTokenForSession(
  idToken: string,
  correlationId: string,
): Promise<ControlPlaneSession> {
  const cfg = requireOidcConfig();

  const response = await fetch(new URL('/v1/auth/sessions', cfg.controlPlaneBaseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-correlation-id': correlationId },
    body: JSON.stringify({ idToken }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Control Plane từ chối tạo phiên (HTTP ${response.status}): ${detail}`);
  }

  return (await response.json()) as ControlPlaneSession;
}

/**
 * Đặt cặp cookie phiên.
 *
 * Hai cookie CỐ Ý khác nhau về `httpOnly`:
 *   - session token: `httpOnly` — JavaScript không đọc được, nên XSS không lấy được phiên.
 *   - csrf token: đọc được — client phải gắn nó vào header cho request ghi dữ liệu.
 * Đây là mẫu double-submit cookie: kẻ tấn công cross-site gửi được cookie nhưng không
 * đọc được nó để điền vào header.
 *
 * Tiền tố `__Host-` buộc cookie phải Secure, path `/`, và KHÔNG có Domain — nghĩa là
 * subdomain không ghi đè được. Trình duyệt coi `localhost` là ngữ cảnh bảo mật nên cờ
 * `secure` vẫn hoạt động khi dev qua http://localhost.
 */
export function setSessionCookies(response: NextResponse, session: ControlPlaneSession): void {
  const expires = new Date(session.expiresAt);

  response.cookies.set(SESSION_COOKIE, session.sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires,
  });

  response.cookies.set(CSRF_COOKIE, session.csrfToken, {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(CSRF_COOKIE);
}

/** Đọc một cookie theo tên từ header cookie thô. */
function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

/** Đọc session token từ header cookie của request (dùng ở BFF proxy và server component). */
export function readSessionToken(cookieHeader: string | null): string | undefined {
  return readCookie(cookieHeader, SESSION_COOKIE);
}

/**
 * Kiểm CSRF theo mẫu double-submit cookie.
 *
 * CƠ CHẾ: client đọc cookie CSRF (cookie này CỐ Ý không HttpOnly) rồi gửi lại giá trị đó
 * trong header `x-csrf-token`. Ta so hai bên.
 *
 * VÌ SAO CHẶN ĐƯỢC CSRF: trang của kẻ tấn công có thể khiến trình duyệt gửi request kèm
 * cookie — trình duyệt tự đính cookie theo domain. Nhưng nó KHÔNG đọc được cookie của ta
 * (chính sách same-origin) nên không điền được header, và form HTML thuần cũng không đặt
 * được header tùy ý. Thiếu một trong hai vế là request bị từ chối.
 *
 * ĐÂY LÀ LỚP THỨ NHẤT. Control Plane còn đối chiếu token với hash trong database — nếu
 * chỉ chặn ở đây, mọi đường chạm thẳng Control Plane sẽ bỏ qua toàn bộ bảo vệ.
 */
export function csrfTokenFromRequest(request: Request): { ok: boolean; token?: string } {
  const cookieValue = readCookie(request.headers.get('cookie'), CSRF_COOKIE);
  const headerValue = request.headers.get('x-csrf-token');

  if (!cookieValue || !headerValue || cookieValue !== headerValue) {
    return { ok: false };
  }
  return { ok: true, token: headerValue };
}
