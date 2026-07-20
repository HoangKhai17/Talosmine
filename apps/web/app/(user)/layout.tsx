import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './layout.module.css';

/**
 * Layout của route group `(user)`.
 *
 * Navigation cố ý trung tính: chỉ có route đã tồn tại thật. Không có mục catalog/plan/usage
 * vì các capability đó chưa được implement — một menu trỏ tới trang không tồn tại là fake
 * capability, không phải placeholder.
 *
 * Không có link tới `/admin`: ẩn/hiện menu chỉ là UX, enforcement thật nằm ở proxy +
 * guard server-side.
 */
export default function UserLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className={styles.header}>
        <div className={`container ${styles.bar}`}>
          <Link className={`typeCardTitle ${styles.brand}`} href="/">
            Talosmine
          </Link>
          <nav aria-label="Điều hướng chính">
            <ul className={styles.navList}>
              <li>
                <Link className={`typeBodySmall ${styles.navLink}`} href="/">
                  Trang chính
                </Link>
              </li>
              <li>
                <Link className={`typeBodySmall ${styles.navLink}`} href="/auth">
                  Tài khoản
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className={styles.main}>
        {children}
      </main>

      <footer className={styles.footer}>
        <div className="container">
          <p className="typeBodySmall textSecondary">
            Talosmine — bản dựng nền tảng, chưa có tính năng nghiệp vụ.
          </p>
        </div>
      </footer>
    </>
  );
}
