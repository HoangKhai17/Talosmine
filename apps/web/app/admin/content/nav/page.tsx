'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { type AdminNavItemView, ApiError, api } from '../../../../lib/api-client';
import styles from './page.module.css';

/**
 * Quản trị menu website — header và footer.
 *
 * BỐN ĐIỀU CHI PHỐI MÀN HÌNH NÀY:
 *
 * 1. **Vị trí menu là danh sách ĐÓNG.** Người biên tập chọn mục thuộc menu nào, nhưng không
 *    tạo được menu mới — thêm một vị trí đòi code phải có chỗ render nó (migration 0010).
 *
 * 2. **Mục mới luôn ở `draft`.** Đưa lên giao diện là nút riêng, cần quyền `content:publish`
 *    tách khỏi `content:manage`. Người sửa nhãn và người quyết định phát hành có thể là hai.
 *
 * 3. **MỌI thay đổi cần lý do.** Ô lý do đi thẳng vào `audit_events` và là thứ duy nhất trả
 *    lời được "vì sao mục này biến mất khỏi header tháng trước". Nút bị vô hiệu khi lý do
 *    trống — backend cũng từ chối, nên đây chỉ là phản hồi sớm.
 *
 * 4. **Thay đổi hiện ra sau tối đa 60 giây.** BFF cache điều hướng (DEC-T26). Màn hình phải
 *    NÓI RÕ điều đó, nếu không người biên tập sẽ bấm lưu vài lần vì tưởng không ăn.
 */

const MENUS = [
  { key: 'header.primary', label: 'Header — menu chính' },
  { key: 'footer.explore', label: 'Footer — Khám phá' },
  { key: 'footer.about', label: 'Footer — Về chúng tôi' },
  { key: 'footer.resources', label: 'Footer — Tài nguyên' },
] as const;

type MenuKey = (typeof MENUS)[number]['key'];

const STATUS_LABEL: Record<AdminNavItemView['status'], string> = {
  draft: 'Nháp',
  active: 'Đang hiện',
  inactive: 'Đã ẩn',
};

export default function AdminNavPage() {
  const [items, setItems] = useState<AdminNavItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const noticeRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.get<AdminNavItemView[]>('/admin/site/nav'));
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        window.location.href = '/auth?returnTo=%2Fadmin%2Fcontent%2Fnav';
        return;
      }
      setError(err instanceof Error ? err.message : 'Không tải được menu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Bọc mọi mutation: khoá nút, xoá thông báo cũ, tải lại, đưa focus về vùng thông báo. */
  async function mutate(action: () => Promise<void>, success: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await load();
      setNotice(success);
      noticeRef.current?.focus();
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        window.location.href = '/auth?returnTo=%2Fadmin%2Fcontent%2Fnav';
        return;
      }
      setError(err instanceof Error ? err.message : 'Không thực hiện được.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack">
      <h1 className="typeH1">Menu website</h1>

      <p className="typeBody textSecondary">
        Nhãn và đường dẫn của header và footer. Thay đổi hiện ra trên website{' '}
        <strong>trong vòng 60 giây</strong> — trang công khai giữ bản cũ trong thời gian đó.
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

      {!loading
        ? MENUS.map((menu) => (
            <MenuSection
              key={menu.key}
              menuKey={menu.key}
              label={menu.label}
              items={items.filter((i) => i.menuKey === menu.key)}
              pending={pending}
              mutate={mutate}
            />
          ))
        : null}
    </div>
  );
}

function MenuSection({
  menuKey,
  label,
  items,
  pending,
  mutate,
}: {
  menuKey: MenuKey;
  label: string;
  items: AdminNavItemView[];
  pending: boolean;
  mutate: (action: () => Promise<void>, success: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [href, setHref] = useState('');
  const [labelVi, setLabelVi] = useState('');
  const [labelEn, setLabelEn] = useState('');

  const canCreate = reason.trim() !== '' && href.trim() !== '' && labelVi.trim() !== '';

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!canCreate) return;

    await mutate(async () => {
      await api.post('/admin/site/nav', {
        menuKey,
        href: href.trim(),
        labels: { vi: labelVi.trim(), en: labelEn.trim() || null },
        reason: reason.trim(),
      });
      setHref('');
      setLabelVi('');
      setLabelEn('');
      setReason('');
    }, 'Đã thêm mục mới (đang ở trạng thái nháp).');
  }

  /**
   * Đổi chỗ hai mục liền kề.
   *
   * Gửi TRỌN danh sách theo thứ tự mới chứ không gửi "đổi chỗ A và B": backend nhận trọn
   * danh sách nên kết quả không phụ thuộc thứ tự request tới. Hai người sắp xếp cùng lúc
   * không tạo ra thứ tự lai giữa hai ý định.
   */
  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const reordered = [...items];
    const a = reordered[index];
    const b = reordered[target];
    if (!a || !b) return;
    reordered[index] = b;
    reordered[target] = a;

    await mutate(
      () =>
        api.post('/admin/site/nav/reorder', {
          menuKey,
          itemIds: reordered.map((i) => i.id),
          reason: 'Sắp xếp lại thứ tự menu',
        }),
      'Đã sắp xếp lại.',
    );
  }

  return (
    <section className={styles.menu}>
      <h2 className="typeH3">{label}</h2>

      {items.length === 0 ? (
        <p className="typeBodySmall textSecondary">
          Chưa có mục nào. Website đang dùng menu mặc định trong code.
        </p>
      ) : (
        <ul className={styles.itemList}>
          {items.map((item, index) => (
            <NavItemRow
              key={item.id}
              item={item}
              first={index === 0}
              last={index === items.length - 1}
              pending={pending}
              mutate={mutate}
              onMove={(direction) => void move(index, direction)}
            />
          ))}
        </ul>
      )}

      <form className={styles.createForm} onSubmit={(e) => void create(e)}>
        <p className="typeBodySmall">Thêm mục mới</p>

        <div className={styles.createGrid}>
          <label className="typeBodySmall">
            Nhãn tiếng Việt
            <input
              className={`typeBodySmall ${styles.input}`}
              value={labelVi}
              onChange={(e) => setLabelVi(e.target.value)}
              maxLength={120}
            />
          </label>

          <label className="typeBodySmall">
            Nhãn tiếng Anh
            <input
              className={`typeBodySmall ${styles.input}`}
              value={labelEn}
              onChange={(e) => setLabelEn(e.target.value)}
              maxLength={120}
            />
          </label>

          <label className="typeBodySmall">
            Đường dẫn
            {/* Placeholder là VÍ DỤ về định dạng, không phải gợi ý nội dung. */}
            <input
              className={`typeBodySmall ${styles.input}`}
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="/tools"
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
          Đường dẫn nội bộ bắt đầu bằng <code>/</code>. Link ra ngoài phải là <code>https://</code>{' '}
          và thuộc danh sách host được phép.
        </p>

        <button
          type="submit"
          className={`typeBodySmall ${styles.button}`}
          disabled={!canCreate || pending}
        >
          Thêm mục
        </button>
      </form>
    </section>
  );
}

function NavItemRow({
  item,
  first,
  last,
  pending,
  mutate,
  onMove,
}: {
  item: AdminNavItemView;
  first: boolean;
  last: boolean;
  pending: boolean;
  mutate: (action: () => Promise<void>, success: string) => Promise<void>;
  onMove: (direction: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [href, setHref] = useState(item.href);
  const [labelVi, setLabelVi] = useState(item.labels.vi ?? '');
  const [labelEn, setLabelEn] = useState(item.labels.en ?? '');
  const [reason, setReason] = useState('');

  const canSave = reason.trim() !== '';

  async function save() {
    await mutate(async () => {
      await api.patch(`/admin/site/nav/${item.id}`, {
        href: href.trim(),
        // Chuỗi rỗng = xoá bản dịch đó. Backend hiểu `null` và `''` như nhau.
        labels: { vi: labelVi.trim() || null, en: labelEn.trim() || null },
        reason: reason.trim(),
      });
      setEditing(false);
      setReason('');
    }, 'Đã lưu.');
  }

  async function toggleStatus() {
    const next = item.status === 'active' ? 'inactive' : 'active';
    const verb = next === 'active' ? 'hiện' : 'ẩn';

    const why = window.prompt(`Lý do ${verb} mục "${item.labels.vi ?? item.href}"?`);
    if (why === null || why.trim() === '') return;

    await mutate(
      () => api.post(`/admin/site/nav/${item.id}/status`, { status: next, reason: why.trim() }),
      next === 'active' ? 'Đã đưa lên website.' : 'Đã ẩn khỏi website.',
    );
  }

  async function remove() {
    const why = window.prompt(`Xoá hẳn mục "${item.labels.vi ?? item.href}"? Nêu lý do:`);
    if (why === null || why.trim() === '') return;

    await mutate(
      () => api.delete(`/admin/site/nav/${item.id}`, { reason: why.trim() }),
      'Đã xoá mục.',
    );
  }

  return (
    <li className={styles.item}>
      <div className={styles.itemMain}>
        <div className={styles.itemInfo}>
          <span className="typeBodySmall">
            {item.labels.vi ?? <em>chưa có nhãn tiếng Việt</em>}
          </span>
          <span className="typeCaption textSecondary">
            {item.labels.en ?? '— chưa có nhãn tiếng Anh'} · <code>{item.href}</code>
          </span>
        </div>

        <span className={`typeCaption ${styles.badge} ${styles[item.status]}`}>
          {STATUS_LABEL[item.status]}
        </span>

        <div className={styles.itemActions}>
          {/* Nút mũi tên có nhãn văn bản ẩn — biểu tượng một mình không đủ cho trình đọc màn hình. */}
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onMove(-1)}
            disabled={first || pending}
            aria-label="Chuyển lên trên"
          >
            ↑
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onMove(1)}
            disabled={last || pending}
            aria-label="Chuyển xuống dưới"
          >
            ↓
          </button>
          <button
            type="button"
            className={`typeCaption ${styles.linkButton}`}
            onClick={() => setEditing((v) => !v)}
            disabled={pending}
          >
            {editing ? 'Đóng' : 'Sửa'}
          </button>
          <button
            type="button"
            className={`typeCaption ${styles.linkButton}`}
            onClick={() => void toggleStatus()}
            disabled={pending}
          >
            {item.status === 'active' ? 'Ẩn' : 'Hiện'}
          </button>
          <button
            type="button"
            className={`typeCaption ${styles.linkButton}`}
            onClick={() => void remove()}
            disabled={pending}
          >
            Xoá
          </button>
        </div>
      </div>

      {editing ? (
        <div className={styles.editRow}>
          <label className="typeCaption">
            Nhãn vi
            <input
              className={`typeBodySmall ${styles.input}`}
              value={labelVi}
              onChange={(e) => setLabelVi(e.target.value)}
              maxLength={120}
            />
          </label>
          <label className="typeCaption">
            Nhãn en
            <input
              className={`typeBodySmall ${styles.input}`}
              value={labelEn}
              onChange={(e) => setLabelEn(e.target.value)}
              maxLength={120}
            />
          </label>
          <label className="typeCaption">
            Đường dẫn
            <input
              className={`typeBodySmall ${styles.input}`}
              value={href}
              onChange={(e) => setHref(e.target.value)}
              maxLength={2048}
            />
          </label>
          <label className="typeCaption">
            Lý do
            <input
              className={`typeBodySmall ${styles.input}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </label>
          <button
            type="button"
            className={`typeBodySmall ${styles.button}`}
            onClick={() => void save()}
            disabled={!canSave || pending}
          >
            Lưu
          </button>
        </div>
      ) : null}
    </li>
  );
}
