import type { NextProxy, NextRequest, ProxyConfig } from 'next/server';
import { NextResponse } from 'next/server';
import {
  DEFAULT_LOCALE,
  isUnlocalizedPath,
  type Locale,
  negotiateLocale,
  splitLocale,
} from './i18n/locale';
import { DEMO_FRAME_ORIGINS, DEMO_PRODUCTS } from './lib/demo-products';
import { decideAdminAccess, isAdminPath } from './server/admin-authorization';
import { logWarn } from './server/logger';

const isProduction = process.env.NODE_ENV === 'production';

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Host được phép làm nguồn ẢNH, đọc từ cùng biến mà Control Plane dùng để duyệt URL admin nhập.
 *
 * VÌ SAO CẦN: logo do quản trị viên đặt được lưu dưới dạng URL. Nếu URL đó trỏ ra host ngoài
 * mà `img-src` chỉ có `'self'`, trình duyệt chặn ảnh và header hiện một ô vỡ — trong khi mọi
 * phép kiểm phía server đều báo hợp lệ. Đó là kiểu hỏng khó lần nhất: đúng ở server, chết ở
 * trình duyệt.
 *
 * DÙNG CHUNG `CATALOG_ALLOWED_HOSTS` với Control Plane là có chủ đích: một danh sách, một
 * nguồn sự thật. Hai danh sách riêng thì sớm muộn URL qua được cửa ghi nhưng không hiển thị
 * được.
 *
 * Hậu tố `!internal` (xem `docs/url-policy.md` mục 7) bị cắt bỏ — nó là cờ dành cho lớp kiểm
 * SSRF phía server, không phải một phần của tên host.
 */
function allowedImageHosts(): string[] {
  return (process.env.CATALOG_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((entry) =>
      entry
        .trim()
        .replace(/!internal$/, '')
        .trim(),
    )
    .filter((host) => host !== '')
    .map((host) => `https://${host}`);
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
/**
 * Trả về đường dẫn "không tồn tại" nếu path là `/<locale>/tools/<key>` mà `key` không có
 * trong danh mục; ngược lại trả `null`.
 *
 * Chỉ xét đúng MỘT segment sau `tools` — `/tools` (trang danh sách) và các đường sâu hơn đều
 * bỏ qua.
 */
function matchUnknownToolPath(pathname: string): string | null {
  const parts = pathname.split('/').filter((part) => part !== '');
  if (parts.length !== 3 || parts[1] !== 'tools') return null;

  const key = parts[2];
  if (DEMO_PRODUCTS.some((product) => product.key === key)) return null;

  // Đường dẫn không khớp route nào → Next tự trả 404 kèm trang `not-found`.
  return `/${parts[0]}/__khong-tim-thay__`;
}

function buildContentSecurityPolicy(nonce: string): string {
  // `'wasm-unsafe-eval'` cho @meshsdk/core (kết nối ví Cardano).
  //
  // Mesh kéo theo libsodium và blake2b-wasm; cả hai gọi `WebAssembly.compile()` NGAY LÚC NẠP
  // MODULE, trước bất kỳ thao tác ví nào. Thiếu nó thì lời gọi đó ném `CompileError`, cả chunk
  // chết, và trang `/wallet` đứng mãi ở dòng "đang tải".
  //
  // BẪY: khối `if (!isProduction)` bên dưới thêm `'unsafe-eval'` cho React Refresh, mà
  // `'unsafe-eval'` cũng cho phép biên dịch WASM. Nên ở `next dev` mọi thứ chạy ngon và lỗi
  // CHỈ xuất hiện trên bản production — đúng nơi không ai thử trước khi deploy.
  //
  // Đây KHÔNG phải nới lỏng như `'unsafe-eval'`: `'wasm-unsafe-eval'` chỉ cho phép biên dịch
  // WebAssembly, không cho `eval()` hay `new Function()` trên chuỗi JavaScript.
  const scriptSrc = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`, `'wasm-unsafe-eval'`];
  const styleSrc = [`'self'`];
  const connectSrc = [`'self'`];
  // `'self'` và `data:` luôn đứng trước — bộ test CSP kiểm baseline bằng chuỗi con.
  const imgSrc = [`'self'`, 'data:', ...allowedImageHosts()];

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
    `img-src ${imgSrc.join(' ')}`,
    `font-src 'self'`,
    `connect-src ${connectSrc.join(' ')}`,
    // `frame-src` BẮT BUỘC KHAI TƯỜNG MINH: thiếu nó thì CSP rơi về `default-src 'self'` và
    // MỌI iframe ngoài bị chặn — trình duyệt chỉ hiện khung trắng, không báo lỗi gì. Đó là
    // loại lỗi tốn hàng giờ để tìm.
    //
    // Origin suy ra từ chính `DEMO_PRODUCTS`, không từ biến môi trường: một biến env quên đặt
    // trên Vercel sẽ làm iframe trắng ở production trong khi local vẫn chạy tốt.
    `frame-src ${["'self'", ...DEMO_FRAME_ORIGINS].join(' ')}`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');
}

/**
 * Cửa vào xác thực → chuyển thẳng sang luồng OIDC, ngay tại proxy.
 *
 * VÌ SAO Ở ĐÂY CHỨ KHÔNG PHẢI TRONG PAGE: `redirect()` của một Server Component chạy trong
 * lúc render đang stream, nên Next không đặt được mã 307 nữa — nó trả 200 kèm một trang
 * đầy đủ (đo được: 26KB) rồi mới nhảy bằng JavaScript. Người dùng thấy khung trang loé lên
 * rồi biến mất. Proxy chạy TRƯỚC khi render nên trả được 307 thật, không tốn một byte HTML.
 *
 * `/auth` có tham số `error` thì KHÔNG chuyển hướng: đó là lỗi quay về từ callback và cần
 * hiển thị. Chuyển hướng luôn sẽ tạo vòng lặp lỗi → đăng nhập → lỗi mà người dùng không bao
 * giờ đọc được lý do.
 *
 * Trả `null` nghĩa là "không phải việc của hàm này".
 */
function authEntryRedirect(request: NextRequest): URL | null {
  const { pathname, searchParams, origin } = request.nextUrl;

  if (pathname === '/auth/sign-up') {
    return new URL('/auth/login?screen=register', origin);
  }

  if (pathname === '/auth' && !searchParams.has('error')) {
    const target = new URL('/auth/login', origin);
    const returnTo = searchParams.get('returnTo');
    // Chuyển tiếp `returnTo` NGUYÊN VĂN. `/auth/login` đã có `safeReturnTo` kiểm nó; kiểm
    // hai lần bằng hai đoạn code khác nhau là cách để hai chỗ lệch luật nhau.
    if (returnTo) target.searchParams.set('returnTo', returnTo);
    return target;
  }

  return null;
}

/**
 * Đưa request về đúng dạng có prefix locale (DEC-T25).
 *
 * VÌ SAO Ở PROXY CHỨ KHÔNG PHẢI TRONG PAGE: cùng lý do với `authEntryRedirect` ngay trên —
 * proxy chạy trước khi render nên trả được 307 thật, không tốn một byte HTML nào.
 *
 * `/admin`, `/auth`, `/api` KHÔNG bao giờ được gắn prefix. Với `/admin` đây là ràng buộc AN
 * NINH chứ không phải lựa chọn tiện lợi: `isAdminPath` so khớp tiền tố `/admin` chính xác,
 * nên `/vi/admin` sẽ trượt guard bên dưới. Danh sách nhánh miễn trừ nằm ở `i18n/locale.ts`.
 *
 * Trả `null` nghĩa là "đường dẫn đã đúng dạng, không phải việc của hàm này".
 */
function localeRedirect(request: NextRequest): URL | null {
  const { pathname, search, origin } = request.nextUrl;

  if (isUnlocalizedPath(pathname)) return null;
  if (splitLocale(pathname).locale !== null) return null;

  const locale = negotiateLocale({
    cookieHeader: request.headers.get('cookie'),
    acceptLanguage: request.headers.get('accept-language'),
  });

  // `/` → `/vi` chứ không phải `/vi/`: hai URL cho cùng một trang là một nguồn lỗi SEO.
  const rest = pathname === '/' ? '' : pathname;
  return new URL(`/${locale}${rest}${search}`, origin);
}

/**
 * Locale để render request này.
 *
 * Chạy SAU `localeRedirect`, nên đường dẫn đã có prefix hợp lệ nếu nó thuộc vùng locale.
 * Nhánh miễn trừ (`/admin`, `/auth`) nhận locale mặc định — chúng chỉ có một ngôn ngữ, nhưng
 * `<html lang>` vẫn cần một giá trị đúng.
 */
function resolveLocale(request: NextRequest): Locale {
  return splitLocale(request.nextUrl.pathname).locale ?? DEFAULT_LOCALE;
}

const proxy: NextProxy = async (request: NextRequest) => {
  const nonce = createNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);

  const authRedirect = authEntryRedirect(request);
  if (authRedirect) {
    return NextResponse.redirect(authRedirect, {
      // Không bao giờ cache: mỗi lần đăng nhập phải sinh state/nonce mới ở `/auth/login`.
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // Chuẩn hoá đường dẫn về dạng có locale TRƯỚC guard admin. An toàn vì `/admin` nằm trong
  // danh sách miễn trừ nên không bao giờ bị hàm này chạm tới.
  const toLocalized = localeRedirect(request);
  if (toLocalized) {
    return NextResponse.redirect(toLocalized, {
      // Không cache: locale chọn theo cookie/`Accept-Language` của từng người. Một redirect
      // được cache sẽ ép mọi người dùng sau đó vào ngôn ngữ của người đầu tiên.
      headers: { 'Cache-Control': 'no-store', Vary: 'Accept-Language, Cookie' },
    });
  }

  /**
   * Lớp chặn admin thứ nhất, chạy trên server trước khi bất kỳ route nào render.
   * Đây là lý do request trực tiếp tới `/admin` trả 403 chứ không phải redirect
   * phía client: client-side redirect không phải authorization, nó chỉ là UX.
   * Lớp thứ hai nằm ở `app/admin/layout.tsx` để guard vẫn giữ nếu proxy bị bỏ qua.
   */
  if (isAdminPath(request.nextUrl.pathname)) {
    const sessionToken = request.cookies.get('__Host-talos_session')?.value;
    // B3 (`pending-work.md`): correlation ID cho lượt kiểm quyền này, nối được với log
    // "RBAC deny" bên dưới và với lời gọi `/v1/me/permissions` phía Control Plane.
    const correlationId = crypto.randomUUID();
    const decision = await decideAdminAccess(sessionToken, correlationId);

    if (!decision.allowed) {
      // Khách VÃNG LAI (chưa đăng nhập) được đưa về trang chủ, KHÔNG phải trang đăng nhập.
      //
      // Vì sao không đá sang `/auth?returnTo=/admin`: làm vậy là xác nhận với người lạ
      // rằng khu vực quản trị có tồn tại ở đúng đường dẫn đó. Đưa về trang chủ khiến
      // `/admin` không phân biệt được với một URL không tồn tại.
      //
      // Đánh đổi: admin có session hết hạn bấm bookmark `/admin` sẽ về trang chủ mà không
      // được giải thích. Chấp nhận được — họ đăng nhập từ trang chủ rồi vào lại.
      //
      // KHÔNG log nhánh `NO_SESSION`: đó là khách vãng lai, không phải một quyết định RBAC
      // (không có danh tính nào để từ chối). Log ở đây chỉ ghi lại lượt "có danh tính nhưng
      // bị từ chối" — đúng nghĩa "RBAC deny" mà B3 nhắc tới.
      if (decision.reason === 'NO_SESSION') {
        return NextResponse.redirect(new URL('/', request.nextUrl.origin));
      }

      logWarn('admin.access_denied', {
        correlationId,
        reason: decision.reason,
        path: request.nextUrl.pathname,
      });

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

  /**
   * `/tools/<key>` không có thật → trả 404 THẬT, ngay tại đây.
   *
   * VÌ SAO PHẢI Ở PROXY, không phải trong page: `[key]` là segment động nên nó khớp MỌI giá
   * trị — route luôn tồn tại, Next bắt đầu render, rồi mới tới `notFound()`. Lúc đó phản hồi
   * đã stream nên không đặt lại được mã trạng thái: trang trả **200 kèm nội dung 404**.
   *
   * Đo được, và phép so sánh chỉ đúng thủ phạm: `/vi/khong-ton-tai-gi-ca` → 404,
   * `/vi/account/khong-co` → 404, nhưng `/vi/tools/khong-co-that` → **200**. Chỉ route có
   * segment động mới lệch. `export const dynamicParams = false` KHÔNG sửa được điều này.
   *
   * Cùng lập luận với khối `/auth` bên trên: proxy chạy TRƯỚC khi render nên nó còn đặt được
   * mã trạng thái, còn Server Component thì không.
   *
   * Cách làm: viết lại sang một đường dẫn KHÔNG có route nào khớp, để chính Next trả 404 kèm
   * trang `not-found` chuẩn — thay vì ta tự dựng một phản hồi 404 trần trụi.
   */
  const unknownTool = matchUnknownToolPath(request.nextUrl.pathname);
  if (unknownTool) {
    return NextResponse.rewrite(new URL(unknownTool, request.nextUrl.origin), {
      headers: { 'Content-Security-Policy': contentSecurityPolicy },
    });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

  // Locale đi xuống render qua header, cùng cách với nonce. Nhờ vậy ROOT layout đặt được
  // `<html lang>` đúng mà không phải tách thành hai root layout riêng cho vùng có locale và
  // vùng không có (`/admin`, `/auth`).
  requestHeaders.set('x-locale', resolveLocale(request));

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  return response;
};

export const config: ProxyConfig = {
  /**
   * Bỏ qua tài sản tĩnh: chúng không phải document nên không cần CSP, và giữ chúng ngoài
   * proxy tránh sinh nonce thừa mỗi request.
   *
   * PHẦN ĐUÔI TỆP LÀ BẮT BUỘC, KHÔNG PHẢI TỐI ƯU. Trước đây danh sách chỉ có `_next/*` và
   * `favicon.ico`, nên MỌI tệp trong `public/` đều rơi vào proxy và bị định tuyến ngôn ngữ
   * chuyển hướng: `/demo-tools/a.svg` → **307** sang `/vi/demo-tools/a.svg` → 404. Ảnh nằm
   * đúng chỗ, đường dẫn viết đúng, mà trang vẫn trống — và không có lỗi nào ở console server.
   * Đã mất thời gian vì đúng lỗi này.
   *
   * Liệt kê ĐÍCH DANH từng đuôi thay vì loại mọi đường có dấu chấm: một slug bài viết chứa
   * dấu chấm vẫn là document và vẫn phải nhận CSP. Thêm loại tệp mới thì thêm vào đây.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|txt|xml|json|woff|woff2|ttf|otf|mp4|webm|pdf)$).*)',
  ],
};

export default proxy;
