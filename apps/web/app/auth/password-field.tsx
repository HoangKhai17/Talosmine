'use client';

import { useId, useState } from 'react';
import styles from './auth-form.module.css';

/**
 * Ô mật khẩu có nút hiện/ẩn.
 *
 * Đây là client component DUY NHẤT của khu vực xác thực, và nó nhỏ đúng bằng phần cần
 * tương tác. Các trang bao quanh vẫn là server component.
 *
 * Vì sao làm thật chứ không vẽ cái icon cho giống thiết kế: một nút bấm không làm gì là nói
 * dối người dùng. Thà không có còn hơn có mà giả.
 *
 * Nút mang `aria-pressed` để trình đọc màn hình biết đây là trạng thái bật/tắt, và nhãn đổi
 * theo trạng thái để người dùng biết bấm vào sẽ ra gì.
 *
 * Dùng chung CSS với các ô nhập khác (`auth-form.module.css`) — ô mật khẩu phải giống hệt
 * ô email, chỉ khác cái nút bên trong.
 */
export function PasswordField({
  label = 'Mật khẩu',
  placeholder = 'Nhập mật khẩu',
  autoComplete = 'current-password',
}: {
  label?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  // `useId` an toàn ở đây vì đây là client component. Nhờ nó, đặt hai ô mật khẩu trên cùng
  // một trang cũng không trùng `id`.
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.field}>
      <label className="typeBodySmall" htmlFor={id}>
        {label}
      </label>

      <div className={styles.inputWrap}>
        <input
          id={id}
          className={`typeBody ${styles.input}`}
          type={visible ? 'text' : 'password'}
          name="password"
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={8}
        />

        <button
          type="button"
          className={styles.inputToggle}
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>

      <p className={`typeCaption ${styles.hint}`}>Ít nhất 8 ký tự</p>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6 10-6c2 0 3.7.6 5.1 1.4M22 12s-3.5 6-10 6c-2 0-3.7-.6-5.1-1.4" />
      <path d="m4 4 16 16" strokeLinecap="round" />
    </svg>
  );
}
