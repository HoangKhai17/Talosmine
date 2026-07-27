'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type SessionView } from '../../../../../lib/api-client';
import styles from './page.module.css';

/**
 * Trang "các phiên đăng nhập" — thiết bị nào đang đăng nhập, và thu hồi phiên nào.
 *
 * Đây là trang chứng minh hạ tầng phiên hoạt động thật: thu hồi ở đây làm phiên chết
 * NGAY trong database, không phải chỉ xoá cookie ở máy này.
 *
 * KHÔNG hiển thị token hay hash (phase-2 mục 11) — API cũng không trả về chúng.
 */
export default function SessionsPage() {
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
        window.location.href = '/auth?returnTo=%2Faccount%2Fsessions';
        return;
      }
      setError(err instanceof Error ? err.message : 'Không tải được danh sách phiên.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revokeOne(session: SessionView) {
    if (!window.confirm('Thu hồi phiên này? Thiết bị đó sẽ bị đăng xuất ngay.')) return;

    setPendingId(session.id);
    setError(null);
    setNotice(null);
    try {
      await api.delete(`/me/account/sessions/${session.id}`);
      setNotice('Đã thu hồi phiên.');
      await load();
      noticeRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thu hồi được phiên.');
    } finally {
      setPendingId(null);
    }
  }

  async function revokeAll() {
    if (
      !window.confirm('Đăng xuất khỏi MỌI thiết bị, kể cả thiết bị này? Bạn sẽ phải đăng nhập lại.')
    ) {
      return;
    }

    setPendingId('all');
    setError(null);
    try {
      await api.delete('/me/account/sessions/all');
      // Phiên hiện tại cũng vừa bị thu hồi → không ở lại trang này được nữa.
      window.location.href = '/auth';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đăng xuất được.');
      setPendingId(null);
    }
  }

  const activeCount = sessions.filter((s) => s.revokedAt === null).length;

  return (
    <div className="container section stack">
      <h1 className="typeH1">Phiên đăng nhập</h1>

      <p className="typeBody textSecondary">
        Danh sách thiết bị đang đăng nhập vào tài khoản của bạn. Nếu thấy phiên lạ, hãy thu hồi
        ngay.
      </p>

      <div aria-live="polite" tabIndex={-1} ref={noticeRef}>
        {loading ? <p className="typeBody textSecondary">Đang tải…</p> : null}
        {notice ? <p className="typeBody">{notice}</p> : null}
        {error ? (
          <div className="notice" role="alert">
            <p className="typeBody">{error}</p>
            <button type="button" className="typeBody" onClick={() => void load()}>
              Thử lại
            </button>
          </div>
        ) : null}
      </div>

      {!loading && sessions.length === 0 ? (
        <p className={`typeBody ${styles.empty}`}>Chưa có phiên nào.</p>
      ) : null}

      {!loading && sessions.length > 0 ? (
        <>
          <div className={styles.tableWrap}>
            <table className={`typeBodySmall ${styles.table}`}>
              <caption className="typeBodySmall">
                {activeCount} phiên còn hiệu lực trên tổng số {sessions.length}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Đăng nhập lúc</th>
                  <th scope="col">Hoạt động gần nhất</th>
                  <th scope="col">Hết hạn</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">
                    <span className="visuallyHidden">Hành động</span>
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
                          <span className={styles.revoked}>Đã thu hồi</span>
                        ) : session.current ? (
                          <span className={styles.tag}>Thiết bị này</span>
                        ) : (
                          'Đang hoạt động'
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
                            {pendingId === session.id ? 'Đang thu hồi…' : 'Thu hồi'}
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
              {pendingId === 'all' ? 'Đang đăng xuất…' : 'Đăng xuất khỏi mọi thiết bị'}
            </button>
            <span className="typeBodySmall textSecondary">
              Bao gồm cả thiết bị này — bạn sẽ phải đăng nhập lại.
            </span>
          </div>
        </>
      ) : null}

      <p>
        <Link className="typeBody" href="/account">
          Về trang tài khoản
        </Link>
      </p>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}
