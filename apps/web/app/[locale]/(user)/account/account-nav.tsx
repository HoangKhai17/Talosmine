'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './layout.module.css';

export interface AccountNavLabels {
  sectionAccount: string;
  sectionHelp: string;
  profile: string;
  savedTools: string;
  notifications: string;
  security: string;
  logout: string;
  helpCenter: string;
  contactSupport: string;
  navLabel: string;
  upgradeTitle: string;
  upgradeLead: string;
  upgradeCta: string;
  upgradeNotReady: string;
}

export interface AccountNavItem {
  href: string;
  label: string;
  /** Ngoài vùng locale (ví dụ `/auth/logout`) — không đánh dấu "đang mở" theo pathname. */
  external?: boolean;
}

/**
 * Điều hướng của khu `/account`.
 *
 * LÀ CLIENT COMPONENT VÌ MỘT LÝ DO DUY NHẤT: cần `usePathname()` để biết mục nào đang mở.
 * Mọi href được dựng sẵn ở server và truyền xuống — client không biết gì về quy tắc định
 * tuyến theo locale, đúng cách `account/page.tsx` đang làm.
 *
 * MỤC ĐANG MỞ ĐÁNH DẤU BẰNG `aria-current="page"`, không chỉ bằng màu nền. Người dùng trình
 * đọc màn hình và người khó phân biệt màu vẫn cần biết mình đang ở đâu.
 */
export function AccountNav({
  labels,
  account,
  help,
  logoutHref,
}: {
  labels: AccountNavLabels;
  account: AccountNavItem[];
  help: AccountNavItem[];
  logoutHref: string;
}) {
  const pathname = usePathname();

  /**
   * So khớp CHÍNH XÁC, không dùng `startsWith`.
   *
   * `/account` là tiền tố của `/account/security`, nên `startsWith` sẽ làm "Hồ sơ" sáng lên
   * ở mọi trang con — chỉ dẫn sai chỗ khó chịu hơn là không chỉ dẫn gì.
   */
  const isCurrent = (href: string) => pathname === href;

  return (
    <nav className={styles.sidebar} aria-label={labels.navLabel}>
      <p className={`typeCardTitle ${styles.sectionTitle}`}>{labels.sectionAccount}</p>
      <ul className={styles.navList}>
        {account.map((item) => (
          <li key={item.href}>
            <Link
              className={`typeBody ${styles.navLink}`}
              href={item.href}
              aria-current={isCurrent(item.href) ? 'page' : undefined}
              data-current={isCurrent(item.href) || undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
        <li>
          {/*
            Đăng xuất là một HÀNH ĐỘNG, không phải một trang — nhưng route `/auth/logout` đã
            tồn tại và tự xử lý cả hai phía (phiên Talosmine và phiên Logto), nên link tới nó
            là đúng chứ không phải đường tắt.
          */}
          <Link className={`typeBody ${styles.navLink}`} href={logoutHref}>
            {labels.logout}
          </Link>
        </li>
      </ul>

      <p className={`typeCardTitle ${styles.sectionTitle}`}>{labels.sectionHelp}</p>
      <ul className={styles.navList}>
        {help.map((item) => (
          <li key={item.href}>
            <Link
              className={`typeBody ${styles.navLink}`}
              href={item.href}
              aria-current={isCurrent(item.href) ? 'page' : undefined}
              data-current={isCurrent(item.href) || undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>

      {/*
        Thẻ nâng cấp: cơ chế gói cước chưa chốt (DEC-B18) nên nút để `disabled` và KHÔNG phải
        là link. Một nút dẫn tới trang trống còn tệ hơn một nút tắt có giải thích.
      */}
      <aside className={styles.upgrade} aria-labelledby="upgrade-heading">
        <p className={`typeBodySmall ${styles.upgradeTitle}`} id="upgrade-heading">
          {labels.upgradeTitle}
        </p>
        <p className={`typeCaption ${styles.upgradeLead}`}>{labels.upgradeLead}</p>
        <button
          type="button"
          className={`typeBodySmall ${styles.upgradeCta}`}
          disabled
          aria-describedby="upgrade-note"
        >
          {labels.upgradeCta}
        </button>
        <p className={`typeCaption ${styles.upgradeNote}`} id="upgrade-note">
          {labels.upgradeNotReady}
        </p>
      </aside>
    </nav>
  );
}
