import { getUploadedLogo } from '../../../../server/brand-logo';
import { getSiteSettings } from '../../../../server/site-settings';

/**
 * Logo thương hiệu — đường CÔNG KHAI, hai người gọi:
 *
 *   - Trang đăng nhập (`apps/logto-ui`) — origin khác, thẻ `<img>` không vướng CORS.
 *   - Chính web app (header, auth-shell) khi logo là file TẢI LÊN: phục vụ cùng origin nên
 *     luôn hợp lệ với `img-src 'self'`, không đụng allowlist host nào.
 *
 * THỨ TỰ: file tải lên (bytes, migration 0015) → `logo.url` (redirect) → 404. 404 là tín
 * hiệu có chủ đích: người gọi rơi về logo chữ — cùng hành vi mọi nơi.
 */
export async function GET(request: Request): Promise<Response> {
  const uploaded = await getUploadedLogo();
  if (uploaded !== null) {
    return new Response(new Uint8Array(uploaded.data), {
      headers: {
        'content-type': uploaded.mime,
        // Bytes do admin tải lên — trình duyệt không được đoán lại kiểu file.
        'x-content-type-options': 'nosniff',
        // Khớp TTL cache phía server — đổi logo hiện ra trong vòng ~60 giây.
        'cache-control': 'public, max-age=60',
      },
    });
  }

  const { logoUrl } = await getSiteSettings();
  if (logoUrl === null) {
    return new Response(null, { status: 404 });
  }

  return new Response(null, {
    status: 302,
    headers: {
      // URL tương đối (`/...`) resolve về origin của chính web app.
      location: new URL(logoUrl, request.url).toString(),
      'cache-control': 'public, max-age=60',
    },
  });
}
