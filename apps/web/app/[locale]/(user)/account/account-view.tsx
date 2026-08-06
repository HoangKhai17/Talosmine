'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Messages } from '../../../../i18n/messages';
import { type AccountView as AccountData, ApiError, api } from '../../../../lib/api-client';
import styles from './page.module.css';
import { ProfileForm } from './profile-form';
import shared from './shared.module.css';

/**
 * Trang hồ sơ tài khoản — phần chạy trên trình duyệt.
 *
 * Client component vì nó đọc dữ liệu qua ranh giới BFF bằng cookie phiên — đây cũng là
 * đường mà mọi trang sau này dùng, nên dựng đúng ngay từ đầu.
 *
 * CHỮ TRUYỀN TỪ SERVER XUỐNG (`t`, `common`), không tự đọc catalog: một client component
 * `import` catalog sẽ kéo CẢ HAI bản dịch vào bundle gửi về trình duyệt, và bundle đó lớn
 * dần theo số ngôn ngữ. Server đã biết locale nên chỉ gửi phần cần dùng.
 *
 * PHÂN BIỆT EMAIL VỚI TRẠNG THÁI XÁC MINH (phase-2 mục 10): giao diện KHÔNG được gợi ý
 * email là khóa định danh. Định danh thật là cặp (issuer, subject) — xem
 * docs/identity-provider.md mục 6.
 */
export function AccountView({
  t,
  profile,
  common,
  sessionsHref,
  surveyHref,
  signInHref,
}: {
  t: Messages['account'];
  profile: Messages['profilePage'];
  common: Messages['common'];
  sessionsHref: string;
  surveyHref: string;
  /** Đích khi phiên hết hạn. Dựng ở server vì nó phải mang `returnTo` đã encode đúng locale. */
  signInHref: string;
}) {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccount(await api.get<AccountData>('/me/account'));
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        // Phiên hết hạn → đưa về đăng nhập, kèm đường quay lại đúng trang này.
        window.location.href = signInHref;
        return;
      }
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [signInHref, t.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="stack">
      <h1 className="typeH2">{t.title}</h1>

      {/* aria-live để trình đọc màn hình thông báo khi trạng thái đổi mà không đổi focus. */}
      <div aria-live="polite">
        {loading ? <p className="typeBody textSecondary">{common.loading}</p> : null}

        {error ? (
          <div className="notice" role="alert">
            <p className="typeBody">{error}</p>
            <button type="button" className="typeBody" onClick={() => void load()}>
              {common.retry}
            </button>
          </div>
        ) : null}
      </div>

      {account && !loading ? (
        <>
          <div className={styles.card}>
            <dl className={styles.fields}>
              <dt className={`typeBodySmall ${styles.label}`}>{t.email}</dt>
              <dd className={`typeBody ${styles.value}`}>
                {account.email ?? <span className={styles.empty}>{t.emailEmpty}</span>}
              </dd>

              <dt className={`typeBodySmall ${styles.label}`}>{t.emailVerification}</dt>
              <dd className={`typeBody ${styles.value}`}>
                <span className={`${styles.badge} ${account.emailVerified ? styles.badgeOk : ''}`}>
                  {account.emailVerified ? t.verified : t.unverified}
                </span>
              </dd>

              <dt className={`typeBodySmall ${styles.label}`}>{t.status}</dt>
              <dd className={`typeBody ${styles.value}`}>{statusLabel(account.status, t)}</dd>

              <dt className={`typeBodySmall ${styles.label}`}>{t.createdAt}</dt>
              <dd className={`typeBody ${styles.value}`}>{formatDateTime(account.createdAt)}</dd>
            </dl>
          </div>

          <p className="typeBodySmall textSecondary">{t.idpNote}</p>

          <ProfileForm account={account} onSaved={setAccount} t={t} signInHref={signInHref} />

          {/*
            BA TRƯỜNG CHƯA LƯU ĐƯỢC: tên người dùng, giới thiệu, ảnh đại diện.
            `control_plane.accounts` không có cột nào cho chúng, và thêm cột là quyết định
            sản phẩm chưa có (username có duy nhất không? có công khai không?) — không tự bịa.
            Render `disabled` để đánh giá được bố cục mà không hứa suông.
          */}
          <p className={`typeBodySmall ${shared.notReady}`}>{profile.fieldsNotReady}</p>

          <section className={shared.card} aria-labelledby="general-heading">
            <h2 className="typeH3" id="general-heading">
              {profile.general}
            </h2>
            <div className={shared.grid}>
              <div className={shared.field}>
                <label className="typeBodySmall" htmlFor="profile-theme">
                  {profile.theme}
                </label>
                {/*
                  CHỈ có Light. `globals.css` khoá `color-scheme: light` và bảng màu dark chưa
                  được cung cấp (C4) — đưa Dark vào danh sách là hứa một thứ không tồn tại.
                */}
                <select id="profile-theme" className={`typeBody ${shared.select}`} disabled>
                  <option>{profile.themeLight}</option>
                </select>
                <p className={`typeCaption ${shared.lead}`}>{profile.themeNotReady}</p>
              </div>
            </div>
          </section>

          <section className={shared.card} aria-labelledby="connected-heading">
            <h2 className="typeH3" id="connected-heading">
              {profile.connectedAccount}
            </h2>
            {/*
              Liên kết social do Logto sở hữu (identity-provider.md §5). Talosmine chưa có
              đường đọc hay gỡ nó, nên chỉ nói đúng chừng đó thay vì hiển thị trạng thái đoán.
            */}
            <p className={`typeBodySmall ${shared.notReady}`}>{profile.connectedNotReady}</p>
          </section>

          <div className={styles.actions}>
            <Link className="typeBody" href={sessionsHref}>
              {t.viewSessions}
            </Link>
            <Link className="typeBody" href={surveyHref}>
              {t.viewSurveyAnswers}
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

function statusLabel(status: AccountData['status'], t: Messages['account']): string {
  if (status === 'active') return t.statusActive;
  if (status === 'pending') return t.statusPending;
  return t.statusDisabled;
}

/**
 * Định dạng theo locale/timezone CỦA TRÌNH DUYỆT.
 *
 * Không tự ghép chuỗi ngày giờ: người dùng ở múi giờ khác sẽ đọc sai thời điểm, và đây
 * là dữ liệu bảo mật (phiên đăng nhập lúc nào) nên đọc sai là vấn đề thật.
 *
 * Cố ý truyền `undefined` thay vì locale của trang: đây là THỜI ĐIỂM, và người dùng đọc
 * ngày giờ theo thói quen hệ điều hành của họ, không theo ngôn ngữ đang xem trang.
 */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}
