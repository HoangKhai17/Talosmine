'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { type AdminApplicationView, ApiError, api } from '../../../lib/api-client';
import styles from './page.module.css';
import { StatusBadge } from './status-badge';

/**
 * Danh mục ứng dụng — danh sách và tạo mới.
 *
 * BA ĐIỀU CHI PHỐI TOÀN BỘ MÀN HÌNH NÀY:
 *
 * 1. `key` BẤT BIẾN. Nó là thứ mà entitlement, quota và audit sẽ tham chiếu tới. Đổi được
 *    `key` nghĩa là mọi dữ liệu lịch sử trỏ sai đối tượng. Vì vậy nó chỉ nhập được LÚC TẠO,
 *    và sau đó không có ô nào để sửa — không phải "khoá lại", mà là không tồn tại.
 *
 * 2. KHÔNG XOÁ. Không có nút xoá ở bất kỳ đâu. Vòng đời đi bằng trạng thái:
 *    `draft → active ⇄ inactive`. Xoá một ứng dụng đã được tham chiếu sẽ để lại dữ liệu mồ
 *    côi ở những bảng chưa tồn tại.
 *
 * 3. MỌI THAY ĐỔI CẦN LÝ DO. Ô lý do không phải thủ tục: nó đi thẳng vào `audit_events` và
 *    là thứ duy nhất trả lời được "vì sao ứng dụng này bị tắt hồi tháng trước". Nút bị vô
 *    hiệu khi lý do trống — backend cũng từ chối, nên đây chỉ là phản hồi sớm.
 *
 * Ứng dụng mới LUÔN ở trạng thái `draft`. Người dùng cuối không thấy nó cho tới khi có ai
 * đó chủ động kích hoạt, và kích hoạt cần quyền `catalog:publish` riêng.
 */
export default function AdminCatalogPage() {
  const [applications, setApplications] = useState<AdminApplicationView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [key, setKey] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [launchUrl, setLaunchUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [reason, setReason] = useState('');

  const noticeRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApplications(await api.get<AdminApplicationView[]>('/admin/catalog/applications'));
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        window.location.href = '/auth?returnTo=%2Fadmin%2Fcatalog';
        return;
      }
      setError(err instanceof Error ? err.message : 'Không tải được danh mục ứng dụng.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await api.post('/admin/catalog/applications', {
        key: key.trim().toLowerCase(),
        displayName: displayName.trim(),
        // Chuỗi rỗng gửi thành `null` để database chỉ có MỘT cách biểu diễn "không có".
        description: description.trim() === '' ? null : description.trim(),
        imageUrl: imageUrl.trim() === '' ? null : imageUrl.trim(),
        launchUrl: launchUrl.trim(),
        reason: reason.trim(),
      });
      setNotice(`Đã tạo ứng dụng "${key.trim()}" ở trạng thái nháp.`);
      setKey('');
      setDisplayName('');
      setDescription('');
      setLaunchUrl('');
      setImageUrl('');
      setReason('');
      await load();
      noticeRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được ứng dụng.');
    } finally {
      setPending(false);
    }
  }

  const canSubmit =
    key.trim() !== '' &&
    displayName.trim() !== '' &&
    launchUrl.trim() !== '' &&
    reason.trim() !== '' &&
    !pending;

  return (
    <div className="stack">
      <h1 className="typeH1">Danh mục ứng dụng</h1>

      <p className="typeBody textSecondary">
        Ứng dụng ở đây là những gì Hub biết tới. Thấy một ứng dụng trong danh mục KHÔNG có nghĩa là
        người dùng được phép dùng nó — quyền sử dụng thuộc về phần gói dịch vụ, làm ở giai đoạn sau.
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
          <section className={styles.section} aria-labelledby="apps-heading">
            <h2 className="typeH3" id="apps-heading">
              Ứng dụng
            </h2>

            {applications.length === 0 ? (
              <p className={`typeBody ${styles.empty}`}>
                Chưa có ứng dụng nào. Danh sách ứng dụng của Hub còn chờ chủ dự án chốt.
              </p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={`typeBodySmall ${styles.table}`}>
                  <caption className="typeBodySmall">
                    {applications.length} ứng dụng ·{' '}
                    {applications.filter((a) => a.status === 'active').length} đang hoạt động
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Mã</th>
                      <th scope="col">Tên hiển thị</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">URL mở ứng dụng</th>
                      <th scope="col">
                        <span className="visuallyHidden">Hành động</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((application) => (
                      <tr key={application.id}>
                        <td className={styles.mono}>{application.key}</td>
                        <td>{application.displayName}</td>
                        <td>
                          <StatusBadge status={application.status} />
                        </td>
                        {/* URL dài không được đẩy bảng tràn ngang — xem `.urlCell`. */}
                        <td className={`${styles.mono} ${styles.urlCell}`}>
                          {application.launchUrl}
                        </td>
                        <td>
                          <Link
                            className={`typeBodySmall ${styles.link}`}
                            href={`/admin/catalog/${application.id}`}
                          >
                            Quản lý
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.section} aria-labelledby="create-heading">
            <h2 className="typeH3" id="create-heading">
              Thêm ứng dụng
            </h2>

            <form className={styles.form} onSubmit={(e) => void create(e)}>
              <div className={styles.field}>
                <label className="typeBodySmall" htmlFor="app-key">
                  Mã ứng dụng (không đổi được sau khi tạo)
                </label>
                <input
                  id="app-key"
                  className={`typeBody ${styles.input} ${styles.mono}`}
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="vi-du-ung-dung"
                  pattern="[a-z][a-z0-9\-]*"
                  maxLength={64}
                  autoComplete="off"
                  aria-describedby="app-key-hint"
                />
                <p id="app-key-hint" className={`typeCaption ${styles.hint}`}>
                  Chữ thường, số và dấu gạch ngang; bắt đầu bằng chữ. Đây là thứ mà quyền sử dụng và
                  nhật ký sẽ tham chiếu tới, nên nó vĩnh viễn không đổi và không được dùng lại cho
                  ứng dụng khác.
                </p>
              </div>

              <div className={styles.field}>
                <label className="typeBodySmall" htmlFor="app-name">
                  Tên hiển thị
                </label>
                <input
                  id="app-name"
                  className={`typeBody ${styles.input}`}
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={120}
                  autoComplete="off"
                />
              </div>

              <div className={styles.field}>
                <label className="typeBodySmall" htmlFor="app-description">
                  Mô tả (không bắt buộc)
                </label>
                <textarea
                  id="app-description"
                  className={`typeBody ${styles.textarea}`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={3}
                />
              </div>

              <div className={styles.field}>
                <label className="typeBodySmall" htmlFor="app-launch">
                  URL mở ứng dụng
                </label>
                <input
                  id="app-launch"
                  className={`typeBody ${styles.input} ${styles.mono}`}
                  type="url"
                  value={launchUrl}
                  onChange={(e) => setLaunchUrl(e.target.value)}
                  placeholder="https://ung-dung.example.com/"
                  autoComplete="off"
                  aria-describedby="app-launch-hint"
                />
                <p id="app-launch-hint" className={`typeCaption ${styles.hint}`}>
                  Bắt buộc HTTPS và host phải nằm trong danh sách cho phép của máy chủ. Máy chủ kiểm
                  tra lại và tự phân giải DNS để chặn địa chỉ nội bộ — trình duyệt không có tiếng
                  nói gì ở đây.
                </p>
              </div>

              <div className={styles.field}>
                <label className="typeBodySmall" htmlFor="app-image">
                  URL ảnh (không bắt buộc)
                </label>
                <input
                  id="app-image"
                  className={`typeBody ${styles.input} ${styles.mono}`}
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://anh.example.com/logo.png"
                  autoComplete="off"
                  aria-describedby="app-image-hint"
                />
                {/*
                  CỐ Ý CHƯA CÓ Ô XEM TRƯỚC ẢNH. Render thẳng URL người dùng vừa gõ sẽ khiến
                  trình duyệt của quản trị viên gửi một request tới host đó ngay lập tức —
                  trước khi máy chủ kịp kiểm tra. Đó là cách rò rỉ IP và Referer của người
                  quản trị cho một địa chỉ chưa ai xác minh. Xem trước chỉ được làm với URL
                  ĐÃ LƯU, tức là đã qua chính sách.
                */}
                <p id="app-image-hint" className={`typeCaption ${styles.hint}`}>
                  Đi qua cùng chính sách với URL mở ứng dụng. Chưa có ô xem trước — xem trước một
                  URL chưa kiểm sẽ để lộ địa chỉ mạng của chính bạn cho host đó.
                </p>
              </div>

              <div className={styles.field}>
                <label className="typeBodySmall" htmlFor="app-reason">
                  Lý do (bắt buộc — được ghi vào nhật ký kiểm toán)
                </label>
                <input
                  id="app-reason"
                  className={`typeBody ${styles.input}`}
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ví dụ: đăng ký ứng dụng theo yêu cầu ngày 22/07"
                  autoComplete="off"
                />
              </div>

              <div>
                <button type="submit" className={`typeBody ${styles.button}`} disabled={!canSubmit}>
                  {pending ? 'Đang tạo…' : 'Tạo ứng dụng (trạng thái nháp)'}
                </button>
              </div>
            </form>
          </section>
        </>
      ) : null}
    </div>
  );
}
