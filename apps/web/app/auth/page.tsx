import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';
import { PasswordField } from './password-field';

export const metadata: Metadata = {
  title: 'Talosmine — Đăng nhập',
};

/**
 * Trang đăng nhập — bố cục hai cột theo wireframe Figma của chủ dự án.
 *
 * ⚠ BIỂU MẪU CHƯA NỐI VÀO ĐÂU, VÀ ĐÓ LÀ CÓ CHỦ ĐÍCH.
 *
 * Hiện tại mật khẩu người dùng KHÔNG BAO GIỜ đi qua code của Talosmine: `/auth/login` đẩy
 * người dùng sang trang đăng nhập của Logto, họ gõ mật khẩu ở đó, rồi quay về với một
 * authorization code. Web app của chúng ta chưa từng nhìn thấy mật khẩu nào.
 *
 * Muốn biểu mẫu này chạy thật thì phải gọi Experience API của Logto, tức là mật khẩu sẽ đi
 * qua trang này. Kể từ lúc đó, mọi lỗ XSS và mọi thư viện trong cây phụ thuộc của web app
 * đều trở thành rủi ro lộ mật khẩu. Đó là một đánh đổi về kiến trúc bảo mật, thuộc quyền
 * quyết định của chủ dự án (DEC-G01) — nên tôi dựng bố cục và dừng ở đó.
 *
 * `<form method="post">` dù chưa có `action`: mặc định của form là GET, mà GET sẽ đẩy mật
 * khẩu vừa gõ lên THANH ĐỊA CHỈ và vào lịch sử duyệt web. POST không có đích đến thì chỉ
 * trả lỗi 405 — vô hại.
 *
 * Đường đăng nhập THẬT vẫn còn nguyên ở cuối trang, không bị bố cục mới làm mất.
 *
 * BỐ CỤC: đây là trang TRÀN VIỀN, không nằm trên lưới 12 cột của site. Xem page.module.css.
 */

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

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { error, returnTo } = await searchParams;

  const loginHref = returnTo
    ? `/auth/login?returnTo=${encodeURIComponent(returnTo)}`
    : '/auth/login';

  return (
    <div className={styles.page}>
      <BrandPanel />

      <div className={styles.formPanel}>
        <div className={styles.formTop}>
          <Link className={`typeBodySmall ${styles.backLink}`} href="/">
            Về trang chủ
          </Link>
        </div>

        <div className={styles.formArea}>
          {/* `<h1>` vì đây là tiêu đề chính của trang; class `typeH2` vì cỡ chữ trong thiết
              kế là cỡ H2. Thẻ ngữ nghĩa và cỡ hiển thị là hai việc khác nhau. */}
          <h1 className="typeH2">Đăng nhập</h1>

          <p className={`typeBodySmall textSecondary ${styles.formLead}`}>
            Đăng nhập để lưu công cụ, tạo bộ sưu tập và theo dõi những cập nhật mới nhất.
          </p>

          {error ? (
            <div className={styles.error} role="alert">
              <p className="typeBodySmall">{error}</p>
            </div>
          ) : null}

          {/*
            "Tiếp tục với Google" chưa có gì phía sau: cấu hình Logto hiện tại có
            `socialSignIn: {}` và `socialSignInConnectorTargets: []` — chưa khai báo
            connector Google nào. Nút để đúng chỗ trong bố cục, nhưng không giả vờ chạy.
          */}
          <button type="button" className={`typeBody ${styles.socialButton}`} disabled>
            <GoogleIcon />
            Tiếp tục với Google
          </button>

          <p className={`typeCaption ${styles.socialNote}`}>Chưa cấu hình — xem ghi chú bên dưới</p>

          <div className={styles.divider}>
            <span className="typeBodySmall">hoặc</span>
          </div>

          <form className={styles.form} method="post">
            <div className={styles.field}>
              <label className="typeBodySmall" htmlFor="auth-email">
                Địa chỉ thư điện tử
              </label>
              <input
                id="auth-email"
                className={`typeBody ${styles.input}`}
                type="email"
                name="email"
                placeholder="Nhập địa chỉ thư của bạn"
                autoComplete="email"
              />
            </div>

            <PasswordField />

            <button type="submit" className={`typeBody ${styles.submitButton}`}>
              Đăng nhập
            </button>
          </form>

          <p className={`typeBodySmall ${styles.forgot}`}>
            {/* Không phải link: luồng khôi phục đã được dời lại (DEC-B14) vì Logto chưa cấu
                hình SMTP. Một link dẫn tới hư không tệ hơn một dòng chữ. */}
            <span className="textTertiary">Quên mật khẩu?</span>
          </p>

          {/*
            ĐƯỜNG ĐĂNG NHẬP THẬT — đang chạy được ngay bây giờ.

            `<a>` thường chứ KHÔNG phải `<Link>`: `/auth/login` là route handler trả redirect
            307 sang IdP, không phải trang React. Client-side navigation của Next sẽ cố fetch
            nó như một payload RSC và không đi tới đâu.
          */}
          <div className={styles.realLogin}>
            <p className="typeCaption textTertiary">
              Biểu mẫu trên là bản dựng bố cục, chưa nối. Để đăng nhập thật:
            </p>
            <a className={`typeBodySmall ${styles.realLoginLink}`} href={loginHref}>
              Đăng nhập qua trang an toàn của nhà cung cấp danh tính →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Cột trái — phần giới thiệu.
 *
 * `<aside>` chứ không phải `<section>`: nội dung này bổ trợ cho hành động chính (đăng nhập)
 * chứ không phải nội dung chính của trang.
 */
function BrandPanel() {
  return (
    <aside className={styles.brandPanel} aria-label="Giới thiệu">
      <div className={styles.brandContent}>
        <p className={`typeCardTitle ${styles.brandLogo}`}>Talosmine</p>

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

      {/* Khối ảnh giữ chỗ. Ẩn ở mobile — xem page.module.css. */}
      <div className={styles.brandImage} aria-hidden="true">
        <ImageIcon />
      </div>
    </aside>
  );
}

/* ── Icon ───────────────────────────────────────────────────────────────────
 * Viết thẳng tại chỗ, chỉ dùng ở trang này. Icon dùng chung của site nằm ở
 * `app/(user)/icons.tsx`, nhưng trang đăng nhập KHÔNG thuộc nhóm route đó. */

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

/**
 * Logo Google.
 *
 * ĐÂY LÀ HÌNH THEO ĐÚNG QUY ĐỊNH NHẬN DIỆN CỦA GOOGLE, vẽ nội tuyến thay vì tải từ máy chủ
 * của Google. Tải từ ngoài sẽ gửi IP của người dùng sang Google ngay tại trang đăng nhập,
 * và cũng phải nới CSP `img-src`.
 *
 * KHÔNG dùng `currentColor`: bốn màu này là cố định trong quy định của Google.
 */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1Z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46Z"
      />
      <path
        fill="#FBBC05"
        d="M11.7 28.1c-.4-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.7H4.3A22 22 0 0 0 2 24c0 3.6.9 6.9 2.3 9.8l7.4-5.7Z"
      />
      <path
        fill="#EA4335"
        d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.3 29.9 2 24 2 15.4 2 7.9 6.9 4.3 14.2l7.4 5.7c1.7-5.2 6.6-9.1 12.3-9.1Z"
      />
    </svg>
  );
}
