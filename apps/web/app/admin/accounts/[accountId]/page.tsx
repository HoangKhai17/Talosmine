'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import {
  type AdminAccountView,
  type AdminSessionView,
  ApiError,
  api,
} from '../../../../lib/api-client';
import {
  AdminTable,
  AdminTableBodyRow,
  AdminTableCaption,
  AdminTableCell,
  AdminTableHeadCell,
} from '../../_components/admin-table';
import styles from './page.module.css';

/**
 * Chi tiết tài khoản + hành động quản trị.
 *
 * MỌI MUTATION BẮT BUỘC CÓ LÝ DO (phase-2 mục 11). Ô nhập lý do không phải thủ tục hình
 * thức: nó đi thẳng vào `audit_events`, và là thứ duy nhất trả lời được "vì sao tài khoản
 * này bị khóa hồi tháng trước". Nút bị vô hiệu khi lý do trống — backend cũng từ chối,
 * nên đây chỉ là phản hồi sớm cho người dùng chứ không phải lớp kiểm soát.
 */
export default function AdminAccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = use(params);

  const [account, setAccount] = useState<AdminAccountView | null>(null);
  const [sessions, setSessions] = useState<AdminSessionView[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  const noticeRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await api.get<AdminAccountView>(`/admin/accounts/${accountId}`);
      setAccount(detail);

      // Danh sách phiên cần permission RIÊNG (`session:revoke`). Người chỉ có
      // `account:read` vẫn xem được chi tiết — phần phiên đơn giản là trống.
      try {
        setSessions(await api.get<AdminSessionView[]>(`/admin/accounts/${accountId}/sessions`));
      } catch {
        setSessions([]);
      }
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        window.location.href = '/auth?returnTo=%2Fadmin';
        return;
      }
      setError(err instanceof Error ? err.message : 'Không tải được tài khoản.');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(action: 'disable' | 'enable' | 'revoke-sessions', confirmText: string) {
    if (reason.trim() === '') return;
    if (!window.confirm(confirmText)) return;

    setPending(action);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/admin/accounts/${accountId}/${action}`, { reason: reason.trim() });
      setNotice(successMessage(action));
      setReason('');
      await load();
      noticeRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thao tác thất bại.');
    } finally {
      setPending(null);
    }
  }

  const reasonMissing = reason.trim() === '';
  const activeSessions = sessions.filter((s) => s.revokedAt === null).length;

  return (
    <div className="stack">
      <p className="typeBodySmall">
        <Link href="/admin">← Về tìm kiếm</Link>
      </p>

      <h1 className="typeH1">Chi tiết tài khoản</h1>

      <div aria-live="polite" tabIndex={-1} ref={noticeRef}>
        {loading ? <p className="typeBody textSecondary">Đang tải…</p> : null}
        {notice ? <p className="typeBody">{notice}</p> : null}
        {error ? (
          <div className="notice" role="alert">
            <p className="typeBody">{error}</p>
          </div>
        ) : null}
      </div>

      {account && !loading ? (
        <>
          <div className={styles.card}>
            <dl className={styles.fields}>
              <dt className={`typeBodySmall ${styles.label}`}>ID</dt>
              <dd className={`typeBodySmall ${styles.value} ${styles.mono}`}>{account.id}</dd>

              <dt className={`typeBodySmall ${styles.label}`}>Email</dt>
              <dd className={`typeBody ${styles.value}`}>{account.email ?? '—'}</dd>

              <dt className={`typeBodySmall ${styles.label}`}>Xác minh email</dt>
              <dd className={`typeBody ${styles.value}`}>
                {account.emailVerified ? 'Đã xác minh' : 'Chưa xác minh'}
              </dd>

              <dt className={`typeBodySmall ${styles.label}`}>Tên hiển thị</dt>
              <dd className={`typeBody ${styles.value}`}>{account.displayName ?? '—'}</dd>

              <dt className={`typeBodySmall ${styles.label}`}>Trạng thái</dt>
              <dd className={`typeBody ${styles.value}`}>
                <span className={styles.tag}>{statusLabel(account.status)}</span>
              </dd>

              {account.disabledAt ? (
                <>
                  <dt className={`typeBodySmall ${styles.label}`}>Khóa lúc</dt>
                  <dd className={`typeBody ${styles.value}`}>
                    {formatDateTime(account.disabledAt)}
                  </dd>
                </>
              ) : null}

              <dt className={`typeBodySmall ${styles.label}`}>Ngày tạo</dt>
              <dd className={`typeBody ${styles.value}`}>{formatDateTime(account.createdAt)}</dd>
            </dl>
          </div>

          <section className={styles.actions} aria-labelledby="actions-heading">
            <h2 className="typeH3" id="actions-heading">
              Hành động quản trị
            </h2>

            <div className={styles.field}>
              <label className="typeBodySmall" htmlFor="reason">
                Lý do (bắt buộc — được ghi vào nhật ký kiểm toán)
              </label>
              <input
                id="reason"
                className={`typeBody ${styles.input}`}
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ví dụ: yêu cầu từ ticket #123"
                autoComplete="off"
              />
            </div>

            <div className={styles.actionRow}>
              {account.status === 'disabled' ? (
                <button
                  type="button"
                  className={`typeBody ${styles.button}`}
                  disabled={reasonMissing || pending !== null}
                  onClick={() =>
                    void mutate(
                      'enable',
                      'Mở khóa tài khoản này? Người dùng sẽ đăng nhập lại được.',
                    )
                  }
                >
                  {pending === 'enable' ? 'Đang mở khóa…' : 'Mở khóa tài khoản'}
                </button>
              ) : (
                <button
                  type="button"
                  className={`typeBody ${styles.button}`}
                  disabled={reasonMissing || pending !== null}
                  onClick={() =>
                    void mutate(
                      'disable',
                      'Khóa tài khoản này? Mọi phiên sẽ bị thu hồi và người dùng không đăng nhập lại được.',
                    )
                  }
                >
                  {pending === 'disable' ? 'Đang khóa…' : 'Khóa tài khoản'}
                </button>
              )}

              <button
                type="button"
                className={`typeBody ${styles.button}`}
                disabled={reasonMissing || pending !== null || activeSessions === 0}
                onClick={() =>
                  void mutate(
                    'revoke-sessions',
                    'Thu hồi mọi phiên của tài khoản này? Họ sẽ bị đăng xuất khỏi mọi thiết bị.',
                  )
                }
              >
                {pending === 'revoke-sessions' ? 'Đang thu hồi…' : 'Thu hồi mọi phiên'}
              </button>
            </div>

            {reasonMissing ? (
              <p className="typeBodySmall textSecondary">Nhập lý do để bật các nút hành động.</p>
            ) : null}
          </section>

          <section aria-labelledby="sessions-heading" className={`stack ${styles.sessionsSection}`}>
            <h2 className="typeH3" id="sessions-heading">
              Phiên đăng nhập
            </h2>

            {sessions.length === 0 ? (
              <p className="typeBody textSecondary">
                Không có phiên nào, hoặc bạn không có quyền xem phần này.
              </p>
            ) : (
              <AdminTable minWidth="narrow">
                  <AdminTableCaption className="typeBodySmall">
                    {activeSessions} phiên còn hiệu lực trên tổng số {sessions.length}
                  </AdminTableCaption>
                  <thead>
                    <tr>
                      <AdminTableHeadCell scope="col">Tạo lúc</AdminTableHeadCell>
                      <AdminTableHeadCell scope="col">Hoạt động gần nhất</AdminTableHeadCell>
                      <AdminTableHeadCell scope="col">Hết hạn</AdminTableHeadCell>
                      <AdminTableHeadCell scope="col">Trạng thái</AdminTableHeadCell>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <AdminTableBodyRow key={session.id}>
                        <AdminTableCell>{formatDateTime(session.createdAt)}</AdminTableCell>
                        <AdminTableCell>{formatDateTime(session.lastSeenAt)}</AdminTableCell>
                        <AdminTableCell>{formatDateTime(session.expiresAt)}</AdminTableCell>
                        <AdminTableCell>
                          {session.revokedAt ? (
                            <span className={styles.revoked}>Đã thu hồi</span>
                          ) : (
                            'Đang hoạt động'
                          )}
                        </AdminTableCell>
                      </AdminTableBodyRow>
                    ))}
                  </tbody>
              </AdminTable>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function successMessage(action: string): string {
  if (action === 'disable') return 'Đã khóa tài khoản và thu hồi mọi phiên.';
  if (action === 'enable') return 'Đã mở khóa tài khoản.';
  return 'Đã thu hồi mọi phiên.';
}

function statusLabel(status: string): string {
  if (status === 'active') return 'Đang hoạt động';
  if (status === 'pending') return 'Chờ kích hoạt';
  if (status === 'disabled') return 'Đã khóa';
  return status;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}
