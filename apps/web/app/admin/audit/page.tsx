'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, type AuditEventView, api } from '../../../lib/api-client';
import styles from './page.module.css';

/**
 * Nhật ký kiểm toán.
 *
 * Đây là màn hình trả lời "ai đã làm gì, lúc nào, vì sao" — thứ biến thao tác quản trị
 * thành có trách nhiệm. Không có nó thì việc khoá tài khoản hay thu hồi phiên là hành
 * động không ai truy được.
 *
 * CHỈ ĐỌC, và không thể khác: bảng `audit_events` bị trigger ở tầng database chặn mọi
 * UPDATE/DELETE, còn runtime role không có quyền TRUNCATE. Giao diện không cung cấp
 * đường sửa vì hạ tầng bên dưới cũng không cho phép.
 */
export default function AdminAuditPage() {
  const [events, setEvents] = useState<AuditEventView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextCursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : '';
      const data = await api.get<{ items: AuditEventView[]; nextCursor: string | null }>(
        `/admin/audit${query}`,
      );
      // Tải thêm thì NỐI vào cuối, không thay thế — người dùng đang đọc dở trang trước.
      setEvents((prev) => (nextCursor ? [...prev, ...data.items] : data.items));
      setCursor(data.nextCursor);
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        window.location.href = '/auth?returnTo=%2Fadmin%2Faudit';
        return;
      }
      setError(err instanceof Error ? err.message : 'Không tải được nhật ký.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="stack">
      <h1 className="typeH1">Nhật ký kiểm toán</h1>

      <p className="typeBody textSecondary">
        Mọi thao tác quản trị đều được ghi lại và không thể sửa hay xoá.
      </p>

      <div aria-live="polite">
        {loading && events.length === 0 ? (
          <p className="typeBody textSecondary">Đang tải…</p>
        ) : null}

        {error ? (
          <div className="notice" role="alert">
            <p className="typeBody">{error}</p>
            <button type="button" className="typeBody" onClick={() => void load()}>
              Thử lại
            </button>
          </div>
        ) : null}
      </div>

      {!loading && events.length === 0 && !error ? (
        <p className={`typeBody ${styles.empty}`}>Chưa có sự kiện nào.</p>
      ) : null}

      {events.length > 0 ? (
        <>
          <div className={styles.tableWrap}>
            <table className={`typeBodySmall ${styles.table}`}>
              <caption className="typeBodySmall">Đang hiển thị {events.length} sự kiện</caption>
              <thead>
                <tr>
                  <th scope="col">Thời điểm</th>
                  <th scope="col">Hành động</th>
                  <th scope="col">Người thực hiện</th>
                  <th scope="col">Đối tượng</th>
                  <th scope="col">Lý do</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDateTime(event.createdAt)}</td>
                    <td>
                      <span className={styles.action}>{event.action}</span>
                    </td>
                    <td>{actorLabel(event)}</td>
                    <td className={styles.mono}>
                      {event.targetId ? (
                        `${event.targetType} · ${event.targetId.slice(0, 8)}…`
                      ) : (
                        <span className={styles.muted}>{event.targetType}</span>
                      )}
                    </td>
                    <td>{event.reason ?? <span className={styles.muted}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.toolbar}>
            <button
              type="button"
              className={`typeBody ${styles.button}`}
              disabled={cursor === null || loading}
              onClick={() => cursor && void load(cursor)}
            >
              {loading ? 'Đang tải…' : cursor ? 'Tải thêm' : 'Đã hết'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Nhãn người thực hiện.
 *
 * `system` nghĩa là hệ thống tự làm (ví dụ tạo account lúc đăng nhập lần đầu, hoặc script
 * vận hành) — KHÔNG phải một người nào đó. Phân biệt rõ vì gán nhầm trách nhiệm cho người
 * là kết quả tệ nhất của một nhật ký kiểm toán.
 */
function actorLabel(event: AuditEventView): string {
  if (event.actorType === 'system') return 'Hệ thống';
  if (event.actorAccountId) return `${event.actorAccountId.slice(0, 8)}…`;
  return event.actorType;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium' }).format(
    date,
  );
}
