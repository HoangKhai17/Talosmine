'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { type AccountView, ApiError, api } from '../../../../lib/api-client';
import styles from './page.module.css';
import { ProfileForm } from './profile-form';

/**
 * Trang hồ sơ tài khoản.
 *
 * Client component vì nó đọc dữ liệu qua ranh giới BFF bằng cookie phiên — đây cũng là
 * đường mà mọi trang sau này dùng, nên dựng đúng ngay từ đầu.
 *
 * PHÂN BIỆT EMAIL VỚI TRẠNG THÁI XÁC MINH (phase-2 mục 10): giao diện KHÔNG được gợi ý
 * email là khóa định danh. Định danh thật là cặp (issuer, subject) — xem
 * docs/identity-provider.md mục 6.
 */
export default function AccountPage() {
  const [account, setAccount] = useState<AccountView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccount(await api.get<AccountView>('/me/account'));
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        // Phiên hết hạn → đưa về đăng nhập, kèm đường quay lại đúng trang này.
        window.location.href = '/auth?returnTo=%2Faccount';
        return;
      }
      setError(err instanceof Error ? err.message : 'Không tải được thông tin tài khoản.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="container section stack">
      <h1 className="typeH1">Tài khoản</h1>

      {/* aria-live để trình đọc màn hình thông báo khi trạng thái đổi mà không đổi focus. */}
      <div aria-live="polite">
        {loading ? <p className="typeBody textSecondary">Đang tải…</p> : null}

        {error ? (
          <div className="notice" role="alert">
            <p className="typeBody">{error}</p>
            <button type="button" className="typeBody" onClick={() => void load()}>
              Thử lại
            </button>
          </div>
        ) : null}
      </div>

      {account && !loading ? (
        <>
          <div className={styles.card}>
            <dl className={styles.fields}>
              <dt className={`typeBodySmall ${styles.label}`}>Email</dt>
              <dd className={`typeBody ${styles.value}`}>
                {account.email ?? <span className={styles.empty}>Chưa có</span>}
              </dd>

              <dt className={`typeBodySmall ${styles.label}`}>Xác minh email</dt>
              <dd className={`typeBody ${styles.value}`}>
                <span className={`${styles.badge} ${account.emailVerified ? styles.badgeOk : ''}`}>
                  {account.emailVerified ? 'Đã xác minh' : 'Chưa xác minh'}
                </span>
              </dd>

              <dt className={`typeBodySmall ${styles.label}`}>Trạng thái</dt>
              <dd className={`typeBody ${styles.value}`}>{statusLabel(account.status)}</dd>

              <dt className={`typeBodySmall ${styles.label}`}>Ngày tạo</dt>
              <dd className={`typeBody ${styles.value}`}>{formatDateTime(account.createdAt)}</dd>
            </dl>
          </div>

          <p className="typeBodySmall textSecondary">
            Email và mật khẩu do hệ thống đăng nhập quản lý, không chỉnh sửa tại đây. Tài khoản của
            bạn được nhận dạng bằng danh tính đăng nhập, không phải bằng email.
          </p>

          <ProfileForm account={account} onSaved={setAccount} />

          <div className={styles.actions}>
            <Link className="typeBody" href="/account/sessions">
              Xem các phiên đăng nhập
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

function statusLabel(status: AccountView['status']): string {
  if (status === 'active') return 'Đang hoạt động';
  if (status === 'pending') return 'Chờ kích hoạt';
  return 'Đã khóa';
}

/**
 * Định dạng theo locale/timezone CỦA TRÌNH DUYỆT.
 *
 * Không tự ghép chuỗi ngày giờ: người dùng ở múi giờ khác sẽ đọc sai thời điểm, và đây
 * là dữ liệu bảo mật (phiên đăng nhập lúc nào) nên đọc sai là vấn đề thật.
 */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}
