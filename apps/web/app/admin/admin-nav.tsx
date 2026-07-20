'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './layout.module.css';

interface NavItem {
  href: string;
  label: string;
  /** Permission cần có để mục này xuất hiện. */
  permission: string;
}

/**
 * Danh sách mục điều hướng.
 *
 * `permission` ở đây CHỈ để ẩn/hiện — thuần UX. Ẩn một mục không bảo vệ được gì: người
 * dùng vẫn gõ URL trực tiếp được. Việc chặn thật nằm ở proxy, RSC layout và
 * `AdminPermissionGuard` phía Control Plane.
 *
 * Vì sao vẫn ẩn: hiện một mục rồi trả 403 khi bấm là trải nghiệm tệ và làm người vận hành
 * nghi ngờ hệ thống hỏng.
 */
const NAV_ITEMS: NavItem[] = [{ href: '/admin', label: 'Tài khoản', permission: 'account:read' }];

export function AdminNav({ permissions }: { permissions: readonly string[] }) {
  const pathname = usePathname();
  const visible = NAV_ITEMS.filter((item) => permissions.includes(item.permission));

  if (visible.length === 0) return null;

  return (
    <nav aria-label="Điều hướng quản trị">
      <ul className={styles.navList}>
        {visible.map((item) => {
          // `/admin` là trang gốc nên chỉ khớp chính xác; các mục khác khớp cả route con
          // để trang chi tiết vẫn làm sáng đúng mục cha.
          const active =
            item.href === '/admin'
              ? pathname === '/admin' || pathname.startsWith('/admin/accounts')
              : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                className={`typeBodySmall ${styles.navLink}`}
                href={item.href}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
