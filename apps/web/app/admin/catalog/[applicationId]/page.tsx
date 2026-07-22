'use client';

import Link from 'next/link';
import { type FormEvent, use, useCallback, useEffect, useRef, useState } from 'react';
import {
  type AdminApplicationView,
  ApiError,
  api,
  type FeatureView,
  type RedirectUriView,
} from '../../../../lib/api-client';
import styles from '../page.module.css';
import { StatusBadge } from '../status-badge';

/**
 * Quản lý một ứng dụng: metadata, trạng thái, allowlist redirect và tính năng.
 *
 * BỐN NGUYÊN TẮC, mỗi cái đều có lý do cụ thể:
 *
 * 1. `key` HIỂN THỊ NHƯNG KHÔNG SỬA ĐƯỢC. Nó là mã mà quyền sử dụng, hạn mức và nhật ký
 *    tham chiếu tới. Ô nhập để `disabled` chứ không ẩn đi — người vận hành cần đọc được nó
 *    để đối chiếu, chỉ là không đổi được.
 *
 * 2. KHÔNG CÓ NÚT XOÁ ứng dụng hay tính năng. Vòng đời đi bằng trạng thái. Ngoại lệ duy
 *    nhất là redirect URI — xem ghi chú ở phần đó.
 *
 * 3. ĐỔI TRẠNG THÁI TÁCH KHỎI SỬA METADATA, và cần quyền riêng (`catalog:publish`). Sửa mô
 *    tả và bật ứng dụng cho toàn bộ người dùng là hai việc có hệ quả khác hẳn nhau.
 *
 * 4. MỌI THAO TÁC CẦN LÝ DO, ghi thẳng vào `audit_events`.
 *
 * Máy trạng thái: `draft → active ⇄ inactive`. KHÔNG quay lại `draft` — một ứng dụng đã
 * từng hoạt động thì có thể đã có người dùng và dữ liệu, gọi nó là "nháp" nữa là nói dối.
 * Giao diện chỉ hiện những chuyển tiếp hợp lệ; máy chủ vẫn kiểm lại.
 */
export default function AdminCatalogDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = use(params);

  const [application, setApplication] = useState<AdminApplicationView | null>(null);
  const [redirectUris, setRedirectUris] = useState<RedirectUriView[]>([]);
  const [features, setFeatures] = useState<FeatureView[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const noticeRef = useRef<HTMLDivElement>(null);

  const base = `/admin/catalog/applications/${applicationId}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [app, uris, featureList] = await Promise.all([
        api.get<AdminApplicationView>(base),
        api.get<RedirectUriView[]>(`${base}/redirect-uris`),
        api.get<FeatureView[]>(`${base}/features`),
      ]);
      setApplication(app);
      setRedirectUris(uris);
      setFeatures(featureList);
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        window.location.href = '/auth?returnTo=%2Fadmin%2Fcatalog';
        return;
      }
      setError(err instanceof Error ? err.message : 'Không tải được ứng dụng.');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Bọc chung cho mọi mutation: đặt cờ đang chạy, xoá thông báo cũ, tải lại, đưa focus về
   * vùng thông báo.
   *
   * Cờ `pending` là thứ chặn BẤM HAI LẦN. Không có nó, một cú double-click sẽ gửi hai
   * request và tạo hai dòng audit cho một ý định.
   */
  async function run(id: string, message: string, action: () => Promise<unknown>) {
    setPending(id);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(message);
      await load();
      noticeRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thực hiện được.');
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return (
      <div className="stack">
        <p className="typeBody textSecondary">Đang tải…</p>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="stack">
        <div className="notice" role="alert">
          <p className="typeBody">{error ?? 'Không tìm thấy ứng dụng.'}</p>
        </div>
        <Link className="typeBody" href="/admin/catalog">
          ← Về danh mục
        </Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="typeBodySmall">
        <Link className={styles.link} href="/admin/catalog">
          ← Danh mục ứng dụng
        </Link>
      </p>

      <h1 className="typeH1">{application.displayName}</h1>

      <p className="typeBody textSecondary">
        <span className={styles.mono}>{application.key}</span> ·{' '}
        <StatusBadge status={application.status} />
      </p>

      <div aria-live="polite" tabIndex={-1} ref={noticeRef}>
        {notice ? <p className="typeBody">{notice}</p> : null}
        {error ? (
          <div className="notice" role="alert">
            <p className="typeBody">{error}</p>
          </div>
        ) : null}
      </div>

      <MetadataSection
        application={application}
        pending={pending}
        onSave={(body) =>
          run('metadata', 'Đã cập nhật thông tin ứng dụng.', () => api.patch(base, body))
        }
      />

      <StatusSection
        application={application}
        pending={pending}
        onChange={(status, reason) =>
          run('status', 'Đã đổi trạng thái ứng dụng.', () =>
            api.post(`${base}/status`, { status, reason }),
          )
        }
      />

      <RedirectSection
        redirectUris={redirectUris}
        pending={pending}
        onAdd={(body) =>
          run('redirect-add', 'Đã thêm redirect URI.', () =>
            api.post(`${base}/redirect-uris`, body),
          )
        }
        onRemove={(id, reason) =>
          run(id, 'Đã gỡ redirect URI.', () =>
            api.delete(`${base}/redirect-uris/${id}`, { reason }),
          )
        }
      />

      <FeatureSection
        features={features}
        pending={pending}
        onAdd={(body) =>
          run('feature-add', 'Đã tạo tính năng.', () => api.post(`${base}/features`, body))
        }
        onChangeStatus={(id, status, reason) =>
          run(id, 'Đã đổi trạng thái tính năng.', () =>
            api.post(`${base}/features/${id}/status`, { status, reason }),
          )
        }
      />

      <MetricsBlockedSection />
    </div>
  );
}

/* ── Metadata ─────────────────────────────────────────────────────────────── */

function MetadataSection({
  application,
  pending,
  onSave,
}: {
  application: AdminApplicationView;
  pending: string | null;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(application.displayName);
  const [description, setDescription] = useState(application.description ?? '');
  const [launchUrl, setLaunchUrl] = useState(application.launchUrl);
  const [imageUrl, setImageUrl] = useState(application.imageUrl ?? '');
  const [reason, setReason] = useState('');

  const canSubmit =
    displayName.trim() !== '' &&
    launchUrl.trim() !== '' &&
    reason.trim() !== '' &&
    pending === null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    void onSave({
      displayName: displayName.trim(),
      description: description.trim() === '' ? null : description.trim(),
      imageUrl: imageUrl.trim() === '' ? null : imageUrl.trim(),
      launchUrl: launchUrl.trim(),
      reason: reason.trim(),
    }).then(() => setReason(''));
  }

  return (
    <section className={styles.section} aria-labelledby="meta-heading">
      <h2 className="typeH3" id="meta-heading">
        Thông tin ứng dụng
      </h2>

      <form className={styles.form} onSubmit={submit}>
        <div className={styles.field}>
          <label className="typeBodySmall" htmlFor="meta-key">
            Mã ứng dụng
          </label>
          {/*
            `disabled` chứ không phải `readOnly`: `readOnly` vẫn gửi giá trị theo form và
            vẫn focus được, khiến người dùng tưởng sửa được. `disabled` nói đúng sự thật.
          */}
          <input
            id="meta-key"
            className={`typeBody ${styles.input} ${styles.mono}`}
            type="text"
            value={application.key}
            disabled
            aria-describedby="meta-key-hint"
          />
          <p id="meta-key-hint" className={`typeCaption ${styles.hint}`}>
            Không đổi được. Quyền sử dụng, hạn mức và nhật ký đều tham chiếu mã này; đổi nó sẽ làm
            mọi dữ liệu lịch sử trỏ sai đối tượng.
          </p>
        </div>

        <div className={styles.field}>
          <label className="typeBodySmall" htmlFor="meta-name">
            Tên hiển thị
          </label>
          <input
            id="meta-name"
            className={`typeBody ${styles.input}`}
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={120}
          />
        </div>

        <div className={styles.field}>
          <label className="typeBodySmall" htmlFor="meta-description">
            Mô tả
          </label>
          <textarea
            id="meta-description"
            className={`typeBody ${styles.textarea}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>

        <div className={styles.field}>
          <label className="typeBodySmall" htmlFor="meta-launch">
            URL mở ứng dụng
          </label>
          <input
            id="meta-launch"
            className={`typeBody ${styles.input} ${styles.mono}`}
            type="url"
            value={launchUrl}
            onChange={(e) => setLaunchUrl(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className="typeBodySmall" htmlFor="meta-image">
            URL ảnh
          </label>
          <input
            id="meta-image"
            className={`typeBody ${styles.input} ${styles.mono}`}
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className="typeBodySmall" htmlFor="meta-reason">
            Lý do (bắt buộc)
          </label>
          <input
            id="meta-reason"
            className={`typeBody ${styles.input}`}
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ví dụ: cập nhật mô tả theo yêu cầu của chủ ứng dụng"
          />
        </div>

        <div>
          <button type="submit" className={`typeBody ${styles.button}`} disabled={!canSubmit}>
            {pending === 'metadata' ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </section>
  );
}

/* ── Trạng thái ───────────────────────────────────────────────────────────── */

/**
 * Chuyển tiếp hợp lệ từ một trạng thái. Giữ ĐỒNG BỘ với `isValidTransition` ở
 * `catalog.service.ts` — máy chủ mới là nơi quyết định, đây chỉ để không mời người dùng bấm
 * một nút chắc chắn sẽ lỗi.
 */
function allowedTransitions(status: string): Array<'active' | 'inactive'> {
  if (status === 'draft') return ['active'];
  if (status === 'active') return ['inactive'];
  if (status === 'inactive') return ['active'];
  return [];
}

function StatusSection({
  application,
  pending,
  onChange,
}: {
  application: AdminApplicationView;
  pending: string | null;
  onChange: (status: string, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const options = allowedTransitions(application.status);

  return (
    <section className={styles.section} aria-labelledby="status-heading">
      <h2 className="typeH3" id="status-heading">
        Trạng thái
      </h2>

      <div className="notice">
        <p className="typeBodySmall">
          Hiện tại: <StatusBadge status={application.status} />
        </p>
        <p className="typeBodySmall textSecondary">
          {application.status === 'active'
            ? 'Ứng dụng đang hiển thị trong danh mục công khai. Tắt nó sẽ làm nó biến mất khỏi danh mục và không mở được nữa.'
            : 'Ứng dụng KHÔNG hiển thị trong danh mục công khai. Kích hoạt sẽ đưa nó ra cho mọi người thấy.'}
        </p>
        <p className="typeCaption textTertiary">
          Không quay lại được trạng thái nháp: một ứng dụng đã từng hoạt động có thể đã có người
          dùng và dữ liệu.
        </p>
      </div>

      {options.length === 0 ? (
        <p className={`typeBody ${styles.empty}`}>Không có chuyển tiếp nào khả dụng.</p>
      ) : (
        <div className={styles.form}>
          <div className={styles.field}>
            <label className="typeBodySmall" htmlFor="status-reason">
              Lý do (bắt buộc)
            </label>
            <input
              id="status-reason"
              className={`typeBody ${styles.input}`}
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ví dụ: ứng dụng đã sẵn sàng phục vụ"
            />
          </div>

          <div className={styles.formRow}>
            {options.map((next) => (
              <button
                key={next}
                type="button"
                className={`typeBody ${styles.button}`}
                disabled={reason.trim() === '' || pending !== null}
                onClick={() => void onChange(next, reason.trim()).then(() => setReason(''))}
              >
                {pending === 'status'
                  ? 'Đang đổi…'
                  : next === 'active'
                    ? 'Kích hoạt ứng dụng'
                    : 'Tắt ứng dụng'}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Redirect URI ─────────────────────────────────────────────────────────── */

function RedirectSection({
  redirectUris,
  pending,
  onAdd,
  onRemove,
}: {
  redirectUris: RedirectUriView[];
  pending: string | null;
  onAdd: (body: Record<string, unknown>) => Promise<void>;
  onRemove: (id: string, reason: string) => Promise<void>;
}) {
  const [purpose, setPurpose] = useState<'login' | 'logout'>('login');
  const [uri, setUri] = useState('');
  const [reason, setReason] = useState('');

  const canSubmit = uri.trim() !== '' && reason.trim() !== '' && pending === null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    void onAdd({ purpose, uri: uri.trim(), reason: reason.trim() }).then(() => {
      setUri('');
      setReason('');
    });
  }

  function remove(entry: RedirectUriView) {
    const why = window.prompt(
      `Gỡ redirect URI này khỏi danh sách cho phép?\n\n${entry.uri}\n\n` +
        'Nếu ứng dụng đang dùng nó, người dùng sẽ không đăng nhập được nữa.\n' +
        'Nhập lý do (bắt buộc):',
    );
    if (why === null || why.trim() === '') return;
    void onRemove(entry.id, why.trim());
  }

  return (
    <section className={styles.section} aria-labelledby="redirect-heading">
      <h2 className="typeH3" id="redirect-heading">
        Redirect URI
      </h2>

      <div className="notice">
        <p className="typeBodySmall">
          Đây là bề mặt nhạy cảm nhất của danh mục. Redirect URI quyết định nơi mã xác thực được gửi
          tới sau khi người dùng đăng nhập — một entry sai nghĩa là mã đó, và qua đó là phiên của
          người dùng, rơi vào tay người khác.
        </p>
        <p className="typeBodySmall textSecondary">
          So khớp CHÍNH XÁC từng ký tự: không ký tự đại diện, không tiền tố, không subdomain. Máy
          chủ tự chuẩn hoá URI trước khi lưu, nên chuỗi hiển thị bên dưới có thể khác chuỗi bạn gõ
          vào — giá trị hiển thị mới là giá trị được dùng để so khớp.
        </p>
      </div>

      {redirectUris.length === 0 ? (
        <p className={`typeBody ${styles.empty}`}>Chưa có redirect URI nào.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={`typeBodySmall ${styles.table}`}>
            <caption className="typeBodySmall">{redirectUris.length} URI</caption>
            <thead>
              <tr>
                <th scope="col">Mục đích</th>
                <th scope="col">URI (đã chuẩn hoá)</th>
                <th scope="col">
                  <span className="visuallyHidden">Hành động</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {redirectUris.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.purpose === 'login' ? 'Đăng nhập' : 'Đăng xuất'}</td>
                  <td className={`${styles.mono} ${styles.urlCell}`}>{entry.uri}</td>
                  <td>
                    <button
                      type="button"
                      className={`typeBodySmall ${styles.buttonSecondary}`}
                      onClick={() => remove(entry)}
                      disabled={pending !== null}
                    >
                      {pending === entry.id ? 'Đang gỡ…' : 'Gỡ'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*
        ĐÂY LÀ CHỖ DUY NHẤT TRONG DANH MỤC THỰC SỰ XOÁ DÒNG. Mọi nơi khác đổi trạng thái.
        Lý do: allowlist là tập giá trị được phép Ở THỜI ĐIỂM HIỆN TẠI, không phải lịch sử.
        Giữ một URI "đã gỡ" trong bảng sẽ đòi mọi truy vấn so khớp phải nhớ lọc nó ra, và
        quên một lần là lỗ hổng. Dấu vết lịch sử nằm ở nhật ký kiểm toán.
      */}
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.formRow}>
          <div className={styles.field}>
            <label className="typeBodySmall" htmlFor="redirect-purpose">
              Mục đích
            </label>
            <select
              id="redirect-purpose"
              className={`typeBody ${styles.select}`}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value === 'logout' ? 'logout' : 'login')}
            >
              <option value="login">Đăng nhập</option>
              <option value="logout">Đăng xuất</option>
            </select>
          </div>

          <div className={styles.field}>
            <label className="typeBodySmall" htmlFor="redirect-uri">
              URI
            </label>
            <input
              id="redirect-uri"
              className={`typeBody ${styles.input} ${styles.mono}`}
              type="url"
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder="https://ung-dung.example.com/auth/callback"
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className="typeBodySmall" htmlFor="redirect-reason">
            Lý do (bắt buộc)
          </label>
          <input
            id="redirect-reason"
            className={`typeBody ${styles.input}`}
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ví dụ: đăng ký callback cho môi trường production"
          />
        </div>

        <div>
          <button type="submit" className={`typeBody ${styles.button}`} disabled={!canSubmit}>
            {pending === 'redirect-add' ? 'Đang thêm…' : 'Thêm URI'}
          </button>
        </div>
      </form>
    </section>
  );
}

/* ── Feature ──────────────────────────────────────────────────────────────── */

function FeatureSection({
  features,
  pending,
  onAdd,
  onChangeStatus,
}: {
  features: FeatureView[];
  pending: string | null;
  onAdd: (body: Record<string, unknown>) => Promise<void>;
  onChangeStatus: (id: string, status: string, reason: string) => Promise<void>;
}) {
  const [key, setKey] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [reason, setReason] = useState('');

  const canSubmit =
    key.trim() !== '' && displayName.trim() !== '' && reason.trim() !== '' && pending === null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    void onAdd({
      key: key.trim().toLowerCase(),
      displayName: displayName.trim(),
      reason: reason.trim(),
    }).then(() => {
      setKey('');
      setDisplayName('');
      setReason('');
    });
  }

  function changeStatus(feature: FeatureView, next: 'active' | 'inactive') {
    const why = window.prompt(
      `Đổi trạng thái tính năng "${feature.key}" sang ${next === 'active' ? 'hoạt động' : 'tắt'}?\n` +
        'Nhập lý do (bắt buộc):',
    );
    if (why === null || why.trim() === '') return;
    void onChangeStatus(feature.id, next, why.trim());
  }

  return (
    <section className={styles.section} aria-labelledby="feature-heading">
      <h2 className="typeH3" id="feature-heading">
        Tính năng
      </h2>

      <p className="typeBodySmall textSecondary">
        Tính năng là thứ mà gói dịch vụ sẽ cấp quyền lên ở giai đoạn sau: gói không cấp "toàn bộ ứng
        dụng" mà cấp từng tính năng. Vì vậy mã tính năng cũng bất biến, cùng lý do với mã ứng dụng.
        Mã chỉ cần duy nhất TRONG ứng dụng này — hai ứng dụng khác nhau được phép trùng mã.
      </p>

      {features.length === 0 ? (
        <p className={`typeBody ${styles.empty}`}>Chưa có tính năng nào.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={`typeBodySmall ${styles.table}`}>
            <caption className="typeBodySmall">{features.length} tính năng</caption>
            <thead>
              <tr>
                <th scope="col">Mã</th>
                <th scope="col">Tên hiển thị</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">
                  <span className="visuallyHidden">Hành động</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature) => {
                const next = allowedTransitions(feature.status);
                return (
                  <tr key={feature.id}>
                    <td className={styles.mono}>{feature.key}</td>
                    <td>{feature.displayName}</td>
                    <td>
                      <StatusBadge status={feature.status} />
                    </td>
                    <td>
                      {next.map((target) => (
                        <button
                          key={target}
                          type="button"
                          className={`typeBodySmall ${styles.buttonSecondary}`}
                          onClick={() => changeStatus(feature, target)}
                          disabled={pending !== null}
                        >
                          {pending === feature.id
                            ? 'Đang đổi…'
                            : target === 'active'
                              ? 'Kích hoạt'
                              : 'Tắt'}
                        </button>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <form className={styles.form} onSubmit={submit}>
        <div className={styles.formRow}>
          <div className={styles.field}>
            <label className="typeBodySmall" htmlFor="feature-key">
              Mã tính năng (không đổi được)
            </label>
            <input
              id="feature-key"
              className={`typeBody ${styles.input} ${styles.mono}`}
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="xuat-bao-cao"
              pattern="[a-z][a-z0-9\-]*"
              maxLength={64}
            />
          </div>

          <div className={styles.field}>
            <label className="typeBodySmall" htmlFor="feature-name">
              Tên hiển thị
            </label>
            <input
              id="feature-name"
              className={`typeBody ${styles.input}`}
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className="typeBodySmall" htmlFor="feature-reason">
            Lý do (bắt buộc)
          </label>
          <input
            id="feature-reason"
            className={`typeBody ${styles.input}`}
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ví dụ: đăng ký tính năng theo hợp đồng tích hợp"
          />
        </div>

        <div>
          <button type="submit" className={`typeBody ${styles.button}`} disabled={!canSubmit}>
            {pending === 'feature-add' ? 'Đang tạo…' : 'Tạo tính năng (trạng thái nháp)'}
          </button>
        </div>
      </form>
    </section>
  );
}

/* ── Chỉ số sử dụng ───────────────────────────────────────────────────────── */

/**
 * KHÔNG có biểu mẫu tạo chỉ số, và đó là chủ đích.
 *
 * Cột `unit` của `usage_metrics` là `NOT NULL`, và §3 của phase-3 nói rõ: giá trị đơn vị
 * phải được chủ dự án duyệt TRƯỚC KHI tạo bất kỳ dòng nào (DEC-B05). Dựng một biểu mẫu ở
 * đây sẽ mời người vận hành gõ đại một đơn vị, và từ đó mọi phép tính hạn mức ở giai đoạn
 * sau đều dựa trên một con số không ai duyệt.
 *
 * Nói ra điều đang chờ thì tốt hơn là để một khoảng trống không giải thích.
 */
function MetricsBlockedSection() {
  return (
    <section className={styles.section} aria-labelledby="metric-heading">
      <h2 className="typeH3" id="metric-heading">
        Chỉ số sử dụng
      </h2>

      <div className="notice">
        <p className="typeBody">Chưa mở — đang chờ chủ dự án duyệt danh sách đơn vị đo.</p>
        <p className="typeBodySmall textSecondary">
          Mỗi chỉ số bắt buộc có một đơn vị (lượt, phút, MB…), và đơn vị phải được duyệt trước khi
          tạo dòng đầu tiên. Hạn mức ở giai đoạn sau tính trên chính con số này, nên một đơn vị gõ
          đại sẽ làm sai toàn bộ phép tính về sau.
        </p>
      </div>
    </section>
  );
}
