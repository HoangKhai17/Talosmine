'use client';

import { useId, useState } from 'react';
import { type AdminContentSlotView, api } from '../../../../lib/api-client';
import forms from '../../admin-forms.module.css';
import { type AdminMutate, useAdminScreen } from '../../use-admin-screen';
import styles from './page.module.css';
import { fallbackText, SLOT_GROUPS, type SlotDef } from './slot-catalog';

/**
 * Quản trị nội dung các trang — tiêu đề, đoạn dẫn, chữ SEO.
 *
 * BỐN ĐIỀU CHI PHỐI MÀN HÌNH NÀY:
 *
 * 1. **Ô TRỐNG = dùng chữ mặc định trong code.** Placeholder hiện đúng chữ đang render trên
 *    trang; lưu một ô trống là XOÁ override và quay về chữ đó. Không tồn tại trạng thái
 *    "trang bị trống vì admin quên nhập" — đó là điểm của thiết kế fallback.
 *
 * 2. **Danh mục khe là ĐÓNG.** Người biên tập sửa chữ, không thêm khe: một khe không có chỗ
 *    render trong code là dữ liệu chết. Thêm khe = migration + code (xem migration 0013).
 *
 * 3. **MỌI thay đổi cần lý do** — đi vào `audit_events`, cùng quy tắc với mọi thao tác quản
 *    trị khác.
 *
 * 4. **Thay đổi hiện ra sau tối đa 60 giây** (BFF cache, DEC-T26). Nói rõ để người biên tập
 *    không bấm lưu lặp vì tưởng không ăn.
 */

export default function AdminContentPagesPage() {
  const screen = useAdminScreen<AdminContentSlotView[]>({
    path: '/admin/site/content',
    returnTo: '/admin/content/pages',
    initial: [],
  });

  const byKey = new Map(screen.data.map((slot) => [slot.key, slot.values]));

  return (
    <div className="stack">
      <h1 className="typeH1">Nội dung trang</h1>

      <p className="typeBody textSecondary">
        Tiêu đề, đoạn dẫn và chữ SEO của các trang. Ô trống nghĩa là trang đang dùng chữ mặc định
        (hiện mờ trong ô); lưu ô trống để quay về chữ mặc định. Thay đổi hiện ra trên website{' '}
        <strong>trong vòng 60 giây</strong>.
      </p>

      <div aria-live="polite" tabIndex={-1} ref={screen.noticeRef}>
        {screen.loading ? <p className="typeBody textSecondary">Đang tải…</p> : null}
        {screen.notice ? <p className="typeBody">{screen.notice}</p> : null}
        {screen.error ? (
          <div className="notice" role="alert">
            <p className="typeBody">{screen.error}</p>
            <button type="button" className="typeBody" onClick={() => void screen.reload()}>
              Thử lại
            </button>
          </div>
        ) : null}
      </div>

      {/*
        Mỗi nhóm là <details> ĐÓNG mặc định (trừ nhóm đầu): 41 khe trải phẳng là một trang
        cuộn vô tận. <details>/<summary> là toggle chuẩn của trình duyệt — bàn phím và trình
        đọc màn hình dùng được ngay, không cần state hay JS.
      */}
      {!screen.loading
        ? SLOT_GROUPS.map((group, index) => (
            <details key={group.title} className={styles.group} open={index === 0}>
              <summary className={styles.summary}>
                <h2 className="typeH3">{group.title}</h2>
                <span className={`typeCaption ${styles.summaryCount}`}>
                  {group.slots.length} mục
                </span>
              </summary>
              {group.slots.map((slot) => (
                <SlotRow
                  key={slot.key}
                  slot={slot}
                  current={byKey.get(slot.key) ?? {}}
                  pending={screen.pending}
                  mutate={screen.mutate}
                />
              ))}
            </details>
          ))
        : null}
    </div>
  );
}

function SlotRow({
  slot,
  current,
  pending,
  mutate,
}: {
  slot: SlotDef;
  current: { vi?: string | null; en?: string | null };
  pending: boolean;
  mutate: AdminMutate;
}) {
  const [valueVi, setValueVi] = useState(current.vi ?? '');
  const [valueEn, setValueEn] = useState(current.en ?? '');
  const [reason, setReason] = useState('');

  const dirty = valueVi !== (current.vi ?? '') || valueEn !== (current.en ?? '');
  const canSave = dirty && reason.trim() !== '';

  async function save() {
    await mutate(async () => {
      await api.patch(`/admin/site/content/${encodeURIComponent(slot.key)}`, {
        // Chuỗi rỗng = xoá override, trang quay về chữ mặc định. Backend hiểu `''` và `null`
        // như nhau nên gửi thẳng giá trị ô.
        values: { vi: valueVi.trim() || null, en: valueEn.trim() || null },
        reason: reason.trim(),
      });
      setReason('');
    }, `Đã lưu "${slot.label}".`);
  }

  return (
    <div className={styles.slot}>
      <div className={styles.slotHeader}>
        <span className="typeBodySmall">{slot.label}</span>
        <code className="typeCaption textTertiary">{slot.key}</code>
      </div>

      <div className={forms.fieldRow}>
        <SlotField
          label="Tiếng Việt"
          multiline={slot.multiline === true}
          maxLength={slot.maxLength ?? 2000}
          value={valueVi}
          onChange={setValueVi}
          placeholder={fallbackText(slot.key, 'vi')}
        />
        <SlotField
          label="Tiếng Anh"
          multiline={slot.multiline === true}
          maxLength={slot.maxLength ?? 2000}
          value={valueEn}
          onChange={setValueEn}
          placeholder={fallbackText(slot.key, 'en')}
        />

        <label className={`typeCaption ${styles.reasonField}`}>
          Lý do
          <input
            className={`typeBodySmall ${forms.input}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </label>

        <button
          type="button"
          className={`typeBodySmall ${forms.button}`}
          onClick={() => void save()}
          disabled={!canSave || pending}
        >
          Lưu
        </button>
      </div>
    </div>
  );
}

/**
 * Một ô nhập giá trị. Placeholder là CHỮ MẶC ĐỊNH trong code — người biên tập thấy đúng thứ
 * trang đang hiển thị khi chưa override; nhóm SEO description không có mặc định thì nói rõ
 * hệ quả của việc bỏ trống.
 */
function SlotField({
  label,
  multiline,
  maxLength,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  multiline: boolean;
  maxLength: number;
  value: string;
  onChange: (next: string) => void;
  placeholder: string | null;
}) {
  const hint = placeholder ?? 'Chưa đặt — xem mô tả của khe về hành vi khi bỏ trống';
  // `htmlFor`/`id` tường minh: rule a11y không nhìn xuyên qua ternary để thấy control lồng
  // trong label, và id sinh bằng `useId` nên hai khe không bao giờ trùng nhau.
  const id = useId();

  return (
    <label className={`typeCaption ${styles.valueField}`} htmlFor={id}>
      {label}
      {multiline ? (
        <textarea
          id={id}
          className={`typeBodySmall ${styles.textarea}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hint}
          maxLength={maxLength}
          rows={3}
        />
      ) : (
        <input
          id={id}
          className={`typeBodySmall ${forms.input}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hint}
          maxLength={maxLength}
        />
      )}
    </label>
  );
}
