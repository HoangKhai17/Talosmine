import { cookies } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './layout.module.css';
import { LogoutButton } from './logout-button';

/**
 * Layout của route group `(user)`.
 *
 * Navigation cố ý trung tính: chỉ có route đã tồn tại thật. Không có mục catalog/plan/usage
 * vì các capability đó chưa được implement — một menu trỏ tới trang không tồn tại là fake
 * capability, không phải placeholder.
 *
 * Không có link tới `/admin`: ẩn/hiện menu chỉ là UX, enforcement thật nằm ở proxy +
 * guard server-side.
 *
 * Menu đổi theo việc CÓ COOKIE PHIÊN hay không. Đây thuần túy là UX — có cookie không
 * chứng minh phiên còn hiệu lực (nó có thể đã bị thu hồi hoặc hết hạn). Mọi trang và API
 * đều tự kiểm phía server, nên hiển thị sai menu không tạo ra lỗ hổng nào.
 */
export default async function UserLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const signedIn = cookieStore.has('__Host-talos_session');

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
              {signedIn ? (
                <>
                  <li>
                    <Link className={`typeBodySmall ${styles.navLink}`} href="/account">
                      Tài khoản
                    </Link>
                  </li>
                  <li>
                    <Link className={`typeBodySmall ${styles.navLink}`} href="/account/sessions">
                      Phiên đăng nhập
                    </Link>
                  </li>
                  <li>
                    <LogoutButton className={`typeBodySmall ${styles.navLink}`} />
                  </li>
                </>
              ) : (
                <li>
                  <Link className={`typeBodySmall ${styles.navLink}`} href="/auth">
                    Đăng nhập
                  </Link>
                </li>
              )}
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
