'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  type AdminAssignmentView,
  type AdminRoleView,
  ApiError,
  api,
} from '../../../lib/api-client';
import styles from './page.module.css';

/**
 * Vai trò & phân quyền quản trị.
 *
 * Màn hình này thể hiện DENY-BY-DEFAULT: không có vai trò mặc định, không có super-admin
 * ngầm. Muốn làm gì cũng phải có một assignment còn hiệu lực trỏ tới role có permission
 * tương ứng.
 *
 * Assignment đã thu hồi VẪN hiển thị (mờ đi). Lịch sử "ai từng có quyền gì, ai thu hồi,
 * vì sao" là toàn bộ giá trị của bảng này — giấu đi thì không còn đối soát được.
 */
export default function AdminRolesPage() {
  const [roles, setRoles] = useState<AdminRoleView[]>([]);
  const [assignments, setAssignments] = useState<AdminAssignmentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const [roleId, setRoleId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [reason, setReason] = useState('');

  const noticeRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roleList, assignmentList] = await Promise.all([
        api.get<AdminRoleView[]>('/admin/rbac/roles'),
        api.get<AdminAssignmentView[]>('/admin/rbac/assignments'),
      ]);
      setRoles(roleList);
      setAssignments(assignmentList);
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        window.location.href = '/auth?returnTo=%2Fadmin%2Froles';
        return;
      }
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu phân quyền.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(event: FormEvent) {
    event.preventDefault();
    if (roleId === '' || accountId.trim() === '' || reason.trim() === '') return;

    setPending('assign');
    setError(null);
    setNotice(null);
    try {
      await api.post('/admin/rbac/assignments', {
        roleId,
        accountId: accountId.trim(),
        reason: reason.trim(),
      });
      setNotice('Đã cấp vai trò.');
      setAccountId('');
      setReason('');
      await load();
      noticeRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không cấp được vai trò.');
    } finally {
      setPending(null);
    }
  }

  async function revoke(assignment: AdminAssignmentView) {
    const why = window.prompt(
      `Thu hồi vai trò "${assignment.roleKey}" khỏi tài khoản này?\nNhập lý do (bắt buộc):`,
    );
    if (why === null || why.trim() === '') return;

    setPending(assignment.id);
    setError(null);
    setNotice(null);
    try {
      await api.delete(`/admin/rbac/assignments/${assignment.id}`, { reason: why.trim() });
      setNotice('Đã thu hồi vai trò.');
      await load();
      noticeRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thu hồi được.');
    } finally {
      setPending(null);
    }
  }

  const activeRoles = roles.filter((role) => role.status === 'active');
  const canSubmit =
    roleId !== '' && accountId.trim() !== '' && reason.trim() !== '' && pending === null;

  return (
    <div className="stack">
      <h1 className="typeH1">Vai trò & phân quyền</h1>

      <p className="typeBody textSecondary">
        Mặc định từ chối: không có vai trò nào được cấp tự động. Bạn chỉ cấp được những quyền mà
        chính bạn đang có.
      </p>

      <div aria-live="polite" tabIndex={-1} ref={noticeRef}>
        {loading ? <p className="typeBody textSecondary">Đang tải…</p> : null}
        {notice ? <p className="typeBody">{notice}</p> : null}
        {error ? (
          <div className="notice" role="alert">
            <p className="typeBody">{error}</p>
          </div>
        ) : null}
      </div>

      {!loading ? (
        <>
          <section className={styles.section} aria-labelledby="roles-heading">
            <h2 className="typeH3" id="roles-heading">
              Vai trò
            </h2>

            {roles.length === 0 ? (
              <p className={`typeBody ${styles.empty}`}>Chưa có vai trò nào.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={`typeBodySmall ${styles.table}`}>
                  <caption className="typeBodySmall">{roles.length} vai trò</caption>
                  <thead>
                    <tr>
                      <th scope="col">Mã</th>
                      <th scope="col">Tên hiển thị</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">Quyền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((role) => (
                      <tr key={role.id}>
                        <td className={styles.mono}>{role.key}</td>
                        <td>{role.displayName}</td>
                        <td>{role.status === 'active' ? 'Đang dùng' : 'Vô hiệu hoá'}</td>
                        <td>
                          <span className={styles.permList}>
                            {role.permissions.map((permission) => (
                              <span key={permission} className={`typeCaption ${styles.perm}`}>
                                {permission}
                              </span>
                            ))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.section} aria-labelledby="assign-heading">
            <h2 className="typeH3" id="assign-heading">
              Cấp vai trò
            </h2>

            <form className={styles.form} onSubmit={(e) => void assign(e)}>
              <div className={styles.formRow}>
                <div className={styles.field}>
                  <label className="typeBodySmall" htmlFor="role">
                    Vai trò
                  </label>
                  <select
                    id="role"
                    className={`typeBody ${styles.select}`}
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                  >
                    <option value="">— Chọn vai trò —</option>
                    {activeRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.displayName} ({role.key})
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.field}>
                  <label className="typeBodySmall" htmlFor="account">
                    ID tài khoản
                  </label>
                  <input
                    id="account"
                    className={`typeBody ${styles.input}`}
                    type="text"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    placeholder="019f7e6e-…"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className="typeBodySmall" htmlFor="assign-reason">
                  Lý do (bắt buộc — được ghi vào nhật ký kiểm toán)
                </label>
                <input
                  id="assign-reason"
                  className={`typeBody ${styles.input}`}
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ví dụ: bổ nhiệm nhân sự hỗ trợ"
                  autoComplete="off"
                />
              </div>

              <div>
                <button type="submit" className={`typeBody ${styles.button}`} disabled={!canSubmit}>
                  {pending === 'assign' ? 'Đang cấp…' : 'Cấp vai trò'}
                </button>
              </div>
            </form>
          </section>

          <section className={styles.section} aria-labelledby="assignments-heading">
            <h2 className="typeH3" id="assignments-heading">
              Đã cấp
            </h2>

            {assignments.length === 0 ? (
              <p className={`typeBody ${styles.empty}`}>Chưa cấp vai trò cho ai.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={`typeBodySmall ${styles.table}`}>
                  <caption className="typeBodySmall">
                    {assignments.filter((a) => a.revokedAt === null).length} đang hiệu lực trên tổng
                    số {assignments.length}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Tài khoản</th>
                      <th scope="col">Vai trò</th>
                      <th scope="col">Từ</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">
                        <span className="visuallyHidden">Hành động</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((assignment) => {
                      const revoked = assignment.revokedAt !== null;
                      return (
                        <tr key={assignment.id} className={revoked ? styles.revoked : ''}>
                          <td>
                            {assignment.accountEmail ?? assignment.accountDisplayName ?? (
                              <span className={styles.mono}>
                                {assignment.accountId.slice(0, 8)}…
                              </span>
                            )}
                          </td>
                          <td className={styles.mono}>{assignment.roleKey}</td>
                          <td>{formatDate(assignment.validFrom)}</td>
                          <td>{revoked ? 'Đã thu hồi' : 'Đang hiệu lực'}</td>
                          <td>
                            {revoked ? null : (
                              <button
                                type="button"
                                className={`typeBodySmall ${styles.buttonSecondary}`}
                                onClick={() => void revoke(assignment)}
                                disabled={pending !== null}
                              >
                                {pending === assignment.id ? 'Đang thu hồi…' : 'Thu hồi'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}
