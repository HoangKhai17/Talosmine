import Link from 'next/link';
import type { ReactNode } from 'react';
import { localeHref } from '../../../../i18n/locale';
import { type PageLocaleParams, resolvePageI18n } from '../../../../i18n/params';
import { AccountNav } from './account-nav';
import styles from './layout.module.css';

/**
 * Khung chung cho MỌI trang trong `/account`.
 *
 * VÌ SAO THÊM: trước đây `/account`, `/account/sessions` và `/account/survey` mỗi trang tự
 * dựng — không sidebar, không breadcrumb, và mỗi trang tự lặp lại phần điều hướng "quay lại".
 * Một layout chung khiến việc thêm trang thứ sáu chỉ còn là viết nội dung.
 *
 * HREF DỰNG Ở SERVER: `AccountNav` là client component (cần `usePathname`), nhưng nó KHÔNG
 * được biết quy tắc định tuyến theo locale — cùng lập luận với `account/page.tsx`. Server
 * dựng sẵn href, client chỉ so khớp chuỗi.
 *
 * KHÔNG có guard đăng nhập ở đây: từng trang tự xử lý trạng thái chưa đăng nhập (`/account`
 * hiện màn hình mời đăng nhập chứ không đá người dùng đi). Nhét guard vào layout sẽ đổi hành
 * vi đã có mà không ai yêu cầu.
 */
export default async function AccountLayout({
  children,
  params,
}: PageLocaleParams & { children: ReactNode }) {
  const { locale, t } = await resolvePageI18n(params);
  const nav = t.accountNav;

  const accountItems = [
    { href: localeHref(locale, '/account'), label: nav.profile },
    { href: localeHref(locale, '/account/saved-tools'), label: nav.savedTools },
    { href: localeHref(locale, '/account/notifications'), label: nav.notifications },
    { href: localeHref(locale, '/account/security'), label: nav.security },
  ];

  const helpItems = [
    { href: localeHref(locale, '/account/help'), label: nav.helpCenter },
    // `/contact` hiện là trang chỗ-giữ-chỗ (`ComingSoon`). Vẫn trỏ tới nó vì đó là đích THẬT
    // và gần nhất; đổi khi trang hỗ trợ riêng ra đời.
    { href: localeHref(locale, '/contact'), label: nav.contactSupport },
  ];

  return (
    // `container section` chuyển LÊN ĐÂY từ ba trang con. Trước đây mỗi trang tự khai, nên
    // thêm trang mới là thêm một cơ hội quên — và quên thì nội dung dính sát mép màn hình.
    <div className={`container section ${styles.shell}`}>
      <nav className={`typeBodySmall ${styles.breadcrumb}`} aria-label={nav.breadcrumbLabel}>
        <Link href={localeHref(locale, '/')}>{nav.breadcrumbHome}</Link>
        <span className={styles.breadcrumbSeparator} aria-hidden="true">
          ›
        </span>
        <span>{nav.breadcrumbAccount}</span>
      </nav>

      <div className={styles.body}>
        <AccountNav
          labels={nav}
          account={accountItems}
          help={helpItems}
          // `/auth/logout` nằm NGOÀI vùng locale — nó tự xử lý cả phiên Talosmine lẫn phiên
          // Logto (xem identity-provider.md mục 14b), nên không bọc `localeHref`.
          logoutHref="/auth/logout"
        />

        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
