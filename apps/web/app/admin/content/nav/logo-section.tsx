'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../lib/api-client';
import styles from './page.module.css';

/**
 * Logo website.
 *
 * CHỈ NHẬN URL, KHÔNG UPLOAD FILE. Object storage chưa được dựng (DEC-T12), nên chưa có chỗ
 * để nhận file. Quản trị viên dán URL của ảnh đã host sẵn; khi có storage thì thêm nút upload
 * ghi vào đúng trường này — schema và API không phải đổi.
 *
 * HAI RÀNG BUỘC phải nói rõ với người dùng, vì cả hai đều làm ảnh "biến mất" một cách khó hiểu:
 *   1. Host phải nằm trong allowlist (`CATALOG_ALLOWED_HOSTS`) — nếu không, server từ chối lưu.
 *   2. Host cũng phải có trong `img-src` của CSP — nếu không, server lưu được nhưng trình
 *      duyệt chặn ảnh. Hai danh sách này dùng CHUNG một biến môi trường nên chúng không lệch.
 */
export function LogoSection({
  pending,
  mutate,
}: {
  pending: boolean;
  mutate: (action: () => Promise<void>, success: string) => Promise<void>;
}) {
  const [current, setCurrent] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await api.get<{ logoUrl: string | null }>('/admin/site/settings');
      setCurrent(settings.logoUrl);
      setDraft(settings.logoUrl ?? '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canSave = reason.trim() !== '' && draft.trim() !== current;

  async function save(next: string | null, success: string) {
    await mutate(async () => {
      await api.patch('/admin/site/settings', { logoUrl: next, reason: reason.trim() });
      await load();
      setReason('');
    }, success);
  }

  return (
    <section className={styles.menu}>
      <h2 className="typeH3">Logo</h2>

      {loading ? (
        <p className="typeBodySmall textSecondary">Đang tải…</p>
      ) : (
        <>
          {current === null ? (
            <p className="typeBodySmall textSecondary">
              Chưa đặt logo. Header đang hiển thị tên thương hiệu bằng chữ.
            </p>
          ) : (
            /* Xem trước bằng chính URL đã lưu: nếu CSP chặn host này thì ô này cũng vỡ —
               người biên tập thấy vấn đề ngay tại đây thay vì phải mở trang công khai. */
            // biome-ignore lint/performance/noImgElement: URL do admin nhập lúc chạy, next/image cần host khai trước.
            <img className={styles.logoPreview} src={current} alt="Logo hiện tại" />
          )}

          <div className={styles.createGrid}>
            <label className="typeBodySmall">
              URL ảnh logo
              <input
                className={`typeBodySmall ${styles.input}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="https://…"
                maxLength={2048}
              />
            </label>

            <label className="typeBodySmall">
              Lý do
              <input
                className={`typeBodySmall ${styles.input}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
            </label>
          </div>

          <p className="typeCaption textSecondary">
            Dán URL ảnh đã host sẵn (<code>https://</code>) hoặc đường dẫn nội bộ bắt đầu bằng{' '}
            <code>/</code>. Host bên ngoài phải nằm trong danh sách được phép — chưa khai thì hệ
            thống từ chối lưu. Chưa có chức năng tải file lên.
          </p>

          <div className={styles.itemActions}>
            <button
              type="button"
              className={`typeBodySmall ${styles.button}`}
              onClick={() => void save(draft.trim(), 'Đã lưu logo.')}
              disabled={!canSave || pending}
            >
              Lưu logo
            </button>

            {current !== null ? (
              <button
                type="button"
                className={`typeCaption ${styles.linkButton}`}
                onClick={() => void save(null, 'Đã gỡ logo.')}
                disabled={reason.trim() === '' || pending}
              >
                Gỡ logo
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
