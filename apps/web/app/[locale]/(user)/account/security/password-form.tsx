'use client';

import { useId, useState } from 'react';
import styles from '../shared.module.css';

export interface PasswordFormLabels {
  currentPassword: string;
  currentPasswordPlaceholder: string;
  newPassword: string;
  newPasswordPlaceholder: string;
  confirmPassword: string;
  confirmPasswordPlaceholder: string;
  minLength: string;
  show: string;
  hide: string;
  update: string;
  mismatch: string;
  tooShort: string;
  notReady: string;
}

const MIN_LENGTH = 8;

/**
 * Form đổi mật khẩu — GIAO DIỆN, CHƯA NỐI.
 *
 * ĐÃ ĐO trên Logto 1.41 đang chạy: Account API có thật (`POST /api/verifications/password` để
 * xác minh mật khẩu hiện tại, `POST /api/my-account/password` để đặt mật khẩu mới), NHƯNG
 * `GET /api/account-center` trả `enabled: false` — API có mà cổng đóng. Bật nó là một thay
 * đổi cấu hình riêng, và còn một việc thiết kế chưa giải: đưa access token audience `me`
 * xuống trình duyệt sao cho an toàn.
 *
 * VÌ SAO KHÔNG ĐI ĐƯỜNG TẮT QUA BFF: C5 chốt rằng mật khẩu đi THẲNG từ trình duyệt tới Logto,
 * không đi qua code Talosmine. Gửi qua BFF là đúng phương án đã bị loại — dễ hơn hôm nay,
 * nhưng kéo mật khẩu vào phạm vi mã nguồn của mình vĩnh viễn.
 *
 * NÚT GỬI `disabled`, và mọi thứ khác chạy thật (hiện/ẩn, kiểm khớp, kiểm độ dài). Nhờ vậy
 * layout đánh giá được ngay, còn phần chưa có thì nói thật thay vì báo lỗi mơ hồ khi bấm.
 */
export function PasswordForm({ labels }: { labels: PasswordFormLabels }) {
  const currentId = useId();
  const newId = useId();
  const confirmId = useId();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  // Chỉ báo lỗi khi người dùng đã gõ — nhắc "quá ngắn" vào một ô còn trống là phiền nhiễu.
  const tooShort = next !== '' && next.length < MIN_LENGTH;
  const mismatch = confirm !== '' && next !== confirm;

  function field(
    id: string,
    label: string,
    placeholder: string,
    value: string,
    onChange: (v: string) => void,
    autoComplete: string,
    describedBy?: string,
  ) {
    const shown = visible[id] === true;
    return (
      <div className={styles.field}>
        <label className="typeBodySmall" htmlFor={id}>
          {label}
        </label>
        <div className={styles.field}>
          <input
            id={id}
            className={`typeBody ${styles.input}`}
            type={shown ? 'text' : 'password'}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={autoComplete}
            {...(describedBy ? { 'aria-describedby': describedBy } : {})}
          />
          {/*
            Nút hiện/ẩn là `<button>` thật với nhãn đổi theo trạng thái — không phải một icon
            câm. Trình đọc màn hình cần biết bấm vào sẽ xảy ra chuyện gì.
          */}
          <button
            type="button"
            className={`typeCaption ${styles.notReady}`}
            onClick={() => setVisible((prev) => ({ ...prev, [id]: !shown }))}
            style={{ border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            {shown ? labels.hide : labels.show}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className={styles.card}
      // Không có `onSubmit`: nút gửi đang `disabled` nên form không gửi được. Thêm một
      // handler rỗng chỉ để "cho đủ" sẽ khiến người đọc sau tưởng đường gửi đã tồn tại.
      noValidate
    >
      <p className={`typeBodySmall ${styles.notReady}`} id="password-not-ready">
        {labels.notReady}
      </p>

      {field(
        currentId,
        labels.currentPassword,
        labels.currentPasswordPlaceholder,
        current,
        setCurrent,
        'current-password',
        'password-min-length',
      )}
      <p className={`typeCaption ${styles.lead}`} id="password-min-length">
        {labels.minLength}
      </p>

      {field(
        newId,
        labels.newPassword,
        labels.newPasswordPlaceholder,
        next,
        setNext,
        'new-password',
      )}
      {tooShort ? (
        <p className={`typeBodySmall ${styles.notReady}`} role="alert">
          {labels.tooShort}
        </p>
      ) : null}

      {field(
        confirmId,
        labels.confirmPassword,
        labels.confirmPasswordPlaceholder,
        confirm,
        setConfirm,
        'new-password',
      )}
      {mismatch ? (
        <p className={`typeBodySmall ${styles.notReady}`} role="alert">
          {labels.mismatch}
        </p>
      ) : null}

      <div className={styles.buttonRow}>
        <button
          type="submit"
          className={`typeBody ${styles.button}`}
          disabled
          aria-describedby="password-not-ready"
        >
          {labels.update}
        </button>
      </div>
    </form>
  );
}
