import { NextResponse } from 'next/server';
import { requireOidcConfig } from '../../../server/env';
import { endSessionUrl } from '../../../server/oidc';
import {
  clearSessionCookies,
  csrfTokenFromRequest,
  readSessionToken,
} from '../../../server/session';

/**
 * Đăng xuất — khỏi Talosmine VÀ khỏi IdP.
 *
 * BA BƯỚC, thứ tự có chủ đích:
 *
 *   1. Thu hồi phiên ở Control Plane. Làm trước vì đây là thứ duy nhất thật sự chấm dứt
 *      quyền truy cập; xoá cookie trước rồi mạng lỗi sẽ để phiên sống tiếp trong DB trong
 *      khi người dùng tưởng đã thoát.
 *   2. Xoá cookie phiên của trình duyệt này.
 *   3. Trả về URL kết thúc phiên IdP để client ĐIỀU HƯỚNG tới.
 *
 * VÌ SAO BƯỚC 3 TỒN TẠI: trước đây đăng xuất chỉ làm bước 1–2, nên phiên của Logto (14 ngày)
 * vẫn sống. Người dùng bấm "Đăng xuất" rồi bấm "Đăng nhập" là vào thẳng tài khoản cũ, không
 * cần mật khẩu — trên máy dùng chung thì đó là lỗ hổng, không phải bất tiện.
 *
 * VÌ SAO TRẢ JSON CHỨ KHÔNG REDIRECT 303: nút đăng xuất gọi bằng `fetch` (để gắn được header
 * CSRF — form HTML không đặt được header). Nếu route trả 303 sang Logto, `fetch` sẽ ĐI THEO
 * redirect đó và biến thành request xuyên origin — vừa vi phạm `connect-src 'self'`, vừa vô
 * ích vì `fetch` không chạy JavaScript nên trang tự-submit của Logto không bao giờ chạy.
 * Trả URL để client tự `window.location` là điều hướng cấp cao nhất, đúng thứ luồng này cần.
 *
 * Dùng POST chứ không GET: một request GET có thể bị kích hoạt bằng thẻ `<img>` trên trang
 * khác, biến thành đăng xuất cưỡng bức.
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
      // Thu hồi thất bại thì VẪN đi tiếp: trình duyệt này mất quyền truy cập ngay khi cookie
      // bị xoá. Phiên còn sót vẫn hết hạn theo TTL và người dùng thu hồi tay được ở trang phiên.
      console.error('[auth/logout] thu hồi phiên thất bại:', error);
    }
  }

  // IdP không hỗ trợ kết thúc phiên → về trang chủ. Đăng xuất khỏi Talosmine vẫn đã xong.
  const next = (await endSessionUrl()) ?? cfg.appBaseUrl;

  const response = NextResponse.json({ next }, { headers: { 'Cache-Control': 'no-store' } });
  clearSessionCookies(response);
  return response;
}
