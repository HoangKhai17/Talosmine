import { NextResponse } from 'next/server';
import * as client from 'openid-client';
import { requireOidcConfig } from '../../../server/env';
import {
  getOidcConfiguration,
  safeReturnTo,
  TRANSACTION_COOKIE,
  type Transaction,
} from '../../../server/oidc';
import { exchangeIdTokenForSession, setSessionCookies } from '../../../server/session';

/**
 * Chặng 2 của đăng nhập: IdP redirect về đây kèm authorization code.
 *
 * Sau chặng này ta KHÔNG giữ token của IdP. `id_token` chỉ dùng một lần để đổi lấy phiên
 * của hệ thống mình rồi bỏ — phiên thật nằm ở `web_sessions` của Control Plane, nơi có
 * thu hồi và audit.
 */
export async function GET(request: Request): Promise<Response> {
  const cfg = requireOidcConfig();

  const raw = getCookie(request, TRANSACTION_COOKIE);
  if (!raw) {
    return failure(cfg.appBaseUrl, 'Phiên đăng nhập đã hết hạn. Vui lòng thử lại.');
  }

  let transaction: Transaction;
  try {
    transaction = JSON.parse(raw) as Transaction;
  } catch {
    return failure(cfg.appBaseUrl, 'Dữ liệu phiên đăng nhập không đọc được. Vui lòng thử lại.');
  }

  let idToken: string;
  try {
    const configuration = await getOidcConfiguration();

    // `authorizationCodeGrant` tự kiểm state, nonce và PKCE. Sai bất kỳ cái nào là ném lỗi —
    // ta KHÔNG tự so sánh bằng tay để tránh viết sai một phép so sánh bảo mật.
    const tokens = await client.authorizationCodeGrant(configuration, new URL(request.url), {
      pkceCodeVerifier: transaction.codeVerifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
    });

    if (!tokens.id_token) {
      throw new Error('IdP không trả id_token; kiểm tra scope `openid`.');
    }
    idToken = tokens.id_token;
  } catch (error) {
    console.error('[auth/callback] đổi code thất bại:', error);
    return failure(cfg.appBaseUrl, 'Không hoàn tất được đăng nhập. Vui lòng thử lại.');
  }

  let session: Awaited<ReturnType<typeof exchangeIdTokenForSession>>;
  try {
    session = await exchangeIdTokenForSession(idToken);
  } catch (error) {
    console.error('[auth/callback] đổi phiên thất bại:', error);
    return failure(cfg.appBaseUrl, 'Không tạo được phiên đăng nhập. Vui lòng thử lại.');
  }

  const response = NextResponse.redirect(
    new URL(safeReturnTo(transaction.returnTo), cfg.appBaseUrl).toString(),
    { headers: { 'Cache-Control': 'no-store' } },
  );

  // Transaction cookie đã dùng xong — xoá ngay để code_verifier không nằm lại trên máy.
  response.cookies.delete(TRANSACTION_COOKIE);
  setSessionCookies(response, session);

  return response;
}

function getCookie(request: Request, name: string): string | undefined {
  // Route handler nhận `Request` chuẩn; đọc cookie qua NextRequest sẽ buộc đổi chữ ký hàm,
  // nên parse trực tiếp cho gọn.
  const header = request.headers.get('cookie');
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

/**
 * Lỗi đăng nhập trả về trang /auth kèm lý do CHUNG.
 *
 * Không đưa chi tiết kỹ thuật lên URL: nó lộ ra trong lịch sử trình duyệt, referrer và
 * log proxy. Chi tiết đã nằm ở log server phía trên.
 */
function failure(baseUrl: string, message: string): Response {
  const url = new URL('/auth', baseUrl);
  url.searchParams.set('error', message);

  const response = NextResponse.redirect(url.toString(), {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  });
  // Transaction hỏng thì không giữ lại — lần thử sau phải sinh state/verifier mới.
  response.cookies.delete(TRANSACTION_COOKIE);
  return response;
}
