import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale, localeHref } from './locale';
import { getMessages, type Messages } from './messages';

/**
 * Locale cho các file KHÔNG nằm dưới `app/[locale]/`: root layout, `loading.tsx`,
 * `not-found.tsx`.
 *
 * Chúng phủ cả vùng có locale lẫn vùng không có (`/admin`, `/auth`) nên không có `params`
 * để đọc. Header `x-locale` do `proxy.ts` đặt cho MỌI request đi qua matcher.
 *
 * Vẫn kiểm giá trị thay vì tin header: nếu matcher của proxy đổi và một request lọt qua mà
 * không có header, hàm phải trả về một locale hợp lệ chứ không phải `null`.
 */
export async function localeFromHeaders(): Promise<Locale> {
  const raw = (await headers()).get('x-locale');
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

/**
 * Đọc locale từ `params` của một route dưới `app/[locale]/`.
 *
 * VÌ SAO CÓ HÀM NÀY thay vì mỗi trang tự ép kiểu: `params.locale` có kiểu `string` vì segment
 * động khớp mọi chuỗi. Ép kiểu (`as Locale`) sẽ làm TypeScript im lặng mà không kiểm gì —
 * đúng loại "an toàn giả" khiến `/xx/tools` render ra trang thật với `lang` sai.
 *
 * Layout của `(user)` đã kiểm và `notFound()` trước khi page chạy, nên trên thực tế hàm này
 * không bao giờ ném. Nó tồn tại để việc narrow kiểu đi kèm một phép kiểm THẬT, và để
 * `generateMetadata` — chạy song song với layout chứ không sau nó — cũng được bảo vệ.
 */
export interface PageLocaleParams {
  params: Promise<{ locale: string }>;
}

export async function resolveLocaleParam(params: PageLocaleParams['params']): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}

/** Lối tắt cho trang nào cần cả locale lẫn bộ chữ — phần lớn các trang. */
export async function resolvePageI18n(
  params: PageLocaleParams['params'],
): Promise<{ locale: Locale; t: Messages }> {
  const locale = await resolveLocaleParam(params);
  return { locale, t: getMessages(locale) };
}

/**
 * `canonical` + `hreflang` cho một trang.
 *
 * VÌ SAO CẦN: cùng một nội dung tồn tại ở hai URL (`/vi/tools`, `/en/tools`). Không khai
 * quan hệ giữa chúng thì công cụ tìm kiếm coi đây là hai trang trùng lặp cạnh tranh nhau,
 * và người dùng tìm bằng tiếng Anh có thể được trả về bản tiếng Việt.
 *
 * `x-default` trỏ về locale mặc định: đó là trang phục vụ người dùng mà trình thu thập
 * không suy ra được ngôn ngữ.
 *
 * `path` là đường dẫn KHÔNG có prefix locale (`/tools`), vì mỗi trang biết route của chính
 * nó chứ không biết nó đang được xem ở ngôn ngữ nào.
 */
export function localeAlternates(locale: Locale, path: string) {
  const languages = Object.fromEntries(LOCALES.map((l) => [l, localeHref(l, path)]));

  return {
    canonical: localeHref(locale, path),
    languages: { ...languages, 'x-default': localeHref(DEFAULT_LOCALE, path) },
  };
}
