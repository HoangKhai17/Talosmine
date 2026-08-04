'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { type AdminAccountView, ApiError, api } from '../../lib/api-client';
import {
  AdminTable,
  AdminTableBodyRow,
  AdminTableCaption,
  AdminTableCell,
  AdminTableHeadCell,
} from './_components/admin-table';
import styles from './page.module.css';

/**
 * Màn hình tra cứu tài khoản cho nhân viên hỗ trợ.
 *
 * CỐ Ý KHÔNG tải sẵn danh sách khi vào trang: đây là công cụ tra một người cụ thể, không
 * phải để duyệt toàn bộ người dùng. Backend cũng trả rỗng khi query rỗng — hai bên cùng
 * một quan điểm, không phải chỉ giao diện tự giới hạn.
 */
export default function AdminAccountsPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminAccountView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();

    const term = query.trim();
    if (term === '') return;

    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ items: AdminAccountView[] }>(
        `/admin/accounts?query=${encodeURIComponent(term)}`,
      );
      setResults(data.items);
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        window.location.href = '/auth?returnTo=%2Fadmin';
        return;
      }
      setError(err instanceof Error ? err.message : 'Không tìm được.');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <h1 className="typeH1">Tài khoản</h1>

      <form className={styles.searchForm} onSubmit={(e) => void search(e)}>
        <div className={styles.field}>
          <label className="typeBodySmall" htmlFor="admin-search">
            Tìm theo email, tên hiển thị hoặc ID tài khoản
          </label>
          <input
            id="admin-search"
            className={`typeBody ${styles.input}`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="nguoidung@example.com"
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          className={`typeBody ${styles.button}`}
          disabled={loading || query.trim() === ''}
        >
          {loading ? 'Đang tìm…' : 'Tìm'}
        </button>
      </form>

      <div aria-live="polite">
        {error ? (
          <div className="notice" role="alert">
            <p className="typeBody">{error}</p>
          </div>
        ) : null}

        {results !== null && results.length === 0 && !loading ? (
          <p className={`typeBody ${styles.empty}`}>Không có tài khoản nào khớp.</p>
        ) : null}
      </div>

      {results !== null && results.length > 0 ? (
        <AdminTable>
            <AdminTableCaption className="typeBodySmall">
              {results.length} kết quả
            </AdminTableCaption>
            <thead>
              <tr>
                <AdminTableHeadCell scope="col">Email</AdminTableHeadCell>
                <AdminTableHeadCell scope="col">Tên hiển thị</AdminTableHeadCell>
                <AdminTableHeadCell scope="col">Trạng thái</AdminTableHeadCell>
                <AdminTableHeadCell scope="col">Ngày tạo</AdminTableHeadCell>
                <AdminTableHeadCell scope="col">
                  <span className="visuallyHidden">Hành động</span>
                </AdminTableHeadCell>
              </tr>
            </thead>
            <tbody>
              {results.map((account) => (
                <AdminTableBodyRow key={account.id}>
                  <AdminTableCell className={styles.mono}>{account.email ?? '—'}</AdminTableCell>
                  <AdminTableCell>{account.displayName ?? '—'}</AdminTableCell>
                  <AdminTableCell>
                    <span className={styles.tag}>{statusLabel(account.status)}</span>
                  </AdminTableCell>
                  <AdminTableCell>{formatDate(account.createdAt)}</AdminTableCell>
                  <AdminTableCell>
                    <Link className="typeBodySmall" href={`/admin/accounts/${account.id}`}>
                      Xem chi tiết
                    </Link>
                  </AdminTableCell>
                </AdminTableBodyRow>
              ))}
            </tbody>
        </AdminTable>
      ) : null}
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === 'active') return 'Đang hoạt động';
  if (status === 'pending') return 'Chờ kích hoạt';
  if (status === 'disabled') return 'Đã khóa';
  return status;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}
