import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  isLocale,
  isUnlocalizedPath,
  LOCALES,
  localeFromAcceptLanguage,
  localeFromCookie,
  localeHref,
  negotiateLocale,
  splitLocale,
} from '../../apps/web/i18n/locale';
import { format } from '../../apps/web/i18n/messages';
import { en } from '../../apps/web/i18n/messages/en';
import { vi } from '../../apps/web/i18n/messages/vi';

/**
 * Chọn ngôn ngữ và định tuyến theo locale (DEC-T25, DEC-B15).
 *
 * Trọng tâm KHÔNG phải "hàm chạy đúng với đầu vào đẹp". Trọng tâm là ba thứ dễ hỏng lặng lẽ:
 * nhánh miễn trừ `/admin`, thứ tự ưu tiên cookie/header, và q-value của `Accept-Language`.
 */

describe('isUnlocalizedPath — nhánh không gắn locale', () => {
  /**
   * `/admin` nằm trong danh sách này vì LÝ DO AN NINH: `isAdminPath` so khớp tiền tố
   * `/admin` chính xác, nên `/vi/admin` sẽ trượt guard ở proxy. Nếu ai đó bỏ `/admin` khỏi
   * danh sách miễn trừ, test này đỏ trước khi lỗ hổng kịp tồn tại.
   */
  it('miễn trừ /admin, /auth, /api và mọi đường dẫn con', () => {
    for (const path of ['/admin', '/admin/catalog', '/auth', '/auth/login', '/api/bff/x']) {
      expect(isUnlocalizedPath(path), path).toBe(true);
    }
  });

  it('KHÔNG miễn trừ trang thường', () => {
    for (const path of ['/', '/tools', '/blog/bai-viet-mau']) {
      expect(isUnlocalizedPath(path), path).toBe(false);
    }
  });

  it('không khớp nhầm tiền tố chỉ trùng một phần', () => {
    // `/administrator` KHÔNG phải `/admin`. So khớp bằng `startsWith` trần sẽ dính ca này.
    expect(isUnlocalizedPath('/administrator')).toBe(false);
    expect(isUnlocalizedPath('/authors')).toBe(false);
  });
});

describe('splitLocale', () => {
  it('tách được prefix hợp lệ', () => {
    expect(splitLocale('/vi/tools')).toEqual({ locale: 'vi', rest: '/tools' });
    expect(splitLocale('/en/blog/bai-viet')).toEqual({ locale: 'en', rest: '/blog/bai-viet' });
  });

  it('chuẩn hoá `/vi` về rest `/`', () => {
    // Nếu trả chuỗi rỗng thì mọi phép ghép URL sau đó phải tự xử lý ca đặc biệt.
    expect(splitLocale('/vi')).toEqual({ locale: 'vi', rest: '/' });
  });

  it('trả null khi không có prefix locale', () => {
    expect(splitLocale('/tools').locale).toBeNull();
    expect(splitLocale('/').locale).toBeNull();
  });

  it('không nhận locale không nằm trong danh sách', () => {
    // Danh mục ĐÓNG (DEC-B15): `fr` chưa hỗ trợ thì `/fr/tools` không phải đường dẫn có locale.
    expect(splitLocale('/fr/tools').locale).toBeNull();
    expect(splitLocale('/vietnam/tools').locale).toBeNull();
  });
});

describe('localeFromAcceptLanguage — phải tôn trọng q-value', () => {
  it('chọn theo q cao nhất, không phải theo thứ tự khai báo', () => {
    // Bỏ qua q-value sẽ trả `en` ở đây — sai, vì người dùng ưu tiên tiếng Việt.
    expect(localeFromAcceptLanguage('en;q=0.3,vi;q=0.9')).toBe('vi');
  });

  it('khớp subtag vùng về ngôn ngữ gốc', () => {
    expect(localeFromAcceptLanguage('en-US,en;q=0.9')).toBe('en');
    expect(localeFromAcceptLanguage('vi-VN')).toBe('vi');
  });

  it('bỏ qua ngôn ngữ không hỗ trợ và mục có q=0', () => {
    expect(localeFromAcceptLanguage('fr-FR,de;q=0.8')).toBeNull();
    expect(localeFromAcceptLanguage('en;q=0')).toBeNull();
  });

  it('đầu vào rỗng hoặc rác trả null chứ không ném lỗi', () => {
    // Đây là header do CLIENT gửi — không được phép làm sập render.
    expect(localeFromAcceptLanguage(null)).toBeNull();
    expect(localeFromAcceptLanguage('')).toBeNull();
    expect(localeFromAcceptLanguage(';;;q=abc')).toBeNull();
  });
});

describe('localeFromCookie', () => {
  it('đọc đúng cookie giữa nhiều cookie khác', () => {
    expect(localeFromCookie('foo=1; talos_locale=en; bar=2')).toBe('en');
  });

  it('giá trị không hợp lệ trả null, không trả nguyên văn', () => {
    expect(localeFromCookie('talos_locale=fr')).toBeNull();
    expect(localeFromCookie('talos_locale=')).toBeNull();
    expect(localeFromCookie(null)).toBeNull();
  });
});

describe('negotiateLocale — thứ tự ưu tiên', () => {
  it('cookie thắng Accept-Language', () => {
    // Cookie là lựa chọn tường minh của người dùng; header chỉ là cấu hình hệ điều hành.
    expect(
      negotiateLocale({ cookieHeader: 'talos_locale=vi', acceptLanguage: 'en-US,en;q=0.9' }),
    ).toBe('vi');
  });

  it('dùng Accept-Language khi không có cookie', () => {
    expect(negotiateLocale({ acceptLanguage: 'en-US,en;q=0.9' })).toBe('en');
  });

  it('rơi về mặc định khi không có tín hiệu nào', () => {
    expect(negotiateLocale({})).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale({ cookieHeader: 'talos_locale=fr', acceptLanguage: 'de' })).toBe(
      DEFAULT_LOCALE,
    );
  });
});

describe('localeHref', () => {
  it('gắn prefix cho đường dẫn nội bộ', () => {
    expect(localeHref('vi', '/tools')).toBe('/vi/tools');
    expect(localeHref('en', '/')).toBe('/en');
  });

  it('KHÔNG gắn prefix cho nhánh miễn trừ', () => {
    // Gắn prefix vào `/auth` sẽ tạo ra một URL 404.
    expect(localeHref('vi', '/auth')).toBe('/auth');
    expect(localeHref('en', '/admin/catalog')).toBe('/admin/catalog');
  });

  it('không gắn hai lần', () => {
    expect(localeHref('vi', '/vi/tools')).toBe('/vi/tools');
  });
});

describe('message catalog', () => {
  /**
   * `en.ts` khai `satisfies Messages` nên thiếu khoá đã là lỗi typecheck. Test này bắt phần
   * mà kiểu KHÔNG thấy: khoá tồn tại nhưng để chuỗi rỗng, hoặc quên dịch và copy nguyên
   * tiếng Việt sang.
   */
  it('mọi locale có đủ khoá và không có chuỗi rỗng', () => {
    const catalogs = { vi, en } as Record<string, Record<string, Record<string, string>>>;
    const sections = Object.keys(vi);

    for (const locale of LOCALES) {
      const catalog = catalogs[locale];
      expect(catalog, `thiếu catalog cho ${locale}`).toBeDefined();

      for (const section of sections) {
        const viSection = (vi as Record<string, Record<string, string>>)[section] as Record<
          string,
          string
        >;
        for (const key of Object.keys(viSection)) {
          const value = catalog?.[section]?.[key];
          expect(value, `${locale}.${section}.${key} thiếu`).toBeTypeOf('string');
          expect((value ?? '').trim(), `${locale}.${section}.${key} rỗng`).not.toBe('');
        }
      }
    }
  });

  it('giữ tham số {year} ở mọi bản dịch', () => {
    // Dịch mà đánh rơi `{year}` thì dòng bản quyền mất năm — không lỗi, chỉ sai lặng lẽ.
    for (const catalog of [vi, en]) {
      expect(catalog.footer.rights).toContain('{year}');
    }
  });

  it('isLocale chỉ nhận giá trị trong danh mục đóng', () => {
    expect(isLocale('vi')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('format', () => {
  it('thay tham số theo tên', () => {
    expect(format('© {year} Talosmine', { year: 2026 })).toBe('© 2026 Talosmine');
  });

  it('GIỮ NGUYÊN placeholder khi thiếu tham số', () => {
    // In `undefined` giữa câu trông như lỗi ngẫu nhiên; `{year}` thì nhìn là thấy ngay.
    expect(format('© {year} Talosmine', {})).toBe('© {year} Talosmine');
  });
});
