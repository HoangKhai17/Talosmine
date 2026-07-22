import styles from './auth-form.module.css';

/**
 * Các mảnh dùng chung của biểu mẫu xác thực.
 *
 * Đăng nhập và đăng ký có cùng nút Google, cùng vạch ngăn, cùng kiểu ô nhập. Để mỗi trang
 * tự viết lại thì sớm muộn chúng lệch nhau — và không ai nhận ra cho tới khi đặt hai ảnh
 * chụp màn hình cạnh nhau.
 */

/**
 * Ghi chú "bản dựng, chưa nối".
 *
 * Đặt NGAY ĐẦU cột biểu mẫu chứ không phải cuối trang: người dùng phải biết trước khi gõ
 * mật khẩu vào, không phải sau.
 */
export function DraftNote({ children }: { children: string }) {
  return (
    <p className={`typeCaption ${styles.draftNote}`} role="note">
      {children}
    </p>
  );
}

/**
 * Nút "Tiếp tục với Google".
 *
 * LUÔN `disabled` ở bản dựng này: cấu hình Logto đang chạy có `socialSignIn: {}` và
 * `socialSignInConnectorTargets: []` — chưa khai báo connector Google nào. Nút để đúng chỗ
 * trong bố cục, nhưng không giả vờ chạy được.
 */
export function GoogleButton() {
  return (
    <>
      <button type="button" className={`typeBody ${styles.socialButton}`} disabled>
        <GoogleIcon />
        Tiếp tục với Google
      </button>
      <p className={`typeCaption ${styles.socialNote}`}>Chưa cấu hình connector Google</p>
    </>
  );
}

export function FormDivider({ label }: { label: string }) {
  return (
    <div className={styles.divider}>
      <span className="typeBodySmall">{label}</span>
    </div>
  );
}

/**
 * Một ô nhập có nhãn.
 *
 * `id` là bắt buộc chứ không tự sinh: đây là server component nên không dùng được `useId`,
 * và một `<label htmlFor>` trỏ sai còn tệ hơn không có nhãn — trình đọc màn hình sẽ đọc
 * nhầm nhãn của ô khác.
 */
export function TextField({
  id,
  label,
  type = 'text',
  name,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  type?: string;
  name: string;
  placeholder: string;
  autoComplete: string;
}) {
  return (
    <div className={styles.field}>
      <label className="typeBodySmall" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`typeBody ${styles.input}`}
        type={type}
        name={name}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
    </div>
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
