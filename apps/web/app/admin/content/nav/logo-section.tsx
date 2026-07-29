'use client';

import { useRef, useState } from 'react';
import { api } from '../../../../lib/api-client';
import forms from '../../admin-forms.module.css';
import type { AdminMutate } from '../../use-admin-screen';
import styles from './page.module.css';

/**
 * Logo website — TẢI FILE LÊN (chủ dự án chốt 2026-07-29, thay ô dán URL trước đó).
 *
 * File lưu trong database của Control Plane (migration 0015) và phục vụ qua
 * `/api/brand/logo` — cùng origin nên không đụng allowlist host hay `img-src` nào nữa; hai
 * ràng buộc từng phải giải thích cho người dùng ở bản dán-URL biến mất cùng ô nhập đó.
 *
 * Giới hạn: png/jpeg/webp, tối đa 512KB. KHÔNG nhận SVG — SVG là markup chạy được, phục vụ
 * file người dùng tải lên từ origin của mình là một đường XSS.
 *
 * Đường dán URL cũ vẫn sống ở tầng dữ liệu làm mức dự phòng (file tải lên luôn thắng),
 * nhưng không còn ô nhập ở đây — một màn hình, một cách làm.
 */

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 512 * 1024;

export function LogoSection({ pending, mutate }: { pending: boolean; mutate: AdminMutate }) {
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  // Đổi số này sau mỗi lần lưu/gỡ để vượt qua cache 60s của trình duyệt trên ảnh xem trước.
  const [version, setVersion] = useState(0);
  const [hasLogo, setHasLogo] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(next: File | null) {
    setFileError(null);
    if (next === null) {
      setFile(null);
      return;
    }
    if (!ACCEPTED.includes(next.type)) {
      setFileError('Chỉ nhận PNG, JPEG hoặc WebP. SVG không được hỗ trợ.');
      setFile(null);
      return;
    }
    if (next.size > MAX_BYTES) {
      setFileError(`File ${Math.round(next.size / 1024)}KB vượt trần ${MAX_BYTES / 1024}KB.`);
      setFile(null);
      return;
    }
    setFile(next);
  }

  async function upload() {
    if (file === null) return;
    const data = await toBase64(file);

    await mutate(async () => {
      await api.put('/admin/site/logo', { mime: file.type, data, reason: reason.trim() });
      setFile(null);
      setReason('');
      if (inputRef.current) inputRef.current.value = '';
      setHasLogo(true);
      setVersion((v) => v + 1);
    }, 'Đã cập nhật logo.');
  }

  async function remove() {
    const why = window.prompt('Gỡ logo đã tải lên? Nêu lý do:');
    if (why === null || why.trim() === '') return;

    await mutate(async () => {
      await api.delete('/admin/site/logo', { reason: why.trim() });
      setHasLogo(false);
      setVersion((v) => v + 1);
    }, 'Đã gỡ logo — website quay về logo chữ.');
  }

  return (
    <section className={styles.menu}>
      <h2 className="typeH3">Logo</h2>

      {hasLogo ? (
        /* Xem trước qua CHÍNH đường phục vụ thật (`/api/brand/logo`): người biên tập thấy
           đúng thứ website đang phát, và ảnh lỗi (chưa có logo) thì ẩn ô này đi. */
        // biome-ignore lint/performance/noImgElement: ảnh động theo dữ liệu lúc chạy.
        <img
          className={styles.logoPreview}
          src={`/api/brand/logo?v=${version}`}
          alt="Logo hiện tại"
          onError={() => setHasLogo(false)}
        />
      ) : (
        <p className="typeBodySmall textSecondary">
          Chưa có logo. Header đang hiển thị tên thương hiệu bằng chữ.
        </p>
      )}

      <div className={forms.fieldRow}>
        <label className="typeBodySmall">
          Chọn file logo
          <input
            ref={inputRef}
            className={`typeBodySmall ${forms.input}`}
            type="file"
            accept={ACCEPTED.join(',')}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <label className="typeBodySmall">
          Lý do
          <input
            className={`typeBodySmall ${forms.input}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </label>
      </div>

      {fileError !== null ? (
        <p className="typeCaption" role="alert">
          {fileError}
        </p>
      ) : null}

      <p className="typeCaption textSecondary">
        PNG, JPEG hoặc WebP, tối đa 512KB. Nền trong suốt hiển thị đẹp nhất trên header. Thay đổi
        hiện ra trên website trong vòng 60 giây.
      </p>

      <div className={styles.itemActions}>
        <button
          type="button"
          className={`typeBodySmall ${forms.button}`}
          onClick={() => void upload()}
          disabled={file === null || reason.trim() === '' || pending}
        >
          Tải logo lên
        </button>

        {hasLogo ? (
          <button
            type="button"
            className={`typeCaption ${forms.linkButton}`}
            onClick={() => void remove()}
            disabled={pending}
          >
            Gỡ logo
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** Bytes của file dưới dạng base64 THUẦN (bỏ tiền tố `data:...;base64,` của FileReader). */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
