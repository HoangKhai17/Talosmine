'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LOCALE_COOKIE, LOCALES, type Locale, splitLocale } from '../../../i18n/locale';
import styles from './layout.module.css';

/**
 * Bộ đổi ngôn ngữ ở header.
 *
 * DÙNG `<select>` GỐC, không tự dựng dropdown bằng `div` + `useState`. Trình duyệt cho sẵn
 * điều hướng bằng phím mũi tên, gõ chữ để nhảy tới mục, đóng bằng Esc, và trên điện thoại nó
 * mở bộ chọn gốc của hệ điều hành — dễ bấm hơn hẳn một danh sách tự vẽ. Một dropdown viết tay
 * phải làm lại toàn bộ những thứ đó, và thường sót ít nhất một.
 *
 * HIỂN THỊ MÃ NGẮN "VI"/"EN" (yêu cầu chủ dự án 2026-08-19), không phải tên đầy đủ. Header
 * là hàng ngang chật, và ô chọn phải co theo chuỗi dài nhất trong danh sách — "Tiếng Việt"
 * đẩy ô rộng gần gấp đôi. Mã hai chữ cái là quy ước quen thuộc và ai cũng đọc được ở cả hai
 * ngôn ngữ, nên chúng KHÔNG nằm trong message catalog.
 *
 * Chuỗi hiển thị ngắn nên `aria-label` của ô chọn PHẢI nói rõ đây là gì ("Chọn ngôn ngữ") —
 * một ô chỉ ghi "VI" mà không có nhãn thì trình đọc màn hình không cho biết nó dùng để làm gì.
 */

/** Mã hiển thị. Khoá phủ hết `LOCALES` nên thêm ngôn ngữ mới là lỗi biên dịch, không phải sót. */
const SHORT_CODE: Record<Locale, string> = {
  vi: 'VI',
  en: 'EN',
};

/** Một năm. Lựa chọn ngôn ngữ là thói quen, không phải phiên làm việc. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function LocaleSwitcher({ current, label }: { current: Locale; label: string }) {
  const router = useRouter();
  const pathname = usePathname();

  function switchTo(next: Locale) {
    if (next === current) return;

    /**
     * GHI COOKIE, không chỉ đổi URL.
     *
     * Đổi URL thôi là đủ cho lần điều hướng này, nhưng lần sau người dùng vào thẳng `/` thì
     * proxy lại đàm phán locale từ `Accept-Language` và đưa họ về đúng ngôn ngữ họ vừa từ
     * chối. `negotiateLocale` đọc cookie này trước header — xem `i18n/locale.ts`.
     *
     * `secure` chỉ đặt khi đang chạy HTTPS: đặt cứng thì cookie bị trình duyệt bỏ qua trên
     * `http://localhost`, và bộ đổi ngôn ngữ sẽ "quên" ngay ở môi trường dev.
     */
    const secure = window.location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax${secure}`;

    /**
     * Giữ nguyên trang đang xem, chỉ thay đoạn locale: `/vi/tools/abc` → `/en/tools/abc`.
     *
     * Không dùng `useSearchParams()` để lấy query — hook đó buộc mọi trang chứa component này
     * phải có ranh giới Suspense, mà đây là component nằm trong layout dùng chung nên ràng
     * buộc đó lan ra toàn site. `window.location.search` cho đúng giá trị ấy mà không kéo
     * theo gì cả, và ở đây ta chắc chắn đang ở trình duyệt.
     */
    const { rest } = splitLocale(pathname);
    const target = rest === '/' ? `/${next}` : `/${next}${rest}`;
    router.push(`${target}${window.location.search}`);
  }

  return (
    <select
      className={`typeBodySmall ${styles.localeSelect}`}
      aria-label={label}
      value={current}
      onChange={(event) => switchTo(event.target.value as Locale)}
    >
      {LOCALES.map((locale) => (
        <option key={locale} value={locale}>
          {SHORT_CODE[locale]}
        </option>
      ))}
    </select>
  );
}
