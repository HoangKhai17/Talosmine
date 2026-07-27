import Link from 'next/link';
import { Fragment } from 'react';
import { type Locale, localeHref } from '../../../i18n/locale';
import { getMessages } from '../../../i18n/messages';
import styles from './breadcrumb.module.css';

/** Một chặng trên đường dẫn. Không có `href` nghĩa là chặng đó chưa có trang riêng. */
export type Crumb = { label: string; href?: string };

/**
 * Breadcrumb — dùng chung cho các trang con của site công khai.
 *
 * `<nav aria-label>` + `<ol>`: đây là điều hướng có THỨ TỰ, không phải một danh sách link
 * bất kỳ. Mục CUỐI không bao giờ là link và mang `aria-current="page"` — nó chính là trang
 * đang xem, biến nó thành link tự trỏ về mình là nói dối người dùng bàn phím.
 *
 * "Trang chủ" luôn được tự thêm vào đầu, nên chỗ dùng chỉ khai phần sau nó.
 *
 * Chặng giữa KHÔNG có `href` thì render bằng `<span>` chứ không phải `<Link>`: một link
 * dẫn tới 404 tệ hơn một dòng chữ không bấm được. Ví dụ chặng chủ đề ở trang chi tiết bài
 * viết — chưa có trang lọc theo chủ đề nên nó chỉ là chữ.
 *
 * Component tự mang `grid-column: 1 / -1`, nên chỗ dùng chỉ cần đặt nó làm con TRỰC TIẾP
 * của `.container.grid`.
 */
export function Breadcrumb({ trail, locale }: { trail: Crumb[]; locale: Locale }) {
  const t = getMessages(locale);

  // Chặng "Trang chủ" trỏ về trang chủ CỦA LOCALE hiện tại, không phải `/` trần — nếu không
  // thì mỗi lần bấm lại đi qua một vòng chuyển hướng của proxy.
  const crumbs: Crumb[] = [{ label: t.common.home, href: localeHref(locale, '/') }, ...trail];
  const lastIndex = crumbs.length - 1;

  return (
    <nav className={styles.breadcrumb} aria-label={t.a11y.breadcrumb}>
      <ol className={styles.list}>
        {crumbs.map((crumb, index) => (
          // `key` là nhãn: một đường dẫn không bao giờ đi qua cùng một chặng hai lần.
          <Fragment key={crumb.label}>
            {index > 0 && (
              <li aria-hidden="true" className={styles.separator}>
                ›
              </li>
            )}
            <li>
              {index === lastIndex ? (
                <span className="typeBodySmall" aria-current="page">
                  {crumb.label}
                </span>
              ) : crumb.href ? (
                <Link className={`typeBodySmall ${styles.link}`} href={crumb.href}>
                  {index === 0 && <HomeIcon />}
                  {crumb.label}
                </Link>
              ) : (
                <span className={`typeBodySmall ${styles.pending}`}>{crumb.label}</span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

/** Chỉ dùng ở đây nên để tại chỗ, không đưa vào `icons.tsx`. */
function HomeIcon() {
  return (
    <svg
      className={styles.icon}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3L12 3Z" />
    </svg>
  );
}
