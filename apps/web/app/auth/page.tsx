import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import styles from './auth-form.module.css';
import { AuthShell } from './auth-shell';

export const metadata: Metadata = {
  title: 'Talosmine — Đăng nhập',
};

/**
 * Cửa vào đăng nhập.
 *
 * TRANG NÀY KHÔNG CÒN BIỂU MẪU. Trước đây nó dựng sẵn ô tên đăng nhập và mật khẩu theo
 * thiết kế Figma, nhưng biểu mẫu đó không nối vào đâu — và khi giao diện thật đã nằm bên
 * nhà cung cấp danh tính (`apps/logto-ui`), giữ nó lại là có HAI biểu mẫu giống hệt nhau,
 * một cái chạy và một cái không. Người dùng gõ vào cái không chạy rồi tưởng hệ thống hỏng.
 *
 * Thiết kế Figma không mất đi: nó chính là giao diện đang chạy ở trang đăng nhập của IdP.
 *
 * Vì vậy trang này chỉ còn hai việc:
 *   1. Không có lỗi  → chuyển thẳng sang `/auth/login` để bắt đầu OIDC.
 *   2. Có lỗi từ callback → dừng lại và nói cho người dùng biết, kèm đường thử lại.
 *
 * Nếu chuyển hướng cả khi có lỗi thì người dùng rơi vào vòng lặp: lỗi → đăng nhập → lỗi,
 * và không bao giờ đọc được lý do.
 */
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { error, returnTo } = await searchParams;

  const loginHref = returnTo
    ? `/auth/login?returnTo=${encodeURIComponent(returnTo)}`
    : '/auth/login';

  // `redirect()` ném một exception đặc biệt của Next để dừng render — nên nó phải nằm
  // TRƯỚC mọi thứ khác, và không cần `return` sau nó.
  if (!error) {
    redirect(loginHref);
  }

  return (
    <AuthShell>
      <h1 className="typeH2">Chưa đăng nhập được</h1>

      <p className={`typeBodySmall textSecondary ${styles.lead}`}>
        Phiên đăng nhập không hoàn tất. Việc này thường xảy ra khi trang đăng nhập bị mở quá lâu,
        hoặc khi bạn quay lại bằng nút Back giữa chừng.
      </p>

      <div className={styles.error} role="alert">
        <p>{error}</p>
      </div>

      {/*
        `<a>` thường chứ KHÔNG phải `<Link>`: `/auth/login` là route handler trả redirect
        307 sang IdP, không phải trang React. Client-side navigation của Next sẽ cố fetch nó
        như một payload RSC và không đi tới đâu.
      */}
      <a className={`typeBody ${styles.submitButton}`} href={loginHref}>
        Thử đăng nhập lại
      </a>

      <p className={`typeBodySmall ${styles.switchRow}`}>
        <Link className={styles.switchLink} href="/">
          Về trang chủ
        </Link>
      </p>
    </AuthShell>
  );
}
