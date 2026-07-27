/**
 * Danh sách ngôn ngữ và cách chọn ngôn ngữ cho một request (DEC-T25, DEC-B15).
 *
 * Module này CỐ Ý không phụ thuộc `next`: nó chạy ở proxy (Edge), ở Server Component và
 * trong unit test — ba nơi có API khác nhau. Nhận đầu vào là chuỗi thô, trả về locale.
 */

/**
 * Danh mục ĐÓNG (DEC-B15). Thêm một ngôn ngữ không phải việc sửa mảng này là xong: còn cần
 * file message đầy đủ và một migration nới `CHECK (locale IN …)` ở bảng bản dịch.
 *
 * Làm khó có chủ đích — một locale nửa vời (có trong danh sách nhưng thiếu bản dịch) tạo ra
 * trang lẫn lộn hai thứ tiếng, tệ hơn là không hỗ trợ ngôn ngữ đó.
 */
export const LOCALES = ['vi', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'vi';

/** Tên cookie ghi nhớ lựa chọn của người dùng. Không phải `__Host-`: đây không phải dữ liệu nhạy cảm. */
export const LOCALE_COOKIE = 'talos_locale';

/**
 * Nhánh đường dẫn KHÔNG mang prefix locale (DEC-T25).
 *
 * `/admin` nằm đây vì lý do AN NINH, không phải tiết kiệm công dịch: `isAdminPath` so khớp
 * tiền tố `/admin` chính xác, nên `/vi/admin` sẽ không khớp và lớp chặn admin thứ nhất ở
 * proxy mất tác dụng. Giữ `/admin` ngoài vùng locale làm vấn đề đó biến mất thay vì phải
 * nhớ xử lý ở mỗi lần sửa định tuyến.
 */
const UNLOCALIZED_PREFIXES = ['/admin', '/auth', '/api'] as const;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Đường dẫn này có thuộc nhánh không gắn locale không? */
export function isUnlocalizedPath(pathname: string): boolean {
  return UNLOCALIZED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Tách locale khỏi đầu đường dẫn.
 *
 * `/vi/tools` → `{ locale: 'vi', rest: '/tools' }`
 * `/tools`    → `{ locale: null, rest: '/tools' }`
 * `/vi`       → `{ locale: 'vi', rest: '/' }`  ← chuẩn hoá về `/`, không phải chuỗi rỗng
 */
export function splitLocale(pathname: string): { locale: Locale | null; rest: string } {
  const segments = pathname.split('/');
  // `pathname` luôn bắt đầu bằng `/` nên `segments[0]` là chuỗi rỗng.
  const first = segments[1];

  if (!isLocale(first)) return { locale: null, rest: pathname };

  const rest = `/${segments.slice(2).join('/')}`;
  return { locale: first, rest: rest === '/' ? '/' : rest.replace(/\/$/, '') };
}

/**
 * Dựng href nội bộ có gắn locale.
 *
 * `localeHref('vi', '/tools')` → `/vi/tools` · `localeHref('vi', '/')` → `/vi`
 *
 * Đường dẫn thuộc nhánh miễn trừ (`/auth`, `/admin`, `/api`) trả về NGUYÊN VĂN — gắn prefix
 * vào chúng sẽ tạo ra URL 404.
 *
 * Không gắn prefix thì trang vẫn tới đúng đích (proxy chuyển hướng), nhưng mỗi lần bấm phải
 * đi thêm một vòng 307. Dùng hàm này để tránh vòng đó.
 */
export function localeHref(locale: Locale, path: string): string {
  if (isUnlocalizedPath(path)) return path;
  if (splitLocale(path).locale !== null) return path;
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

/**
 * Đọc locale từ chuỗi cookie thô (`document.cookie` / header `cookie`).
 *
 * Tự tách thay vì dùng parser của framework: hàm này chạy ở cả proxy lẫn test, và một
 * phụ thuộc framework ở đây sẽ kéo theo cả bộ vào unit test.
 */
export function localeFromCookie(cookieHeader: string | null | undefined): Locale | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.split('=');
    if (rawName?.trim() !== LOCALE_COOKIE) continue;

    const value = rawValue.join('=').trim();
    return isLocale(value) ? value : null;
  }
  return null;
}

/**
 * Đọc locale từ header `Accept-Language`.
 *
 * Xử lý q-value vì trình duyệt thật gửi dạng `en-US,en;q=0.9,vi;q=0.8` — bỏ qua q-value sẽ
 * luôn chọn mục đầu tiên, tức là chọn theo thứ tự khai báo chứ không theo mức ưu tiên.
 * Cũng khớp `en-US` về `en`: subtag vùng không đổi ngôn ngữ.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;

  const candidates = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return {
        // `en-US` → `en`. So khớp không phân biệt hoa thường: header là dữ liệu do client gửi.
        base: (tag ?? '').trim().toLowerCase().split('-')[0] ?? '',
        // q không đọc được coi như 0 — thà bỏ qua một mục mờ ám còn hơn cho nó ưu tiên cao nhất.
        q: Number.isFinite(q) ? q : 0,
      };
    })
    .filter((c) => c.base !== '' && c.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const candidate of candidates) {
    if (isLocale(candidate.base)) return candidate.base;
  }
  return null;
}

/**
 * Chọn locale cho một request chưa có prefix trong URL.
 *
 * Thứ tự (DEC-T25): cookie → `Accept-Language` → mặc định.
 *
 * Cookie thắng header vì nó là lựa chọn TƯỜNG MINH của người dùng, còn `Accept-Language` là
 * cấu hình hệ điều hành mà phần lớn người dùng không biết mình có.
 *
 * KHÔNG suy ra từ quốc gia/IP (DEC-B15): địa lý không phải ngôn ngữ.
 */
export function negotiateLocale(input: {
  cookieHeader?: string | null | undefined;
  acceptLanguage?: string | null | undefined;
}): Locale {
  return (
    localeFromCookie(input.cookieHeader) ??
    localeFromAcceptLanguage(input.acceptLanguage) ??
    DEFAULT_LOCALE
  );
}
