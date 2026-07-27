import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isLocale, type Locale, localeHref } from '../../../i18n/locale';
import { format, getMessages, type Messages } from '../../../i18n/messages';
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
 *
 * CHỮ TRONG SHELL đến từ message catalog (`i18n/messages`), không hardcode. Nhãn menu sẽ
 * chuyển sang CMS ở bước sau; khi đó các hằng ở đây thành GIÁ TRỊ DỰ PHÒNG chứ không bị xoá —
 * Control Plane chết thì trang vẫn phải render (DEC-T26).
 */
export default async function UserLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;

  /**
   * Locale rác → 404.
   *
   * Trên thực tế proxy đã chặn trước: đường dẫn không mang prefix hợp lệ bị chuyển hướng về
   * `/vi/...`, nên `/xx/tools` không tới được đây. Vẫn kiểm vì segment động này khớp MỌI
   * chuỗi — nếu matcher của proxy đổi, thiếu chỗ kiểm này sẽ khiến `/bat-ky-thu-gi` render
   * ra trang chủ với `lang` sai thay vì trả 404.
   */
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getMessages(locale);

  const cookieStore = await cookies();
  const signedIn = cookieStore.has('__Host-talos_session');

  /** Rút gọn: mọi link nội bộ trong shell đều phải mang locale. */
  const href = (path: string) => localeHref(locale, path);

  return (
    <>
      <header className={styles.header}>
        <div className={`container ${styles.bar}`}>
          {/* Tên thương hiệu KHÔNG dịch — nó là danh từ riêng, không phải chuỗi giao diện. */}
          <Link className={`typeCardTitle ${styles.brand}`} href={href('/')}>
            Talosmine
          </Link>

          <nav aria-label={t.a11y.primaryNav} className={styles.primaryNav}>
            <ul className={styles.navList}>
              <li>
                <Link className={`typeBodySmall ${styles.navLink}`} href={href('/tools')}>
                  {t.nav.tools}
                </Link>
              </li>
              <li>
                <Link className={`typeBodySmall ${styles.navLink}`} href={href('/blog')}>
                  {t.nav.blog}
                </Link>
              </li>
              <li>
                <Link className={`typeBodySmall ${styles.navLink}`} href={href('/contact')}>
                  {t.nav.contact}
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
                <Link className={`typeBodySmall ${styles.navLink}`} href={href('/account')}>
                  {t.header.account}
                </Link>
                <LogoutButton
                  className={`typeBodySmall ${styles.navLink}`}
                  labels={{
                    signOut: t.header.signOut,
                    signingOut: t.header.signingOut,
                    failed: t.header.signOutFailed,
                  }}
                />
              </>
            ) : (
              /*
                `/auth` nằm ngoài vùng locale nên `href()` trả nguyên văn — xem localeHref.

                `prefetch={false}` là BẮT BUỘC, không phải tinh chỉnh hiệu năng.

                `/auth` không phải một trang: proxy chuyển nó sang `/auth/login`, và route đó
                sinh `state`/`nonce`/PKCE rồi redirect sang IdP. Để Next prefetch nghĩa là mỗi
                lần link này lọt vào viewport, hệ thống lại chạy trọn luồng đó — tạo một
                transaction OIDC không ai dùng, và kết thúc bằng một request xuyên origin bị
                `connect-src 'self'` chặn (vi phạm CSP thấy được trong console).

                Prefetch một redirect ra ngoài site không mang lại gì: đích đến không phải RSC
                payload để Next cache.
              */
              <Link
                className={`typeBodySmall ${styles.navLink}`}
                href={href('/auth')}
                prefetch={false}
              >
                {t.header.signIn}
              </Link>
            )}
            <Link className={`typeBodySmall ${styles.submitButton}`} href={href('/submit')}>
              {t.header.submitTool}
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className={styles.main}>
        {children}
      </main>

      <SiteFooter locale={locale} t={t} />
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
function SiteFooter({ locale, t }: { locale: Locale; t: Messages }) {
  const href = (path: string) => localeHref(locale, path);

  return (
    <footer className={styles.footer}>
      <div className={`container grid ${styles.footerInner}`}>
        <div className={styles.footerBrand}>
          <p className="typeCardTitle">Talosmine</p>
          <p className="typeBodySmall textSecondary">{t.footer.tagline}</p>
          {/*
            Icon mạng xã hội — CHƯA có tài khoản thật nên chưa phải link, cùng lý do với
            `footerPending` bên dưới.

            `aria-hidden` đặt trên CẢ danh sách chứ không trên từng icon: nếu chỉ ẩn từng
            icon thì trình đọc màn hình vẫn gặp một `<ul>` và loan báo "danh sách, 3 mục"
            rồi không đọc được mục nào — tệ hơn là không có gì. Ẩn cả khối thì nó được bỏ
            qua trọn vẹn.

            Khi có link thật: bỏ `aria-hidden`, đổi `<span>` thành `<a>` và cho mỗi icon
            một nhãn văn bản.
          */}
          <ul className={styles.socialList} aria-hidden="true">
            <li>
              <span className={styles.socialIcon}>
                <LinkedInIcon />
              </span>
            </li>
            <li>
              <span className={styles.socialIcon}>
                <XIcon />
              </span>
            </li>
            <li>
              <span className={styles.socialIcon}>
                <GitHubIcon />
              </span>
            </li>
          </ul>
        </div>

        <nav className={styles.footerCol} aria-label={t.footer.explore}>
          <p className="typeBodySmall">{t.footer.explore}</p>
          <ul className={styles.footerLinks}>
            <li>
              <Link className={`typeBodySmall ${styles.footerLink}`} href={href('/tools')}>
                {t.footer.allTools}
              </Link>
            </li>
            <li>
              <Link className={`typeBodySmall ${styles.footerLink}`} href={href('/categories')}>
                {t.footer.categories}
              </Link>
            </li>
            <li>
              <Link className={`typeBodySmall ${styles.footerLink}`} href={href('/submit')}>
                {t.footer.submitTool}
              </Link>
            </li>
          </ul>
        </nav>

        {/* `<nav>` vì cột này CÓ link thật (Blog, Liên hệ) — cùng lý do với cột "Khám phá". */}
        <nav className={styles.footerCol} aria-label={t.footer.about}>
          <p className="typeBodySmall">{t.footer.about}</p>
          <ul className={styles.footerLinks}>
            <li>
              <span className={`typeBodySmall ${styles.footerPending}`}>{t.footer.aboutUs}</span>
            </li>
            <li>
              <Link className={`typeBodySmall ${styles.footerLink}`} href={href('/blog')}>
                {t.footer.blog}
              </Link>
            </li>
            <li>
              <Link className={`typeBodySmall ${styles.footerLink}`} href={href('/contact')}>
                {t.footer.contact}
              </Link>
            </li>
            <li>
              <span className={`typeBodySmall ${styles.footerPending}`}>{t.footer.privacy}</span>
            </li>
          </ul>
        </nav>

        {/*
          CỐ Ý là `<div>`, không phải `<nav>`: cột này chưa có link nào — cả ba mục đều là
          `footerPending`. Một landmark điều hướng rỗng khiến trình đọc màn hình loan báo một
          vùng không đi tới đâu được. Khi mục đầu tiên thành link thật thì đổi sang `<nav>`.
        */}
        <div className={styles.footerCol}>
          <p className="typeBodySmall">{t.footer.resources}</p>
          <ul className={styles.footerLinks}>
            <li>
              <span className={`typeBodySmall ${styles.footerPending}`}>{t.footer.guides}</span>
            </li>
            <li>
              <span className={`typeBodySmall ${styles.footerPending}`}>{t.footer.newsletter}</span>
            </li>
            <li>
              <span className={`typeBodySmall ${styles.footerPending}`}>{t.footer.faq}</span>
            </li>
          </ul>
        </div>
      </div>

      {/*
        Năm lấy từ đồng hồ server lúc render. An toàn vì toàn ứng dụng đã `force-dynamic`
        (xem app/layout.tsx) — không có HTML dựng sẵn nào để mang theo một năm cũ.
      */}
      <div className={`container ${styles.footerBottom}`}>
        <p className="typeBodySmall textSecondary">
          {format(t.footer.rights, { year: new Date().getFullYear() })}
        </p>
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
