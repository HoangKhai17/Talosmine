'use client';

import { type FormEvent, useRef, useState } from 'react';
import { type AccountView, ApiError, api } from '../../../lib/api-client';
import styles from './profile-form.module.css';

/**
 * Form sửa hồ sơ.
 *
 * CHỈ ba trường: tên hiển thị, ngôn ngữ, múi giờ — đúng bằng allowlist ở backend.
 * Email và trạng thái tài khoản KHÔNG có mặt ở đây, và đó không phải chuyện giao diện
 * quên làm: email do IdP sở hữu, trạng thái do admin đổi qua endpoint riêng có audit.
 */
export function ProfileForm({
  account,
  onSaved,
}: {
  account: AccountView;
  onSaved: (account: AccountView) => void;
}) {
  const [displayName, setDisplayName] = useState(account.displayName ?? '');
  const [locale, setLocale] = useState(account.locale ?? '');
  const [timezone, setTimezone] = useState(account.timezone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const statusRef = useRef<HTMLDivElement>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      // Gửi cả ba trường: chuỗi rỗng được backend hiểu là "xóa giá trị" → NULL.
      const updated = await api.patch<AccountView>('/me/account', {
        displayName,
        locale,
        timezone,
      });
      onSaved(updated);
      setNotice('Đã lưu thay đổi.');
      statusRef.current?.focus();
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        window.location.href = '/auth?returnTo=%2Faccount';
        return;
      }
      setError(err instanceof Error ? err.message : 'Không lưu được.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void save(e)}>
      <h2 className="typeH3">Sửa hồ sơ</h2>

      <div className={styles.field}>
        <label className="typeBodySmall" htmlFor="displayName">
          Tên hiển thị
        </label>
        <input
          id="displayName"
          className={`typeBody ${styles.input}`}
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={100}
          autoComplete="name"
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className="typeBodySmall" htmlFor="locale">
            Ngôn ngữ
          </label>
          <input
            id="locale"
            className={`typeBody ${styles.input}`}
            type="text"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            placeholder="vi-VN"
            maxLength={35}
            autoComplete="off"
          />
        </div>

        <div className={styles.field}>
          <label className="typeBodySmall" htmlFor="timezone">
            Múi giờ
          </label>
          <input
            id="timezone"
            className={`typeBody ${styles.input}`}
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Asia/Ho_Chi_Minh"
            maxLength={64}
            autoComplete="off"
          />
        </div>
      </div>

      <div aria-live="polite" tabIndex={-1} ref={statusRef}>
        {notice ? <p className="typeBodySmall">{notice}</p> : null}
        {error ? (
          <p className="typeBodySmall" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div>
        <button type="submit" className={`typeBody ${styles.button}`} disabled={saving}>
          {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </div>
    </form>
  );
}
