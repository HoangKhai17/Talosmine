import { cookies } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './layout.module.css';
import { LogoutButton } from './logout-button';

/**
 * Shell của route group `(user)` — header + footer theo wireframe Figma.
 *
 * Menu đổi theo việc CÓ COOKIE PHIÊN hay không. Đây thuần tuý là UX — có cookie không
 * chứng minh phiên còn hiệu lực (nó có thể đã bị thu hồi hoặc hết hạn). Mọi trang và API
 * đều tự kiểm phía server, nên hiển thị sai menu không tạo ra lỗ hổng nào.
 *
 * Không có link tới `/admin` ở đây: ẩn/hiện menu chỉ là UX, còn chặn thật nằm ở proxy,
 * RSC layout của `/admin` và `AdminPermissionGuard` phía Control Plane.
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

          <nav aria-label="Điều hướng chính" className={styles.primaryNav}>
            <ul className={styles.navList}>
              <li>
                <Link className={`typeBodySmall ${styles.navLink}`} href="/tools">
                  Công cụ
                </Link>
              </li>
              <li>
                <Link className={`typeBodySmall ${styles.navLink}`} href="/categories">
                  Danh mục
                </Link>
              </li>
              <li>
                <Link className={`typeBodySmall ${styles.navLink}`} href="/blog">
                  Blog
                </Link>
              </li>
            </ul>
          </nav>

          {/*
            Khu tài khoản. Tách khỏi nav chính vì đây là hành động của người dùng, không
            phải điều hướng nội dung — trình đọc màn hình cần phân biệt hai nhóm này.
          */}
          <div className={styles.accountArea}>
            {signedIn ? (
              <>
                <Link className={`typeBodySmall ${styles.navLink}`} href="/account">
                  Tài khoản
                </Link>
                <LogoutButton className={`typeBodySmall ${styles.navLink}`} />
              </>
            ) : (
              <Link className={`typeBodySmall ${styles.navLink}`} href="/auth">
                Đăng nhập
              </Link>
            )}
            <Link className={`typeBodySmall ${styles.submitButton}`} href="/submit">
              Gửi công cụ
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className={styles.main}>
        {children}
      </main>

      <SiteFooter />
    </>
  );
}

/**
 * Footer bốn cột theo wireframe.
 *
 * Link trỏ tới route CHƯA TỒN TẠI được render bằng `<span>` chứ không phải `<Link>`:
 * một link dẫn tới 404 tệ hơn một dòng chữ không bấm được, và nó cũng nói dối về những
 * gì hệ thống đang có. Khi trang tương ứng ra đời thì đổi `<span>` thành `<Link>`.
 */
function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container grid ${styles.footerInner}`}>
        <div className={styles.footerBrand}>
          <p className="typeCardTitle">Talosmine</p>
          <p className="typeBodySmall textSecondary">
            Nơi tập hợp công cụ, tài nguyên và thông tin để bạn xây dựng và phát triển.
          </p>
          <ul className={styles.socialList}>
            <li>
              <span className={styles.socialIcon} aria-hidden="true">
                <LinkedInIcon />
              </span>
            </li>
            <li>
              <span className={styles.socialIcon} aria-hidden="true">
                <XIcon />
              </span>
            </li>
            <li>
              <span className={styles.socialIcon} aria-hidden="true">
                <GitHubIcon />
              </span>
            </li>
          </ul>
        </div>

        <nav className={styles.footerCol} aria-label="Khám phá">
          <p className="typeBodySmall">Khám phá</p>
          <ul className={styles.footerLinks}>
            <li>
              <Link className={`typeBodySmall ${styles.footerLink}`} href="/tools">
                Tất cả công cụ
              </Link>
            </li>
            <li>
              <Link className={`typeBodySmall ${styles.footerLink}`} href="/categories">
                Danh mục
              </Link>
            </li>
            <li>
              <Link className={`typeBodySmall ${styles.footerLink}`} href="/submit">
                Gửi công cụ
              </Link>
            </li>
          </ul>
        </nav>

        <div className={styles.footerCol}>
          <p className="typeBodySmall">Về chúng tôi</p>
          <ul className={styles.footerLinks}>
            <li>
              <span className={`typeBodySmall ${styles.footerPending}`}>Giới thiệu</span>
            </li>
            <li>
              <Link className={`typeBodySmall ${styles.footerLink}`} href="/blog">
                Blog
              </Link>
            </li>
            <li>
              <span className={`typeBodySmall ${styles.footerPending}`}>Liên hệ</span>
            </li>
            <li>
              <span className={`typeBodySmall ${styles.footerPending}`}>Chính sách riêng tư</span>
            </li>
          </ul>
        </div>

        <div className={styles.footerCol}>
          <p className="typeBodySmall">Tài nguyên</p>
          <ul className={styles.footerLinks}>
            <li>
              <span className={`typeBodySmall ${styles.footerPending}`}>Hướng dẫn</span>
            </li>
            <li>
              <span className={`typeBodySmall ${styles.footerPending}`}>Bản tin</span>
            </li>
            <li>
              <span className={`typeBodySmall ${styles.footerPending}`}>Câu hỏi thường gặp</span>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

/* SVG viết thẳng tại chỗ — chỉ cần ba icon, và thư viện icon nằm ngoài bảng D. */

function LinkedInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.5 4.78 5.76V21h-4v-5.6c0-1.34-.03-3.07-1.9-3.07-1.9 0-2.2 1.46-2.2 2.97V21h-4V9Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.2 2H21l-6.5 7.4L22 22h-6l-4.7-6.2L5.9 22H3l7-8-7.3-12h6.2l4.3 5.7L18.2 2Zm-1 18h1.6L7.9 3.7H6.1L17.2 20Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.84.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}
