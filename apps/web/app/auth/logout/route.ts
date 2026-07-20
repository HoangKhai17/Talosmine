import { NextResponse } from 'next/server';
import { requireOidcConfig } from '../../../server/env';
import { clearSessionCookies, readSessionToken } from '../../../server/session';

/**
 * Đăng xuất.
 *
 * Thứ tự có chủ đích: thu hồi phiên ở Control Plane TRƯỚC, xoá cookie SAU. Nếu xoá cookie
 * trước rồi mạng lỗi, phiên vẫn sống trong DB và ai có token vẫn dùng được — người dùng
 * thì tưởng đã thoát.
 *
 * Nếu thu hồi thất bại, ta VẪN xoá cookie: trình duyệt này mất quyền truy cập ngay. Phiên
 * còn sót lại vẫn hết hạn theo TTL và người dùng có thể thu hồi tay ở trang phiên.
 *
 * Dùng POST chứ không GET: một request GET có thể bị kích hoạt bằng thẻ `<img>` trên
 * trang khác, biến thành đăng xuất cưỡng bức.
 */
export async function POST(request: Request): Promise<Response> {
  const cfg = requireOidcConfig();
  const token = readSessionToken(request.headers.get('cookie'));

  if (token) {
    try {
      await fetch(new URL('/v1/auth/sessions/current', cfg.controlPlaneBaseUrl), {
        method: 'DELETE',
        headers: { 'x-session-token': token },
        cache: 'no-store',
      });
    } catch (error) {
      console.error('[auth/logout] thu hồi phiên thất bại:', error);
    }
  }

  const response = NextResponse.redirect(new URL('/', cfg.appBaseUrl).toString(), {
    status: 303, // 303 để trình duyệt đổi POST thành GET khi đi tới trang chủ.
    headers: { 'Cache-Control': 'no-store' },
  });
  clearSessionCookies(response);
  return response;
}
