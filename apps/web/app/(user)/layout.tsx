import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Layout của route group `(user)`.
 *
 * Navigation cố ý trung tính: chỉ có route đã tồn tại thật ở P1. Không có mục
 * catalog/plan/usage/account vì các capability đó chưa được implement (phase-1 mục 5 và 10)
 * — một menu trỏ tới trang không tồn tại là fake capability, không phải placeholder.
 *
 * Không có link tới `/admin`: P1 không cấp quyền admin. (Ẩn/hiện menu chỉ là UX,
 * enforcement thật nằm ở proxy + guard server-side.)
 */
export default function UserLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="shell-header">
        <div className="shell-bar">
          <p className="shell-brand">Talosmine</p>
          <nav aria-label="Điều hướng chính">
            <ul className="shell-nav-list">
              <li>
                <Link className="shell-nav-link" href="/">
                  Trang chính
                </Link>
              </li>
              <li>
                <Link className="shell-nav-link" href="/auth">
                  Tài khoản
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className="shell-main">
        {children}
      </main>

      <footer className="shell-footer">
        <div className="shell-bar">
          <p>Talosmine — bản dựng nền tảng, chưa có tính năng nghiệp vụ.</p>
        </div>
      </footer>
    </>
  );
}
