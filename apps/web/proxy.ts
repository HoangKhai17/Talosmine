import type { NextProxy, NextRequest, ProxyConfig } from 'next/server';
import { NextResponse } from 'next/server';
import { decideAdminAccess, isAdminPath } from './server/admin-authorization';

const isProduction = process.env.NODE_ENV === 'production';

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * CSP theo DEC-T12. Baseline bắt buộc: `default-src 'self'`, `img-src 'self' data:`,
 * `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`.
 *
 * Vì sao có `script-src` với nonce dù DEC-T12 không nhắc: App Router chèn script inline
 * để truyền RSC payload sang client. Với `default-src 'self'` trần, script đó bị chặn và
 * trang không hydrate. Nonce là cách thắt chặt (chỉ script do chính server phát mới chạy),
 * KHÔNG phải nới lỏng — không có wildcard, không có `'unsafe-inline'` cho script.
 * Next tự đọc nonce từ CSP của request header và gắn vào script của nó.
 */
function buildContentSecurityPolicy(nonce: string): string {
  const scriptSrc = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`];
  const styleSrc = [`'self'`];
  const connectSrc = [`'self'`];

  if (!isProduction) {
    // Chỉ dev: React Refresh cần eval, style của dev server là inline, HMR dùng websocket.
    // Ba mục này không tồn tại trong production build.
    scriptSrc.push(`'unsafe-eval'`);
    styleSrc.push(`'unsafe-inline'`);
    connectSrc.push('ws:');
  }

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src ${connectSrc.join(' ')}`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');
}

const proxy: NextProxy = (request: NextRequest) => {
  const nonce = createNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);

  /**
   * Lớp chặn admin thứ nhất, chạy trên server trước khi bất kỳ route nào render.
   * Đây là lý do request trực tiếp tới `/admin` trả 403 chứ không phải redirect
   * phía client: client-side redirect không phải authorization, nó chỉ là UX.
   * Lớp thứ hai nằm ở `app/admin/layout.tsx` để guard vẫn giữ nếu proxy bị bỏ qua.
   */
  if (isAdminPath(request.nextUrl.pathname)) {
    const decision = decideAdminAccess();
    if (!decision.allowed) {
      return new NextResponse('403 Forbidden\n', {
        status: 403,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Security-Policy': contentSecurityPolicy,
          'Cache-Control': 'no-store',
        },
      });
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  return response;
};

export const config: ProxyConfig = {
  // Bỏ qua static asset và favicon: chúng không phải document nên không cần CSP,
  // và giữ chúng ngoài proxy tránh sinh nonce thừa mỗi request.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export default proxy;
