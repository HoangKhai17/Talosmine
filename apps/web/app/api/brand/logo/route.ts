import { getSiteSettings } from '../../../../server/site-settings';

/**
 * Logo thương hiệu — đường CÔNG KHAI cho các bề mặt ngoài Next.js.
 *
 * NGƯỜI GỌI DUY NHẤT hiện tại: trang đăng nhập (`apps/logto-ui`). Nó chạy ở origin của
 * Logto, không render qua Next nên không đọc được `getSiteSettings()` trực tiếp; một thẻ
 * `<img>` trỏ về đây thì không vướng CORS. Nhờ vậy đổi logo trong `/admin/content/nav` là
 * trang đăng nhập cũng đổi theo — một nguồn sự thật, không phải chép URL sang config Logto.
 *
 * REDIRECT chứ không proxy bytes: logo có thể nằm ở host ngoài allowlist hoặc đường dẫn nội
 * bộ; chuyển hướng để trình duyệt tự tải giữ route này không thành một proxy ảnh tuỳ ý.
 *
 * 404 khi chưa đặt logo là tín hiệu CÓ CHỦ ĐÍCH: `onerror` phía trang đăng nhập rơi về logo
 * chữ — cùng hành vi với header của chính web app.
 */
export async function GET(request: Request): Promise<Response> {
  const { logoUrl } = await getSiteSettings();

  if (logoUrl === null) {
    return new Response(null, { status: 404 });
  }

  return new Response(null, {
    status: 302,
    headers: {
      // URL tương đối (`/...`) resolve về origin của chính web app.
      location: new URL(logoUrl, request.url).toString(),
      // Khớp TTL cache của `getSiteSettings` — đổi logo hiện ra trong vòng ~60 giây.
      'cache-control': 'public, max-age=60',
    },
  });
}
