'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { format, type Messages } from '../../../../../i18n/messages';
import { ApiError, api, type SessionView } from '../../../../../lib/api-client';
import styles from './page.module.css';

/**
 * Trang "các phiên đăng nhập" — thiết bị nào đang đăng nhập, và thu hồi phiên nào.
 *
 * Đây là trang chứng minh hạ tầng phiên hoạt động thật: thu hồi ở đây làm phiên chết
 * NGAY trong database, không phải chỉ xoá cookie ở máy này.
 *
 * KHÔNG hiển thị token hay hash (phase-2 mục 11) — API cũng không trả về chúng.
 *
 * Chữ và href truyền từ server xuống; xem ghi chú ở `account-view.tsx`.
 */
export function SessionsView({
  t,
  common,
  actionsLabel,
  accountHref,
  signInHref,
  signInPlainHref,
}: {
  t: Messages['sessions'];
  common: Messages['common'];
  /** Nhãn ẩn của cột hành động — chỉ trình đọc màn hình nghe thấy. */
  actionsLabel: string;
  accountHref: string;
  signInHref: string;
  /** Đích sau khi thu hồi TẤT CẢ: không kèm `returnTo` vì phiên hiện tại cũng vừa chết. */
  signInPlainHref: string;
}) {
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Đưa focus về vùng thông báo sau khi thu hồi xong, để người dùng bàn phím và trình đọc
  // màn hình biết kết quả thay vì bị bỏ lại ở một nút vừa biến mất.
  const noticeRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions(await api.get<SessionView[]>('/me/account/sessions'));
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
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

  async function revokeOne(session: SessionView) {
    if (!window.confirm(t.confirmRevokeOne)) return;

    setPendingId(session.id);
    setError(null);
    setNotice(null);
    try {
      await api.delete(`/me/account/sessions/${session.id}`);
      setNotice(t.revokedOne);
      await load();
      noticeRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.revokeFailed);
    } finally {
      setPendingId(null);
    }
  }

  async function revokeAll() {
    if (!window.confirm(t.confirmRevokeAll)) return;

    setPendingId('all');
    setError(null);
    try {
      await api.delete('/me/account/sessions/all');
      // Phiên hiện tại cũng vừa bị thu hồi → không ở lại trang này được nữa.
      window.location.href = signInPlainHref;
    } catch (err) {
      setError(err instanceof Error ? err.message : t.revokeAllFailed);
      setPendingId(null);
    }
  }

  const activeCount = sessions.filter((s) => s.revokedAt === null).length;

  return (
    <div className="container section stack">
      <h1 className="typeH1">{t.title}</h1>

      <p className="typeBody textSecondary">{t.lead}</p>

      <div aria-live="polite" tabIndex={-1} ref={noticeRef}>
        {loading ? <p className="typeBody textSecondary">{common.loading}</p> : null}
        {notice ? <p className="typeBody">{notice}</p> : null}
        {error ? (
          <div className="notice" role="alert">
            <p className="typeBody">{error}</p>
            <button type="button" className="typeBody" onClick={() => void load()}>
              {common.retry}
            </button>
          </div>
        ) : null}
      </div>

      {!loading && sessions.length === 0 ? (
        <p className={`typeBody ${styles.empty}`}>{t.empty}</p>
      ) : null}

      {!loading && sessions.length > 0 ? (
        <>
          <div className={styles.tableWrap}>
            <table className={`typeBodySmall ${styles.table}`}>
              <caption className="typeBodySmall">
                {format(t.caption, { active: activeCount, total: sessions.length })}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t.colCreatedAt}</th>
                  <th scope="col">{t.colLastSeen}</th>
                  <th scope="col">{t.colExpires}</th>
                  <th scope="col">{t.colStatus}</th>
                  <th scope="col">
                    <span className="visuallyHidden">{actionsLabel}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const isRevoked = session.revokedAt !== null;
                  return (
                    <tr key={session.id} className={session.current ? styles.currentRow : ''}>
                      <td>{formatDateTime(session.createdAt)}</td>
                      <td>{formatDateTime(session.lastSeenAt)}</td>
                      <td>{formatDateTime(session.expiresAt)}</td>
                      <td>
                        {isRevoked ? (
                          <span className={styles.revoked}>{t.revoked}</span>
                        ) : session.current ? (
                          <span className={styles.tag}>{t.thisDevice}</span>
                        ) : (
                          t.active
                        )}
                      </td>
                      <td>
                        {isRevoked || session.current ? null : (
                          <button
                            type="button"
                            className={`typeBodySmall ${styles.revokeButton}`}
                            onClick={() => void revokeOne(session)}
                            disabled={pendingId !== null}
                          >
                            {pendingId === session.id ? t.revoking : t.revoke}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.dangerZone}>
            <button
              type="button"
              className={`typeBody ${styles.revokeButton}`}
              onClick={() => void revokeAll()}
              disabled={pendingId !== null}
            >
              {pendingId === 'all' ? t.revokingAll : t.revokeAll}
            </button>
            <span className="typeBodySmall textSecondary">{t.revokeAllNote}</span>
          </div>
        </>
      ) : null}

      <p>
        <Link className="typeBody" href={accountHref}>
          {t.backToAccount}
        </Link>
      </p>
    </div>
  );
}

/** Xem ghi chú ở `account-view.tsx` — ngày giờ theo thói quen hệ điều hành, không theo trang. */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}
