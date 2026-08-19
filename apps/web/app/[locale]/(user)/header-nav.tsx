'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { WalletMenuLabels } from '../../../components/wallet/wallet-menu';
import type { Locale } from '../../../i18n/locale';
import { CloseIcon, HomeIcon, MenuIcon } from './icons';
import styles from './layout.module.css';
import { LocaleSwitcher } from './locale-switcher';
import { LogoutButton } from './logout-button';

/**
 * Phần tương tác của header: menu chính + khu tài khoản, và nút ba gạch ở mobile.
 *
 * VÌ SAO TÁCH KHỎI `layout.tsx`: nút đóng/mở cần state, mà layout là Server Component (nó
 * đọc cookie và gọi Control Plane). Tách đúng phần cần state ra client, phần còn lại của
 * header — thương hiệu, logo — vẫn render trên server.
 *
 * MỌI CHỮ VÀ HREF TRUYỀN TỪ SERVER XUỐNG. Component này không đọc message catalog: một
 * client component `import` catalog sẽ kéo cả hai bản dịch vào bundle trình duyệt, và bundle
 * đó lớn dần theo số ngôn ngữ.
 *
 * MOBILE VÀ DESKTOP DÙNG CHUNG MỘT CÂY DOM. Không render hai bản rồi ẩn một bản bằng CSS:
 * làm vậy thì trình đọc màn hình gặp mọi link hai lần, và mọi `id` bị trùng. Ở đây chỉ có
 * một bản; CSS quyết định nó nằm ngang hay xếp dọc trong panel.
 */

export interface HeaderNavItem {
  id: string;
  label: string;
  /** Đã gắn prefix locale ở server — client không cần biết luật định tuyến. */
  href: string;
}

export interface HeaderNavLabels {
  wallet: WalletMenuLabels;
  language: string;
  primaryNav: string;
  openMenu: string;
  closeMenu: string;
  account: string;
  signIn: string;
  signOut: string;
  signingOut: string;
  signOutFailed: string;
}

const PANEL_ID = 'header-nav-panel';

/**
 * Mục menu này có trỏ về trang chủ không?
 *
 * `href` đã được gắn prefix locale ở server, nên nó là `/vi` hoặc `/en` — KHÔNG phải `/`.
 * Đó là lý do phải so khớp theo hình dạng "đúng một đoạn" thay vì so bằng `=== '/'`.
 *
 * NHẬN DIỆN THEO ĐƯỜNG DẪN, KHÔNG THÊM CỘT VÀO DATABASE: một cột `icon` trong `nav_items`
 * kéo theo migration, sửa API, sửa màn hình admin và một danh mục icon phải bảo trì — cho
 * đúng MỘT mục. Khi có nhu cầu icon cho nhiều mục thì lúc đó cột đó mới đáng.
 */
function isHomeHref(href: string): boolean {
  return /^\/[a-z]{2}$/.test(href);
}

/**
 * Nút ví CHỈ chạy ở trình duyệt.
 *
 * `ssr: false` là BẮT BUỘC: `wallet-menu` kéo theo `@meshsdk/core`, gói này đọc `window`
 * ngay khi nạp module. Render ở server thì hỏng ở BƯỚC BUILD, không phải lúc chạy — nên lỗi
 * sẽ không xuất hiện trong `pnpm dev` mà chỉ nổ khi deploy.
 *
 * `loading` trả về một nút vô hiệu CÙNG KÍCH THƯỚC thay vì `null`: để trống thì header nhảy
 * một nhịp khi bundle ví tải xong, và nhịp nhảy đó rơi đúng vào lúc người dùng đang đọc.
 * Nút chờ mang `aria-hidden` vì nó chưa làm được gì — thông báo nó cho trình đọc màn hình
 * chỉ tạo ra một đích tab dẫn tới hư không.
 */
const WalletMenu = dynamic(() => import('../../../components/wallet/wallet-menu'), {
  ssr: false,
  loading: () => (
    <span className={`typeBody ${styles.walletButtonPlaceholder}`} aria-hidden="true" />
  ),
});

export function HeaderNav({
  items,
  signedIn,
  labels,
  accountHref,
  signInHref,
  walletHref,
  locale,
}: {
  items: HeaderNavItem[];
  signedIn: boolean;
  labels: HeaderNavLabels;
  accountHref: string;
  signInHref: string;
  walletHref: string;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Điều hướng xong thì đóng panel. Không có bước này, bấm một mục menu ở mobile sẽ chuyển
  // trang nhưng panel vẫn phủ kín màn hình — trông như bấm không ăn.
  //
  // Đóng bằng effect chứ không bằng `onClick` của từng link: nút Back của trình duyệt cũng
  // đổi route mà không đi qua bất kỳ handler nào.
  //
  // biome-ignore lint/correctness/useExhaustiveDependencies: `pathname` là TRIGGER, không phải giá trị dùng trong thân effect.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Esc đóng panel: đây là kỳ vọng chuẩn với mọi lớp phủ, và là đường thoát cho người dùng
  // bàn phím khi họ mở nhầm.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      {/*
        Nút chỉ hiện ở mobile (CSS). `aria-expanded` cho trình đọc màn hình biết trạng thái,
        `aria-controls` nối nó với panel — thiếu cặp này thì nút chỉ là một hình vẽ bấm được.
      */}
      <button
        type="button"
        className={styles.menuToggle}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        aria-label={open ? labels.closeMenu : labels.openMenu}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>

      {/*
        `data-open` thay vì đổi class: CSS đọc thuộc tính này để quyết định hiện/ẩn ở mobile,
        còn ở desktop nó bị bỏ qua hoàn toàn — panel luôn hiển thị.
      */}
      <div id={PANEL_ID} className={styles.panel} data-open={open || undefined}>
        <nav aria-label={labels.primaryNav} className={styles.primaryNav}>
          <ul className={styles.navList}>
            {items.map((item) => (
              <li key={item.id}>
                {isHomeHref(item.href) ? (
                  /*
                    MỤC TRANG CHỦ HIỆN BẰNG ICON, không phải chữ (yêu cầu chủ dự án
                    2026-08-19).

                    NHÃN VẪN ĐẾN TỪ CMS và vẫn được dùng — nó thành `aria-label`. Nhờ vậy
                    người biên tập sửa nhãn trong `/admin` thì tên mà trình đọc màn hình
                    đọc lên cũng đổi theo, dù trên màn hình chỉ thấy hình ngôi nhà. Gán
                    cứng "Trang chủ" ở đây sẽ làm nhãn CMS mất tác dụng ở đúng nơi nó còn
                    quan trọng nhất.

                    `title` để người dùng chuột rê chuột vào cũng biết đó là gì.
                  */
                  <Link
                    className={`${styles.navLink} ${styles.navIconLink}`}
                    href={item.href}
                    aria-label={item.label}
                    title={item.label}
                  >
                    <HomeIcon />
                  </Link>
                ) : (
                  <Link className={`typeBody ${styles.navLink}`} href={item.href}>
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/*
          Khu tài khoản. Tách khỏi nav chính vì đây là hành động của người dùng, không phải
          điều hướng nội dung — trình đọc màn hình cần phân biệt hai nhóm này.
        */}
        <div className={styles.accountArea}>
          {/*
            THỨ TỰ CỐ ĐỊNH: ngôn ngữ → đăng nhập → kết nối ví (yêu cầu chủ dự án 2026-08-19).

            Cả ba đều là THAO TÁC trên trang đang xem, không phải điều hướng nội dung — nên
            chúng nằm ngoài `<nav>` chính. Đặt vào `<nav>` sẽ khiến trình đọc màn hình đọc
            chúng như mục menu, lẫn với danh sách trang.

            Độ nổi bật tăng dần từ trái sang phải: ô chọn ngôn ngữ nhạt nhất, "Đăng nhập" là
            nút phụ, "Kết nối ví" là nút chính có gradient. Mắt người đọc header từ trái sang,
            nên thứ tự này đưa hành động quan trọng nhất vào điểm dừng cuối cùng.
          */}
          <LocaleSwitcher current={locale} label={labels.language} />

          {signedIn ? (
            <>
              <Link className={`typeBody ${styles.navLink}`} href={accountHref}>
                {labels.account}
              </Link>
              <LogoutButton
                className={`typeBody ${styles.navLink}`}
                labels={{
                  signOut: labels.signOut,
                  signingOut: labels.signingOut,
                  failed: labels.signOutFailed,
                }}
              />
            </>
          ) : (
            /*
              `prefetch={false}` là BẮT BUỘC, không phải tinh chỉnh hiệu năng.

              `/auth` không phải một trang: proxy chuyển nó sang `/auth/login`, và route đó
              sinh `state`/`nonce`/PKCE rồi redirect sang IdP. Để Next prefetch nghĩa là mỗi
              lần link này lọt vào viewport, hệ thống lại chạy trọn luồng đó — tạo một
              transaction OIDC không ai dùng, và kết thúc bằng một request xuyên origin bị
              `connect-src 'self'` chặn.
            */
            <Link className={`typeBody ${styles.signInButton}`} href={signInHref} prefetch={false}>
              {labels.signIn}
            </Link>
          )}

          <WalletMenu labels={labels.wallet} walletHref={walletHref} />
        </div>
      </div>
    </>
  );
}
