import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Test âm cho chặng 2 của đăng nhập — B1 phần 2 của pending-work.md.
 *
 * PHẠM VI, và vì sao nó khác hẳn `oidc-verifier.test.ts`:
 *
 * `state`/`nonce`/`code_verifier` (PKCE) KHÔNG được TỰ so sánh trong code của ta —
 * `client.authorizationCodeGrant()` của `openid-client` làm việc đó (xem comment ở
 * `callback/route.ts`: "ta KHÔNG tự so sánh bằng tay để tránh viết sai một phép so sánh bảo
 * mật"). Re-test đúng-sai của phép so sánh đó là re-test thư viện ngoài — không phải việc
 * của ta, và `openid-client` đã có bộ test riêng cho việc đó.
 *
 * VIỆC CỦA TA LÀ KHÁC: khi thư viện từ chối (bất kể vì state sai, nonce sai, PKCE thất bại,
 * hay mã đã bị dùng — TỨC REPLAY), route có xử lý AN TOÀN không?
 *   1. Redirect về `/auth` với thông điệp CHUNG, không lộ chi tiết lỗi ra URL.
 *   2. Xoá `TRANSACTION_COOKIE` — không giữ `code_verifier` lại trên máy sau một lần hỏng.
 *   3. KHÔNG tạo phiên (`SESSION_COOKIE`/`CSRF_COOKIE` không được set).
 * Bốn tình huống (state/nonce/PKCE/replay) đều đi qua CÙNG một đường ném lỗi trong route,
 * nên test dưới đây chứng minh route xử lý THỐNG NHẤT cho cả bốn — không phải bốn cơ chế
 * phòng thủ tách biệt.
 *
 * MOCK Ở ĐÂY KHÔNG PHẠM nguyên tắc "không mock" của dự án (DEC-T05): nguyên tắc đó áp cho
 * DATABASE và LOGIC NGHIỆP VỤ của chính ta. `openid-client` và `getOidcConfiguration` (lớp
 * discovery mạng) là BIÊN NGOÀI — giả chúng để cô lập đúng thứ ta đang kiểm: cách ROUTE của
 * ta phản ứng, không phải liệu một IdP thật có tồn tại hay không.
 *
 * NGOÀI PHẠM VI: đường THÀNH CÔNG (đổi code lấy token thật rồi tạo phiên) cần
 * `exchangeIdTokenForSession` gọi thật ra Control Plane — đó là việc của B2/integration, có
 * DB thật, không phải unit test cô lập như file này.
 */

vi.mock('openid-client', async () => {
  const actual = await vi.importActual<typeof import('openid-client')>('openid-client');
  return { ...actual, authorizationCodeGrant: vi.fn() };
});

vi.mock('../../apps/web/server/oidc', async () => {
  const actual = await vi.importActual<typeof import('../../apps/web/server/oidc')>(
    '../../apps/web/server/oidc',
  );
  return { ...actual, getOidcConfiguration: vi.fn() };
});

import * as client from 'openid-client';
import { GET } from '../../apps/web/app/auth/callback/route';
import { resetServerEnvCache } from '../../apps/web/server/env';
import {
  getOidcConfiguration,
  TRANSACTION_COOKIE,
  type Transaction,
} from '../../apps/web/server/oidc';

const authorizationCodeGrant = vi.mocked(client.authorizationCodeGrant);
const mockedGetOidcConfiguration = vi.mocked(getOidcConfiguration);

const APP_BASE_URL = 'http://localhost:3000';
const CALLBACK_URL = `${APP_BASE_URL}/auth/callback?code=abc123&state=xyz`;

const VALID_TRANSACTION: Transaction = {
  state: 'xyz',
  nonce: 'nonce-thật',
  codeVerifier: 'verifier-thật',
  returnTo: '/tools',
};

function requestWith(transaction: Transaction | null, rawCookie?: string): Request {
  const cookie =
    rawCookie ??
    (transaction
      ? `${TRANSACTION_COOKIE}=${encodeURIComponent(JSON.stringify(transaction))}`
      : undefined);

  return new Request(CALLBACK_URL, {
    headers: cookie ? { cookie } : {},
  });
}

/** Đọc mọi header `Set-Cookie` — `Headers` gộp chúng, phải dùng `getSetCookie()`. */
function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

describe('GET /auth/callback — xử lý khi openid-client từ chối', () => {
  beforeEach(() => {
    process.env.OIDC_ISSUER_URL = 'http://127.0.0.1:19999/oidc';
    process.env.OIDC_CLIENT_ID = 'test-client';
    process.env.OIDC_CLIENT_SECRET = 'test-secret';
    process.env.APP_BASE_URL = APP_BASE_URL;
    process.env.CONTROL_PLANE_BASE_URL = 'http://127.0.0.1:19998';
    resetServerEnvCache();

    authorizationCodeGrant.mockReset();
    mockedGetOidcConfiguration.mockReset();
    mockedGetOidcConfiguration.mockResolvedValue({} as client.Configuration);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('phòng thủ replay — không có transaction cookie để dùng lại', () => {
    it('THIẾU transaction cookie hoàn toàn → thất bại NGAY, không gọi openid-client', async () => {
      const response = await GET(requestWith(null));

      expect(response.status).toBe(302);
      expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth');
      // Không gọi tới thư viện: transaction cookie thiếu là đủ để dừng, không cần hỏi IdP.
      expect(authorizationCodeGrant).not.toHaveBeenCalled();
    });

    it('transaction cookie chứa JSON hỏng → thất bại, không gọi openid-client', async () => {
      const response = await GET(requestWith(null, `${TRANSACTION_COOKIE}=not-json`));

      expect(response.status).toBe(302);
      expect(authorizationCodeGrant).not.toHaveBeenCalled();
    });
  });

  describe('bốn tình huống openid-client từ chối — CÙNG một đường xử lý', () => {
    const scenarios: { label: string; rejection: Error }[] = [
      {
        label: 'state sai (không khớp cookie transaction)',
        rejection: new Error('state mismatch'),
      },
      { label: 'nonce sai', rejection: new Error('unexpected nonce') },
      {
        label: 'PKCE thất bại (code_verifier sai)',
        rejection: new Error('PKCE code_verifier mismatch'),
      },
      {
        label: 'callback REPLAY — mã đã bị IdP từ chối vì dùng lần hai',
        rejection: new Error('invalid_grant: authorization code already used'),
      },
    ];

    for (const { label, rejection } of scenarios) {
      it(`${label} → redirect lỗi CHUNG, xoá transaction cookie, KHÔNG tạo phiên`, async () => {
        authorizationCodeGrant.mockRejectedValueOnce(rejection);

        const response = await GET(requestWith(VALID_TRANSACTION));

        // 1. Redirect lỗi chung — không lộ nội dung `rejection.message` ra URL.
        const location = new URL(response.headers.get('location') ?? '');
        expect(location.pathname).toBe('/auth');
        const errorParam = location.searchParams.get('error') ?? '';
        expect(errorParam).not.toBe('');
        expect(errorParam).not.toContain(rejection.message);

        // 2. Transaction cookie bị xoá — trình duyệt không giữ lại code_verifier đã dùng hỏng.
        const cleared = setCookies(response).find((c) => c.startsWith(`${TRANSACTION_COOKIE}=`));
        expect(cleared, 'phải có Set-Cookie xoá transaction cookie').toBeDefined();
        expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);

        // 3. Không phiên nào được tạo.
        const cookies = setCookies(response).join('\n');
        expect(cookies).not.toContain('__Host-talos_session');
        expect(cookies).not.toContain('__Host-talos_csrf');
      });
    }
  });

  it('openid-client THÀNH CÔNG nhưng IdP không trả id_token → vẫn thất bại kín, không tạo phiên', async () => {
    // Đường hiếm: token endpoint trả về nhưng thiếu id_token (ví dụ scope `openid` bị bớt).
    // Cùng khối try/catch với bốn tình huống trên nên phải xử lý giống hệt.
    authorizationCodeGrant.mockResolvedValueOnce({
      access_token: 'a',
      token_type: 'bearer',
    } as unknown as Awaited<ReturnType<typeof authorizationCodeGrant>>);

    const response = await GET(requestWith(VALID_TRANSACTION));

    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth');
    const cookies = setCookies(response).join('\n');
    expect(cookies).not.toContain('__Host-talos_session');
  });
});
