'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CloseIcon, MenuIcon } from './icons';
import styles from './layout.module.css';
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

export function HeaderNav({
  items,
  signedIn,
  labels,
  accountHref,
  signInHref,
}: {
  items: HeaderNavItem[];
  signedIn: boolean;
  labels: HeaderNavLabels;
  accountHref: string;
  signInHref: string;
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
                <Link className={`typeBody ${styles.navLink}`} href={item.href}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/*
          Khu tài khoản. Tách khỏi nav chính vì đây là hành động của người dùng, không phải
          điều hướng nội dung — trình đọc màn hình cần phân biệt hai nhóm này.
        */}
        <div className={styles.accountArea}>
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
            <Link className={`typeBody ${styles.navLink}`} href={signInHref} prefetch={false}>
              {labels.signIn}
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
