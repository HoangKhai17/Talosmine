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
/*
 * Menu quản trị.
 *
 * Mỗi mục PHẢI có một trang thật và một permission trong danh mục đã khoá ở database
 * (migration 0005). Không thêm mục cho tính năng chưa tồn tại — một menu trỏ tới trang
 * trống là lời hứa suông.
 *
 * Ba mục hiện tại là TOÀN BỘ những gì P2 định nghĩa. Các mục sau thuộc phase khác và chỉ
 * thêm khi phase đó có backend:
 *   - Ứng dụng (catalog)    P3 — chờ DEC-B01
 *   - Gói dịch vụ           P4
 *   - Hạn mức sử dụng       P5
 */
const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Tài khoản', permission: 'account:read' },
  { href: '/admin/catalog', label: 'Danh mục ứng dụng', permission: 'catalog:read' },
  { href: '/admin/audit', label: 'Nhật ký', permission: 'audit:read' },
  { href: '/admin/roles', label: 'Vai trò', permission: 'admin_role:manage' },
];

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
          // `/admin` là trang gốc nên chỉ khớp chính xác cộng route con của nó
          // (`/admin/accounts/...`); nếu khớp theo prefix thì nó sẽ sáng cả khi đang ở
          // `/admin/audit`.
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
