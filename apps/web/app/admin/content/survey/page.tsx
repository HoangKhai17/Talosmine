'use client';

import { type FormEvent, useState } from 'react';
import {
  type AdminSurveyOptionView,
  type AdminSurveyQuestionView,
  api,
} from '../../../../lib/api-client';
import { SURVEY_ICON_KEYS, SurveyIcon } from '../../../[locale]/onboarding/survey-icons';
import forms from '../../admin-forms.module.css';
import { type AdminMutate, useAdminScreen } from '../../use-admin-screen';
import styles from './page.module.css';

/**
 * Quản trị khảo sát onboarding — màn hình người mới đăng ký nhìn thấy.
 *
 * BỐN ĐIỀU CHI PHỐI MÀN HÌNH NÀY:
 *
 * 1. **Ba câu hỏi là CỐ ĐỊNH.** Không có nút thêm/xoá câu hỏi: code phải có chỗ render tương
 *    ứng cho từng câu, nên thêm câu là migration chứ không phải dữ liệu người biên tập tạo.
 *    Sửa được nội dung, số lựa chọn tối thiểu, và toàn bộ danh sách lựa chọn.
 *
 * 2. **Lựa chọn mới luôn ở `draft`.** Đưa ra trước người dùng là nút riêng cần
 *    `content:publish`, tách khỏi `content:manage`.
 *
 * 3. **`key` của lựa chọn KHÔNG sửa được sau khi tạo.** Câu trả lời đã thu thập và mọi báo
 *    cáo đọc theo khoá này; đổi nó là làm dữ liệu lịch sử nói sai đối tượng. Màn hình hiện
 *    khoá ra để người biên tập thấy, nhưng không cho sửa.
 *
 * 4. **MỌI thay đổi cần lý do.** Ô lý do đi thẳng vào `audit_events` và là thứ duy nhất trả
 *    lời được "vì sao lựa chọn này biến mất tháng trước". Nút bị vô hiệu khi lý do trống —
 *    backend cũng từ chối, nên đây chỉ là phản hồi sớm.
 */

const RETURN_TO = '/admin/content/survey';

const QUESTION_LABEL: Record<string, string> = {
  categories: 'Câu 1 — Lĩnh vực quan tâm',
  primary_use: 'Câu 2 — Mục đích sử dụng chính',
  discover_first: 'Câu 3 — Biết tới Kolo qua đâu',
};

const STATUS_LABEL: Record<AdminSurveyOptionView['status'], string> = {
  draft: 'Nháp',
  active: 'Đang hiện',
  inactive: 'Đã ẩn',
};

const MAX_LABEL = 200;
const MAX_DESCRIPTION = 500;

export default function AdminSurveyPage() {
  const screen = useAdminScreen<AdminSurveyQuestionView[]>({
    path: '/admin/survey/questions',
    returnTo: RETURN_TO,
    initial: [],
  });

  return (
    <div className="stack">
      <h1 className="typeH1">Khảo sát onboarding</h1>

      <p className="typeBody textSecondary">
        Câu hỏi hiện ra ngay sau khi đăng ký thành công. Người dùng luôn bỏ qua được, và mỗi người
        chỉ trả lời một lần.
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

      {!screen.loading
        ? screen.data.map((question) => (
            <QuestionSection
              key={question.id}
              question={question}
              pending={screen.pending}
              mutate={screen.mutate}
            />
          ))
        : null}
    </div>
  );
}

function QuestionSection({
  question,
  pending,
  mutate,
}: {
  question: AdminSurveyQuestionView;
  pending: boolean;
  mutate: AdminMutate;
}) {
  return (
    <section className={styles.question}>
      <div className={styles.questionHeader}>
        <h2 className="typeH3">{QUESTION_LABEL[question.key] ?? question.key}</h2>
        <span className="typeCaption textSecondary">
          <code>{question.key}</code> · {question.kind === 'multi' ? 'chọn nhiều' : 'chọn một'}
        </span>
      </div>

      <QuestionForm question={question} pending={pending} mutate={mutate} />

      {question.options.length === 0 ? (
        <p className="typeBodySmall textSecondary">Chưa có lựa chọn nào.</p>
      ) : (
        <ul className={styles.optionList}>
          {question.options.map((option, index) => (
            <OptionRow
              key={option.id}
              option={option}
              first={index === 0}
              last={index === question.options.length - 1}
              pending={pending}
              mutate={mutate}
              onMove={(direction) => void move(question, index, direction, mutate)}
            />
          ))}
        </ul>
      )}

      <CreateOptionForm questionKey={question.key} pending={pending} mutate={mutate} />
    </section>
  );
}

/**
 * Đổi chỗ hai lựa chọn liền kề.
 *
 * Gửi TRỌN danh sách theo thứ tự mới chứ không gửi "đổi chỗ A và B": backend nhận trọn danh
 * sách nên kết quả không phụ thuộc thứ tự request tới, và hai người sắp xếp cùng lúc không
 * tạo ra một thứ tự lai giữa hai ý định.
 */
async function move(
  question: AdminSurveyQuestionView,
  index: number,
  direction: -1 | 1,
  mutate: AdminMutate,
) {
  const target = index + direction;
  if (target < 0 || target >= question.options.length) return;

  const reordered = [...question.options];
  const a = reordered[index];
  const b = reordered[target];
  if (!a || !b) return;
  reordered[index] = b;
  reordered[target] = a;

  await mutate(
    () =>
      api.post('/admin/survey/options/reorder', {
        questionKey: question.key,
        optionIds: reordered.map((o) => o.id),
        reason: 'Sắp xếp lại thứ tự lựa chọn',
      }),
    'Đã sắp xếp lại.',
  );
}

/** Nội dung của chính câu hỏi: tiêu đề, mô tả, số lựa chọn tối thiểu. */
function QuestionForm({
  question,
  pending,
  mutate,
}: {
  question: AdminSurveyQuestionView;
  pending: boolean;
  mutate: AdminMutate;
}) {
  const [titleVi, setTitleVi] = useState(question.titles.vi ?? '');
  const [titleEn, setTitleEn] = useState(question.titles.en ?? '');
  const [descVi, setDescVi] = useState(question.descriptions.vi ?? '');
  const [descEn, setDescEn] = useState(question.descriptions.en ?? '');
  const [minSelect, setMinSelect] = useState(String(question.minSelect));
  const [reason, setReason] = useState('');

  const parsedMin = Number.parseInt(minSelect, 10);
  const canSave = reason.trim() !== '' && Number.isInteger(parsedMin) && parsedMin >= 1;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;

    await mutate(async () => {
      await api.patch(`/admin/survey/questions/${question.id}`, {
        // Chuỗi rỗng = xoá bản dịch đó. Xoá tiêu đề xoá luôn mô tả cùng ngôn ngữ — chúng nằm
        // chung một hàng, và backend nói rõ điều đó.
        titles: { vi: titleVi.trim() || null, en: titleEn.trim() || null },
        descriptions: { vi: descVi.trim() || null, en: descEn.trim() || null },
        minSelect: parsedMin,
        reason: reason.trim(),
      });
      setReason('');
    }, 'Đã lưu nội dung câu hỏi.');
  }

  return (
    <form className={forms.fieldRow} onSubmit={(e) => void save(e)}>
      <label className="typeBodySmall">
        Tiêu đề tiếng Việt
        <input
          className={`typeBodySmall ${forms.input}`}
          value={titleVi}
          onChange={(e) => setTitleVi(e.target.value)}
          maxLength={MAX_LABEL}
        />
      </label>

      <label className="typeBodySmall">
        Tiêu đề tiếng Anh
        <input
          className={`typeBodySmall ${forms.input}`}
          value={titleEn}
          onChange={(e) => setTitleEn(e.target.value)}
          maxLength={MAX_LABEL}
        />
      </label>

      <label className="typeBodySmall">
        Mô tả tiếng Việt
        <input
          className={`typeBodySmall ${forms.input}`}
          value={descVi}
          onChange={(e) => setDescVi(e.target.value)}
          maxLength={MAX_DESCRIPTION}
        />
      </label>

      <label className="typeBodySmall">
        Mô tả tiếng Anh
        <input
          className={`typeBodySmall ${forms.input}`}
          value={descEn}
          onChange={(e) => setDescEn(e.target.value)}
          maxLength={MAX_DESCRIPTION}
        />
      </label>

      {/* Câu `single` chỉ nhận đúng một lựa chọn, nên ô này vô nghĩa ở đó — backend cũng từ
          chối mọi giá trị khác 1. Ẩn đi thay vì hiện một ô luôn bị từ chối. */}
      {question.kind === 'multi' ? (
        <label className="typeBodySmall">
          Chọn tối thiểu
          <input
            className={`typeBodySmall ${forms.input}`}
            type="number"
            min={1}
            value={minSelect}
            onChange={(e) => setMinSelect(e.target.value)}
          />
        </label>
      ) : null}

      <label className="typeBodySmall">
        Lý do
        <input
          className={`typeBodySmall ${forms.input}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_DESCRIPTION}
        />
      </label>

      <button
        type="submit"
        className={`typeBodySmall ${forms.button}`}
        disabled={!canSave || pending}
      >
        Lưu câu hỏi
      </button>
    </form>
  );
}

function OptionRow({
  option,
  first,
  last,
  pending,
  mutate,
  onMove,
}: {
  option: AdminSurveyOptionView;
  first: boolean;
  last: boolean;
  pending: boolean;
  mutate: AdminMutate;
  onMove: (direction: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [labelVi, setLabelVi] = useState(option.labels.vi ?? '');
  const [labelEn, setLabelEn] = useState(option.labels.en ?? '');
  const [descVi, setDescVi] = useState(option.descriptions.vi ?? '');
  const [descEn, setDescEn] = useState(option.descriptions.en ?? '');
  const [icon, setIcon] = useState<string | null>(option.icon);
  const [reason, setReason] = useState('');

  const displayName = option.labels.vi ?? option.labels.en ?? option.key;

  async function save() {
    await mutate(async () => {
      await api.patch(`/admin/survey/options/${option.id}`, {
        labels: { vi: labelVi.trim() || null, en: labelEn.trim() || null },
        descriptions: { vi: descVi.trim() || null, en: descEn.trim() || null },
        icon,
        reason: reason.trim(),
      });
      setEditing(false);
      setReason('');
    }, 'Đã lưu lựa chọn.');
  }

  async function toggleStatus() {
    const next = option.status === 'active' ? 'inactive' : 'active';
    const verb = next === 'active' ? 'hiện' : 'ẩn';

    const why = window.prompt(`Lý do ${verb} lựa chọn "${displayName}"?`);
    if (why === null || why.trim() === '') return;

    await mutate(
      () =>
        api.post(`/admin/survey/options/${option.id}/status`, {
          status: next,
          reason: why.trim(),
        }),
      next === 'active' ? 'Đã đưa vào khảo sát.' : 'Đã gỡ khỏi khảo sát.',
    );
  }

  async function remove() {
    const why = window.prompt(
      `Xoá hẳn lựa chọn "${displayName}"? Lựa chọn đã có người trả lời sẽ không xoá được. Nêu lý do:`,
    );
    if (why === null || why.trim() === '') return;

    await mutate(
      () => api.delete(`/admin/survey/options/${option.id}`, { reason: why.trim() }),
      'Đã xoá lựa chọn.',
    );
  }

  return (
    <li className={styles.option}>
      <div className={styles.optionMain}>
        <div className={styles.optionInfo}>
          <SurveyIcon name={option.icon} className={styles.optionIcon} />
          <div className={styles.optionText}>
            <span className="typeBodySmall">
              {option.labels.vi ?? <em>chưa có nhãn tiếng Việt</em>}
            </span>
            <span className="typeCaption textSecondary">
              {option.labels.en ?? '— chưa có nhãn tiếng Anh'} · <code>{option.key}</code>
            </span>
          </div>
        </div>

        <span className={`typeCaption ${forms.badge} ${forms[option.status]}`}>
          {STATUS_LABEL[option.status]}
        </span>

        <div className={styles.optionActions}>
          {/* Nút mũi tên có nhãn văn bản ẩn — biểu tượng một mình không đủ cho trình đọc màn hình. */}
          <button
            type="button"
            className={forms.iconButton}
            onClick={() => onMove(-1)}
            disabled={first || pending}
            aria-label="Chuyển lên trên"
          >
            ↑
          </button>
          <button
            type="button"
            className={forms.iconButton}
            onClick={() => onMove(1)}
            disabled={last || pending}
            aria-label="Chuyển xuống dưới"
          >
            ↓
          </button>
          <button
            type="button"
            className={`typeCaption ${forms.linkButton}`}
            onClick={() => setEditing((v) => !v)}
            disabled={pending}
          >
            {editing ? 'Đóng' : 'Sửa'}
          </button>
          <button
            type="button"
            className={`typeCaption ${forms.linkButton}`}
            onClick={() => void toggleStatus()}
            disabled={pending}
          >
            {option.status === 'active' ? 'Ẩn' : 'Hiện'}
          </button>
          <button
            type="button"
            className={`typeCaption ${forms.linkButton}`}
            onClick={() => void remove()}
            disabled={pending}
          >
            Xoá
          </button>
        </div>
      </div>

      {editing ? (
        <div className={`${forms.fieldRow} ${forms.editRow}`}>
          <label className="typeCaption">
            Nhãn vi
            <input
              className={`typeBodySmall ${forms.input}`}
              value={labelVi}
              onChange={(e) => setLabelVi(e.target.value)}
              maxLength={MAX_LABEL}
            />
          </label>
          <label className="typeCaption">
            Nhãn en
            <input
              className={`typeBodySmall ${forms.input}`}
              value={labelEn}
              onChange={(e) => setLabelEn(e.target.value)}
              maxLength={MAX_LABEL}
            />
          </label>
          <label className="typeCaption">
            Mô tả vi
            <input
              className={`typeBodySmall ${forms.input}`}
              value={descVi}
              onChange={(e) => setDescVi(e.target.value)}
              maxLength={MAX_DESCRIPTION}
            />
          </label>
          <label className="typeCaption">
            Mô tả en
            <input
              className={`typeBodySmall ${forms.input}`}
              value={descEn}
              onChange={(e) => setDescEn(e.target.value)}
              maxLength={MAX_DESCRIPTION}
            />
          </label>
          <label className="typeCaption">
            Lý do
            <input
              className={`typeBodySmall ${forms.input}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={MAX_DESCRIPTION}
            />
          </label>

          <IconPicker value={icon} onChange={setIcon} pending={pending} />

          <button
            type="button"
            className={`typeBodySmall ${forms.button}`}
            onClick={() => void save()}
            disabled={reason.trim() === '' || pending}
          >
            Lưu
          </button>
        </div>
      ) : null}
    </li>
  );
}

function CreateOptionForm({
  questionKey,
  pending,
  mutate,
}: {
  questionKey: string;
  pending: boolean;
  mutate: AdminMutate;
}) {
  const [key, setKey] = useState('');
  const [labelVi, setLabelVi] = useState('');
  const [labelEn, setLabelEn] = useState('');
  const [descVi, setDescVi] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const canCreate = key.trim() !== '' && labelVi.trim() !== '' && reason.trim() !== '';

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!canCreate) return;

    await mutate(async () => {
      await api.post('/admin/survey/options', {
        questionKey,
        key: key.trim(),
        labels: { vi: labelVi.trim(), en: labelEn.trim() || null },
        descriptions: { vi: descVi.trim() || null },
        icon,
        reason: reason.trim(),
      });
      setKey('');
      setLabelVi('');
      setLabelEn('');
      setDescVi('');
      setIcon(null);
      setReason('');
    }, 'Đã thêm lựa chọn (đang ở trạng thái nháp).');
  }

  return (
    <form className={styles.createForm} onSubmit={(e) => void create(e)}>
      <p className="typeBodySmall">Thêm lựa chọn</p>

      <div className={forms.fieldRow}>
        <label className="typeBodySmall">
          Khoá máy
          {/* Placeholder là VÍ DỤ về định dạng, không phải gợi ý nội dung. */}
          <input
            className={`typeBodySmall ${forms.input}`}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="viet_lach"
            maxLength={64}
          />
        </label>

        <label className="typeBodySmall">
          Nhãn tiếng Việt
          <input
            className={`typeBodySmall ${forms.input}`}
            value={labelVi}
            onChange={(e) => setLabelVi(e.target.value)}
            maxLength={MAX_LABEL}
          />
        </label>

        <label className="typeBodySmall">
          Nhãn tiếng Anh
          <input
            className={`typeBodySmall ${forms.input}`}
            value={labelEn}
            onChange={(e) => setLabelEn(e.target.value)}
            maxLength={MAX_LABEL}
          />
        </label>

        <label className="typeBodySmall">
          Mô tả tiếng Việt
          <input
            className={`typeBodySmall ${forms.input}`}
            value={descVi}
            onChange={(e) => setDescVi(e.target.value)}
            maxLength={MAX_DESCRIPTION}
          />
        </label>

        <label className="typeBodySmall">
          Lý do
          <input
            className={`typeBodySmall ${forms.input}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_DESCRIPTION}
          />
        </label>
      </div>

      <IconPicker value={icon} onChange={setIcon} pending={pending} />

      <p className="typeCaption textSecondary">
        Khoá máy chỉ gồm chữ thường, số và gạch dưới, và <strong>không sửa được về sau</strong> —
        báo cáo đọc theo nó.
      </p>

      <button
        type="submit"
        className={`typeBodySmall ${forms.button}`}
        disabled={!canCreate || pending}
      >
        Thêm lựa chọn
      </button>
    </form>
  );
}

/**
 * Chọn icon từ danh mục ĐÓNG.
 *
 * Danh sách lấy từ chính `survey-icons.tsx`, nơi định nghĩa hình — không viết tay lần nữa.
 * Không có ô nhập tự do: SVG tự nhập là markup chạy được và CSP theo nonce sẽ chặn, còn URL
 * ảnh thì vướng cả allowlist host lẫn `img-src`.
 *
 * Hiện HÌNH THẬT chứ không chỉ tên khoá — người biên tập cần thấy thứ người dùng sẽ thấy.
 */
function IconPicker({
  value,
  onChange,
  pending,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  pending: boolean;
}) {
  return (
    <fieldset>
      <legend className="typeCaption textSecondary">Icon</legend>

      <div className={styles.iconGrid}>
        <button
          type="button"
          className={`typeCaption ${styles.iconChoice} ${value === null ? styles.iconChoiceSelected : ''}`}
          onClick={() => onChange(null)}
          disabled={pending}
          aria-pressed={value === null}
        >
          Không icon
        </button>

        {SURVEY_ICON_KEYS.map((name) => (
          <button
            key={name}
            type="button"
            className={`typeCaption ${styles.iconChoice} ${value === name ? styles.iconChoiceSelected : ''}`}
            onClick={() => onChange(name)}
            disabled={pending}
            aria-pressed={value === name}
          >
            <SurveyIcon name={name} />
            {name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
