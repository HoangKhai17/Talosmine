import { NextResponse } from 'next/server';
import * as client from 'openid-client';
import { localeHref, negotiateLocale } from '../../../i18n/locale';
import { requireOidcConfig } from '../../../server/env';
import { logError, logInfo } from '../../../server/logger';
import {
  getOidcConfiguration,
  safeReturnTo,
  TRANSACTION_COOKIE,
  type Transaction,
} from '../../../server/oidc';
import { readOnboarding } from '../../../server/onboarding';
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
  // Một correlation ID cho TOÀN BỘ lượt callback này — B3 (`pending-work.md`): nối log
  // "callback outcome" ở đây với audit event phía Control Plane (đọc lại đúng ID này qua
  // header `x-correlation-id` mà `exchangeIdTokenForSession` gắn vào).
  const correlationId = crypto.randomUUID();

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
    logError('auth.callback.token_exchange_failed', {
      correlationId,
      message: error instanceof Error ? error.message : String(error),
    });
    return failure(cfg.appBaseUrl, 'Không hoàn tất được đăng nhập. Vui lòng thử lại.');
  }

  let session: Awaited<ReturnType<typeof exchangeIdTokenForSession>>;
  try {
    session = await exchangeIdTokenForSession(idToken, correlationId);
  } catch (error) {
    logError('auth.callback.session_exchange_failed', {
      correlationId,
      message: error instanceof Error ? error.message : String(error),
    });
    return failure(cfg.appBaseUrl, 'Không tạo được phiên đăng nhập. Vui lòng thử lại.');
  }

  logInfo('auth.callback.success', {
    correlationId,
    accountId: session.accountId,
    created: session.created,
  });

  const target = await resolveDestination(request, session, transaction, cfg.appBaseUrl);

  const response = NextResponse.redirect(new URL(target, cfg.appBaseUrl).toString(), {
    headers: { 'Cache-Control': 'no-store' },
  });

  // Transaction cookie đã dùng xong — xoá ngay để code_verifier không nằm lại trên máy.
  response.cookies.delete(TRANSACTION_COOKIE);
  setSessionCookies(response, session);

  return response;
}

/**
 * Đích sau khi đăng nhập: khảo sát onboarding, hoặc nơi người dùng định tới.
 *
 * VÌ SAO HỎI CONTROL PLANE thay vì chỉ dựa vào cờ `session.created`: `created` chỉ đúng ở
 * lần đăng nhập ĐẦU TIÊN. Ai đóng tab giữa chừng sẽ không bao giờ được hỏi lại — và đó là
 * trường hợp phổ biến, không phải ngoại lệ. Một lời gọi thêm mỗi lần ĐĂNG NHẬP (không phải
 * mỗi trang) là cái giá chấp nhận được để không mất dữ liệu.
 *
 * Người đã trả lời hoặc đã bỏ qua thì `required` là `false` và đường đi không đổi.
 *
 * FAIL-OPEN: `readOnboarding` nuốt mọi lỗi và trả `required: false`. Khảo sát là màn hình
 * thu thập dữ liệu tuỳ chọn — chặn đường đăng nhập vì nó không đọc được là đổi một lỗi nhỏ
 * lấy một sự cố lớn.
 */
async function resolveDestination(
  request: Request,
  session: { sessionToken: string },
  transaction: Transaction,
  appBaseUrl: string,
): Promise<string> {
  const returnTo = safeReturnTo(transaction.returnTo, appBaseUrl);

  // Cùng thứ tự ưu tiên với proxy (DEC-T25): cookie → Accept-Language → mặc định. Dùng lại
  // hàm chung để hai chỗ không lệch luật.
  const locale = negotiateLocale({
    cookieHeader: request.headers.get('cookie'),
    acceptLanguage: request.headers.get('accept-language'),
  });

  const survey = await readOnboarding(session.sessionToken, locale);
  if (!survey.required) return returnTo;

  // Giữ `returnTo` để sau khi xong khảo sát người dùng về đúng chỗ họ định tới. `safeReturnTo`
  // đã chuẩn hoá nó về đường dẫn nội bộ nên ghép vào query là an toàn.
  const onboarding = new URL(localeHref(locale, '/onboarding'), appBaseUrl);
  if (returnTo !== '/') onboarding.searchParams.set('returnTo', returnTo);

  return onboarding.pathname + onboarding.search;
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
