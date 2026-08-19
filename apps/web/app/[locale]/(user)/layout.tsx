import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isLocale, type Locale, localeHref } from '../../../i18n/locale';
import { format, type Messages } from '../../../i18n/messages';
import { BRAND_NAME } from '../../../lib/brand';
import { getBrandLogoSrc } from '../../../server/brand-logo';
import { getContentMessages } from '../../../server/site-content';
import { getSiteNav, type NavItem, type SiteNav } from '../../../server/site-nav';
import { HeaderNav } from './header-nav';
import styles from './layout.module.css';

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
 * HAI NGUỒN CHỮ, cố ý khác nhau:
 *
 *   • NHÃN MENU đến từ Control Plane (`server/site-nav`) — người biên tập sửa trong `/admin`
 *     mà không cần deploy. Control Plane chết hoặc bảng còn trống thì rơi về hằng dự phòng,
 *     nên trang vẫn render (DEC-T26).
 *   • CHUỖI SẢN PHẨM (nhãn nút, `aria-label`, thông báo) đến từ message catalog trong code.
 *     Chúng thuộc về sản phẩm và cần review, không phải nội dung biên tập (DEC-T25).
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

  const cookieStore = await cookies();
  const signedIn = cookieStore.has('__Host-talos_session');

  // SONG SONG: ba lời gọi mạng độc lập nhau, nên chúng chỉ tốn độ trễ của một lời gọi.
  // Cả ba đều cache 60 giây và đều có đường lui — xem `server/site-nav.ts`.
  // `t` đã merge chữ CMS (hiện dùng cho `footer.tagline`) đè lên message catalog.
  const [{ nav }, logoSrc, { t }] = await Promise.all([
    getSiteNav(locale),
    // File tải lên thắng, rồi tới `logo.url`, rồi logo chữ — xem `server/brand-logo.ts`.
    getBrandLogoSrc(),
    getContentMessages(locale),
  ]);

  /** Rút gọn: mọi link nội bộ trong shell đều phải mang locale. */
  const href = (path: string) => localeHref(locale, path);

  return (
    <>
      <header className={styles.header}>
        <div className={`container ${styles.bar}`}>
          <Link className={styles.brand} href={href('/')}>
            <Logo url={logoSrc} />
          </Link>

          {/*
            Phần cần state (nút ba gạch ở mobile) nằm ở client component. Chữ và href dựng
            sẵn tại đây để nó không phải đọc message catalog — xem `header-nav.tsx`.
          */}
          <HeaderNav
            items={nav['header.primary'].map((item) => ({
              id: item.id,
              label: item.label,
              href: href(item.href),
            }))}
            signedIn={signedIn}
            accountHref={href('/account')}
            // `/auth` nằm ngoài vùng locale nên `href()` trả nguyên văn — xem localeHref.
            signInHref={href('/auth')}
            walletHref={href('/wallet')}
            locale={locale}
            labels={{
              /*
                Chuỗi của hộp thoại ví đọc TẠI ĐÂY rồi truyền xuống, không để client tự đọc
                catalog: một client component `import` catalog sẽ kéo cả hai bản dịch vào
                bundle trình duyệt — xem ghi chú đầu `header-nav.tsx`.
              */
              wallet: {
                menuConnect: t.wallet.menuConnect,
                menuDialogTitle: t.wallet.menuDialogTitle,
                menuClose: t.wallet.menuClose,
                menuManage: t.wallet.menuManage,
                searching: t.wallet.searching,
                noWallet: t.wallet.noWallet,
                connect: t.wallet.connect,
                connecting: t.wallet.connecting,
                disconnect: t.wallet.disconnect,
                balance: t.wallet.balance,
                receiveAddress: t.wallet.receiveAddress,
                mainnetWarning: t.wallet.mainnetWarning,
                errDeclinedConnect: t.wallet.errDeclinedConnect,
                errStale: t.wallet.errStale,
                errStaleReload: t.wallet.errStaleReload,
                errMissing: t.wallet.errMissing,
                errUnknown: t.wallet.errUnknown,
              },
              primaryNav: t.a11y.primaryNav,
              openMenu: t.a11y.openMenu,
              closeMenu: t.a11y.closeMenu,
              account: t.header.account,
              language: t.a11y.language,
              signIn: t.header.signIn,
              signOut: t.header.signOut,
              signingOut: t.header.signingOut,
              signOutFailed: t.header.signOutFailed,
            }}
          />
        </div>
      </header>

      <main id="main" className={styles.main}>
        {children}
      </main>

      <SiteFooter locale={locale} t={t} nav={nav} />
    </>
  );
}

/**
 * Logo — ảnh nếu quản trị viên đã đặt, chữ nếu chưa.
 *
 * DÙNG `<img>` THƯỜNG, KHÔNG dùng `next/image`. `next/image` đòi khai trước từng host trong
 * `images.remotePatterns` lúc build; mà đây là URL do quản trị viên nhập lúc chạy, nên host
 * không biết trước. Khai sẵn một wildcard để `next/image` chạy được sẽ mở đúng cái allowlist
 * mà `checkNavHref` sinh ra để khoá.
 *
 * `alt` là tên thương hiệu, KHÔNG dịch: đây là danh từ riêng. Không để `alt=""` vì logo ở đây
 * là link về trang chủ — một link không có nhãn thì trình đọc màn hình chỉ đọc được URL.
 *
 * CSP: `img-src` chỉ cho `'self'`, `data:` và các host trong `CATALOG_ALLOWED_HOSTS`
 * (xem `proxy.ts`). Logo trỏ ra host chưa khai sẽ bị trình duyệt chặn dù server thấy hợp lệ.
 */
function Logo({ url }: { url: string | null }) {
  if (url === null) {
    return <span className="typeCardTitle">{BRAND_NAME}</span>;
  }

  // Chiều cao cố định bằng token, bề ngang tự co theo tỉ lệ ảnh — xem `.logoImage`.
  // biome-ignore lint/performance/noImgElement: URL do admin nhập lúc chạy, next/image cần host khai trước.
  return <img className={styles.logoImage} src={url} alt={BRAND_NAME} />;
}

/**
 * Footer bốn cột theo wireframe.
 *
 * Link trỏ tới route CHƯA TỒN TẠI được render bằng `<span>` chứ không phải `<Link>`:
 * một link dẫn tới 404 tệ hơn một dòng chữ không bấm được, và nó cũng nói dối về những
 * gì hệ thống đang có. Khi trang tương ứng ra đời thì đổi `<span>` thành `<Link>`.
 */
function SiteFooter({ locale, t, nav }: { locale: Locale; t: Messages; nav: SiteNav }) {
  const href = (path: string) => localeHref(locale, path);

  /**
   * Một cột link.
   *
   * Mục "chưa có trang" (`pending`) KHÔNG đến từ CMS và không thể đến từ đó: mô hình dữ liệu
   * bắt buộc mọi mục phải có `href`, còn những mục này cố ý không có đích. Chúng ở lại trong
   * code cho tới khi trang tương ứng ra đời, lúc đó xoá khỏi đây và thêm vào CMS.
   */
  const column = (items: NavItem[], pending: string[] = []) => (
    <ul className={styles.footerLinks}>
      {items.map((item) => (
        <li key={item.id}>
          <Link className={`typeBodySmall ${styles.footerLink}`} href={href(item.href)}>
            {item.label}
          </Link>
        </li>
      ))}
      {pending.map((label) => (
        <li key={label}>
          <span className={`typeBodySmall ${styles.footerPending}`}>{label}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <footer className={styles.footer}>
      <div className={`container grid ${styles.footerInner}`}>
        <div className={styles.footerBrand}>
          <p className="typeCardTitle">{BRAND_NAME}</p>
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
          {column(nav['footer.explore'])}
        </nav>

        {/* `<nav>` vì cột này CÓ link thật — cùng lý do với cột "Khám phá". */}
        <nav className={styles.footerCol} aria-label={t.footer.about}>
          <p className="typeBodySmall">{t.footer.about}</p>
          {/* `privacy` đã RỜI danh sách pending (2026-07-28): trang `/privacy` tồn tại rồi,
              link nằm trong fallbackNav và thêm được vào CMS. Chỉ còn `aboutUs` chờ trang. */}
          {column(nav['footer.about'], [t.footer.aboutUs])}
        </nav>

        {/*
          `<div>` chứ không `<nav>` KHI cột này chưa có link nào — một landmark điều hướng
          rỗng khiến trình đọc màn hình loan báo một vùng không đi tới đâu được.

          Điều kiện chạy theo dữ liệu, không hardcode: người biên tập thêm mục đầu tiên vào
          "Tài nguyên" là nó tự thành `<nav>`. Trước đây chỗ này cố định là `<div>` kèm ghi
          chú "khi có link thì đổi sang nav" — đúng loại việc mà sẽ không ai nhớ làm.
        */}
        {nav['footer.resources'].length > 0 ? (
          <nav className={styles.footerCol} aria-label={t.footer.resources}>
            <p className="typeBodySmall">{t.footer.resources}</p>
            {column(nav['footer.resources'], [t.footer.guides, t.footer.newsletter, t.footer.faq])}
          </nav>
        ) : (
          <div className={styles.footerCol}>
            <p className="typeBodySmall">{t.footer.resources}</p>
            {column([], [t.footer.guides, t.footer.newsletter, t.footer.faq])}
          </div>
        )}
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
