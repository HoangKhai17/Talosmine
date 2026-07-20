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
 */
export async function exchangeIdTokenForSession(idToken: string): Promise<ControlPlaneSession> {
  const cfg = requireOidcConfig();

  const response = await fetch(new URL('/v1/auth/sessions', cfg.controlPlaneBaseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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

/** Đọc session token từ header cookie của request (dùng ở BFF proxy và server component). */
export function readSessionToken(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}
