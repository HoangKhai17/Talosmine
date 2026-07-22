import type { Metadata } from 'next';
import Link from 'next/link';
import { DraftNote, FormDivider, GoogleButton, TextField } from './auth-form';
import styles from './auth-form.module.css';
import { AuthShell } from './auth-shell';
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

  return (
    <AuthShell>
      <h1 className="typeH2">Đăng nhập</h1>

      <p className={`typeBodySmall textSecondary ${styles.lead}`}>
        Đăng nhập để lưu công cụ, tạo bộ sưu tập và theo dõi những cập nhật mới nhất.
      </p>

      <DraftNote>
        Bản dựng bố cục — biểu mẫu này chưa nối. Dùng liên kết ở cuối trang để đăng nhập thật.
      </DraftNote>

      {error ? (
        <div className={styles.error} role="alert">
          <p className="typeBodySmall">{error}</p>
        </div>
      ) : null}

      <GoogleButton />
      <FormDivider label="hoặc" />

      <form className={styles.form} method="post">
        <TextField
          id="login-email"
          label="Địa chỉ thư điện tử"
          type="email"
          name="email"
          placeholder="Nhập địa chỉ thư của bạn"
          autoComplete="email"
        />

        <PasswordField />

        <button type="submit" className={`typeBody ${styles.submitButton}`}>
          Đăng nhập
        </button>
      </form>

      <p className={`typeBodySmall ${styles.switchRow}`}>
        {/* Không phải link: luồng khôi phục đã được dời lại (DEC-B14) vì Logto chưa cấu hình
            SMTP. Một link dẫn tới hư không tệ hơn một dòng chữ. */}
        <span className="textTertiary">Quên mật khẩu?</span>
      </p>

      <p className={`typeBodySmall ${styles.switchRow}`}>
        Chưa có tài khoản?{' '}
        <Link className={styles.switchLink} href="/auth/sign-up">
          Đăng ký
        </Link>
      </p>

      {/*
        ĐƯỜNG ĐĂNG NHẬP THẬT — đang chạy được ngay bây giờ.

        `<a>` thường chứ KHÔNG phải `<Link>`: `/auth/login` là route handler trả redirect 307
        sang IdP, không phải trang React. Client-side navigation của Next sẽ cố fetch nó như
        một payload RSC và không đi tới đâu.
      */}
      <div className={styles.realLogin}>
        <p className="typeCaption textTertiary">Để đăng nhập thật:</p>
        <a className={`typeBodySmall ${styles.realLoginLink}`} href={loginHref}>
          Đăng nhập qua trang an toàn của nhà cung cấp danh tính →
        </a>
      </div>
    </AuthShell>
  );
}
