import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './auth-shell.module.css';

/**
 * Khung hai cột của khu vực xác thực — dùng chung cho trang đăng nhập và đăng ký.
 *
 * Cột trái giống hệt nhau ở cả hai trang, nên nó nằm ở đây chứ không nhân đôi. Cột phải là
 * `children`.
 *
 * BỐ CỤC TRÀN VIỀN: khung này KHÔNG nằm trên lưới 12 cột của site — xem auth-shell.module.css.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <BrandPanel />

      <div className={styles.formPanel}>
        <div className={styles.formTop}>
          <Link className={`typeBodySmall ${styles.backLink}`} href="/">
            Về trang chủ
          </Link>
        </div>

        <div className={styles.formArea}>{children}</div>
      </div>
    </div>
  );
}

const BENEFITS = [
  {
    id: 'save',
    title: 'Lưu công cụ yêu thích',
    description: 'Mở lại bất cứ lúc nào',
    icon: <BookmarkIcon />,
  },
  {
    id: 'collection',
    title: 'Tạo bộ sưu tập',
    description: 'Gom công cụ về một chỗ',
    icon: <FolderIcon />,
  },
  {
    id: 'picks',
    title: 'Gợi ý riêng cho bạn',
    description: 'Dựa trên thứ bạn đang dùng',
    icon: <SparkIcon />,
  },
];

/**
 * Cột trái — phần giới thiệu.
 *
 * `<aside>` chứ không phải `<section>`: nội dung này bổ trợ cho hành động chính của trang
 * (đăng nhập hoặc đăng ký), không phải nội dung chính.
 */
function BrandPanel() {
  return (
    <aside className={styles.brandPanel} aria-label="Giới thiệu">
      <div className={styles.brandContent}>
        <p className={`typeCardTitle ${styles.brandLogo}`}>Talosmine</p>

        {/*
          `<p>` mang cỡ chữ H2 chứ không phải thẻ `<h2>`: mỗi trang xác thực chỉ có MỘT tiêu
          đề thật ("Đăng nhập" / "Tạo tài khoản"). Câu quảng bá ở đây là chữ trang trí —
          biến nó thành heading sẽ làm trình đọc màn hình thông báo một mục lục sai.
        */}
        <p className={`typeH2 ${styles.brandHeading}`}>Tìm công cụ AI tốt hơn, nhanh hơn</p>

        <p className={`typeBody textSecondary ${styles.brandLead}`}>
          Cùng hàng nghìn người đang tìm đúng công cụ cho công việc của mình.
        </p>

        <ul className={styles.benefitList}>
          {BENEFITS.map((benefit) => (
            <li key={benefit.id} className={styles.benefit}>
              <span className={styles.benefitIcon}>{benefit.icon}</span>
              <span className={styles.benefitText}>
                <span className={`typeBodySmall ${styles.benefitTitle}`}>{benefit.title}</span>
                <span className="typeCaption textTertiary">{benefit.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Khối ảnh giữ chỗ. Ẩn ở mobile — xem auth-shell.module.css. */}
      <div className={styles.brandImage} aria-hidden="true">
        <ImageIcon />
      </div>
    </aside>
  );
}

/* ── Icon ───────────────────────────────────────────────────────────────────
 * Viết thẳng tại chỗ. Icon dùng chung của site nằm ở `app/(user)/icons.tsx`, nhưng khu vực
 * xác thực KHÔNG thuộc nhóm route đó. */

function BookmarkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M6 3h12v18l-6-4.5L6 21V3Z" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M3 6h6l2 2.5h10V19H3V6Z" strokeLinejoin="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 17 5-5 4 4 3-2 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
