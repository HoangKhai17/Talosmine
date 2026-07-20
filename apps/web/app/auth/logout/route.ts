import { NextResponse } from 'next/server';
import { requireOidcConfig } from '../../../server/env';
import {
  clearSessionCookies,
  csrfTokenFromRequest,
  readSessionToken,
} from '../../../server/session';

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

  // Đăng xuất là mutation nên vẫn phải qua CSRF. Nghe có vẻ thừa vì "đăng xuất thì hại
  // gì" — nhưng ép người khác đăng xuất liên tục là một dạng quấy rối, và nó che giấu
  // được các hành vi khác.
  const csrf = csrfTokenFromRequest(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { code: 'CSRF_INVALID', message: 'Yêu cầu không hợp lệ. Vui lòng tải lại trang.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const token = readSessionToken(request.headers.get('cookie'));

  if (token) {
    try {
      await fetch(new URL('/v1/auth/sessions/current', cfg.controlPlaneBaseUrl), {
        method: 'DELETE',
        headers: {
          'x-session-token': token,
          ...(csrf.token ? { 'x-csrf-token': csrf.token } : {}),
        },
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
