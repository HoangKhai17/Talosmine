import type { Metadata } from 'next';
import Link from 'next/link';
import { DraftNote, FormDivider, GoogleButton, TextField } from '../auth-form';
import styles from '../auth-form.module.css';
import { AuthShell } from '../auth-shell';
import { PasswordField } from '../password-field';

export const metadata: Metadata = {
  title: 'Talosmine — Tạo tài khoản',
};

/**
 * Trang đăng ký — bố cục hai cột theo wireframe Figma của chủ dự án.
 *
 * ⚠ BIỂU MẪU CHƯA NỐI, cùng lý do với trang đăng nhập: mật khẩu hiện chưa bao giờ đi qua
 * code của Talosmine. Xem ghi chú đầy đủ ở `../page.tsx`.
 *
 * NGOÀI RA, LUỒNG NÀY CÒN THIẾU HẠ TẦNG dù có nối:
 *
 *   1. Cấu hình Logto đang chạy có `signUp.identifiers: ["username"]` — đăng ký bằng TÊN
 *      ĐĂNG NHẬP, không phải email. Thiết kế này đòi email.
 *   2. Xác minh email cần gửi thư, mà Logto chưa cấu hình SMTP. Đó chính là lý do luồng
 *      khôi phục đã bị dời lại (DEC-B14).
 *
 * Nói cách khác: trang `/auth/check-email` sau bước này mô tả một trạng thái mà hệ thống
 * hiện chưa tạo ra được. Bố cục dựng trước, hạ tầng theo sau.
 *
 * `<form method="post">` dù chưa có `action` — xem lý do ở `../page.tsx`.
 */
export default function SignUpPage() {
  return (
    <AuthShell>
      <h1 className="typeH2">Tạo tài khoản</h1>

      <p className={`typeBodySmall textSecondary ${styles.lead}`}>
        Tham gia Talosmine để lưu công cụ, tạo bộ sưu tập và theo dõi những cập nhật mới nhất.
      </p>

      <DraftNote>
        Bản dựng bố cục — biểu mẫu này chưa nối, và luồng đăng ký bằng email còn chờ cấu hình gửi
        thư.
      </DraftNote>

      <GoogleButton />
      <FormDivider label="hoặc dùng email" />

      <form className={styles.form} method="post">
        {/*
          Họ và tên là HAI ô riêng theo thiết kế. `autoComplete` phải đúng chuẩn
          (`given-name` / `family-name`) thì trình duyệt và trình quản lý mật khẩu mới điền
          hộ được — đặt sai thì ô nào cũng nhận nhầm dữ liệu.
        */}
        <div className={styles.nameRow}>
          <TextField
            id="signup-given-name"
            label="Tên"
            name="givenName"
            placeholder="Khải"
            autoComplete="given-name"
          />
          <TextField
            id="signup-family-name"
            label="Họ"
            name="familyName"
            placeholder="Nguyễn"
            autoComplete="family-name"
          />
        </div>

        <TextField
          id="signup-email"
          label="Địa chỉ thư điện tử"
          type="email"
          name="email"
          placeholder="Nhập địa chỉ thư của bạn"
          autoComplete="email"
        />

        {/* `new-password` chứ không phải `current-password`: nói cho trình quản lý mật khẩu
            biết đây là chỗ TẠO mật khẩu mới, để nó gợi ý một mật khẩu mạnh. */}
        <PasswordField label="Mật khẩu" placeholder="Tạo mật khẩu" autoComplete="new-password" />

        <label className={`typeBodySmall ${styles.consentRow}`}>
          {/*
            `required` là thật, không phải trang trí: trình duyệt sẽ chặn gửi biểu mẫu nếu
            chưa tích. Đây là ràng buộc pháp lý, và nó phải đúng ngay cả ở bản dựng.

            NỘI DUNG hai văn bản này chưa tồn tại — Điều khoản và Chính sách riêng tư chưa
            được soạn, và tôi không tự viết hộ. Vì vậy chúng là chữ chứ không phải link.
          */}
          <input type="checkbox" name="consent" required />
          <span>
            Tôi đồng ý với <span className={styles.consentLink}>Điều khoản dịch vụ</span> và{' '}
            <span className={styles.consentLink}>Chính sách riêng tư</span>
          </span>
        </label>

        <button type="submit" className={`typeBody ${styles.submitButton}`}>
          Tạo tài khoản
        </button>
      </form>

      <p className={`typeBodySmall ${styles.switchRow}`}>
        Đã có tài khoản?{' '}
        <Link className={styles.switchLink} href="/auth">
          Đăng nhập
        </Link>
      </p>

      {/* Xem `../page.tsx` — `<a>` thường vì `/auth/login` là route handler trả redirect. */}
      <div className={styles.realLogin}>
        <p className="typeCaption textTertiary">
          Để tạo tài khoản thật, dùng trang của nhà cung cấp danh tính:
        </p>
        <a className={`typeBodySmall ${styles.realLoginLink}`} href="/auth/login">
          Mở trang đăng nhập / đăng ký an toàn →
        </a>
      </div>
    </AuthShell>
  );
}
