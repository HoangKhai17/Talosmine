'use client';

import { type FormEvent, useState } from 'react';
import { ApiError, api } from '../../../lib/api-client';
import type { SurveyQuestion } from '../../../server/onboarding';
import styles from './page.module.css';
import { SurveyIcon } from './survey-icons';

export interface SurveyFormLabels {
  complete: string;
  submitting: string;
  skip: string;
  submitFailed: string;
  /** Chứa `{count}` — số lựa chọn còn thiếu. */
  needMore: string;
}

/**
 * Biểu mẫu khảo sát onboarding.
 *
 * BA ĐIỀU CHI PHỐI MÀN HÌNH NÀY:
 *
 * 1. **`multi` là checkbox, `single` là radio** — theo `kind` từ server, không đoán theo số
 *    lượng lựa chọn. Layout thiết kế vẽ nút tròn cho cả câu "chọn ít nhất 3"; dùng radio ở
 *    đó thì người dùng không chọn được nhiều, và trình đọc màn hình loan báo sai bản chất.
 *
 * 2. **Bỏ qua LUÔN dùng được.** Không có trạng thái nào làm nút đó tắt. Đây là màn hình thu
 *    thập dữ liệu tuỳ chọn, không phải cổng vào sản phẩm.
 *
 * 3. **Kiểm ở đây chỉ là phản hồi sớm.** Server kiểm lại toàn bộ (`validateAnswers`) vì
 *    endpoint mở với bất kỳ ai có phiên đăng nhập.
 */
export function SurveyForm({
  questions,
  locale,
  labels,
  doneHref,
}: {
  questions: SurveyQuestion[];
  locale: string;
  labels: SurveyFormLabels;
  /** Đích sau khi xong hoặc bỏ qua — dựng ở server để client không cần biết luật định tuyến. */
  doneHref: string;
}) {
  // Map<questionKey, Set<optionKey>>. Dùng Set vì thao tác chính là bật/tắt một khoá.
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(question: SurveyQuestion, optionKey: string) {
    setSelected((prev) => {
      const current = prev[question.key] ?? [];

      if (question.kind === 'single') {
        return { ...prev, [question.key]: [optionKey] };
      }

      const next = current.includes(optionKey)
        ? current.filter((k) => k !== optionKey)
        : [...current, optionKey];

      return { ...prev, [question.key]: next };
    });
  }

  /** Số lựa chọn còn thiếu của một câu. `0` nghĩa là đã đủ. */
  function missingCount(question: SurveyQuestion): number {
    return Math.max(0, question.minSelect - (selected[question.key]?.length ?? 0));
  }

  const canComplete = questions.every((q) => missingCount(q) === 0);

  async function send(status: 'completed' | 'skipped', event?: FormEvent) {
    event?.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      await api.post('/me/onboarding', {
        status,
        locale,
        ...(status === 'completed'
          ? {
              answers: questions.map((q) => ({
                questionKey: q.key,
                optionKeys: selected[q.key] ?? [],
              })),
            }
          : {}),
      });

      // Điều hướng cả trang chứ không `router.push`: người dùng vừa rời một luồng riêng
      // (khảo sát) để vào site, và ta muốn shell của site được dựng lại từ đầu.
      window.location.href = doneHref;
    } catch (err) {
      // 409 = đã trả lời rồi (ví dụ mở hai tab). Không phải lỗi của người dùng — đưa họ đi
      // tiếp thay vì bắt nhìn một thông báo không làm gì được.
      if (err instanceof ApiError && err.status === 409) {
        window.location.href = doneHref;
        return;
      }
      setError(err instanceof Error ? err.message : labels.submitFailed);
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void send('completed', e)}>
      {questions.map((question, index) => (
        <fieldset key={question.key} className={styles.question}>
          {/*
            `<legend>` là cách chuẩn để trình đọc màn hình gắn tiêu đề câu hỏi vào cả nhóm
            lựa chọn. Một `<h2>` rời sẽ được đọc như chữ thường, không như nhãn của nhóm.
          */}
          <legend className={styles.legend}>
            <span className={`typeBodySmall ${styles.step}`} aria-hidden="true">
              {index + 1}
            </span>
            <span className={styles.legendText}>
              <span className={`typeBody ${styles.questionTitle}`}>{question.title}</span>
              {question.description ? (
                <span className={`typeBodySmall ${styles.questionLead}`}>
                  {question.description}
                </span>
              ) : null}
            </span>
          </legend>

          <div className={styles.options}>
            {question.options.map((option) => {
              const isSelected = (selected[question.key] ?? []).includes(option.key);
              const detailed = option.description !== null;

              return (
                <label
                  key={option.key}
                  className={`${styles.option} ${detailed ? styles.optionDetailed : ''}`}
                  data-selected={isSelected || undefined}
                >
                  {/*
                    Input thật, chỉ ẩn về mặt thị giác (`.visuallyHidden`) — KHÔNG `display:
                    none`. Ẩn hẳn thì nó rơi khỏi luồng Tab và bàn phím không dùng được.
                  */}
                  <input
                    className="visuallyHidden"
                    type={question.kind === 'multi' ? 'checkbox' : 'radio'}
                    name={question.key}
                    value={option.key}
                    checked={isSelected}
                    onChange={() => toggle(question, option.key)}
                    disabled={pending}
                  />
                  <span className={styles.optionMark} aria-hidden="true" />

                  {option.icon !== null ? (
                    <SurveyIcon name={option.icon} className={styles.optionIcon} />
                  ) : null}

                  <span className={styles.optionText}>
                    <span className="typeBodySmall">{option.label}</span>
                    {option.description !== null ? (
                      <span className={`typeCaption ${styles.optionDescription}`}>
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>

          {/*
            Nhắc còn thiếu bao nhiêu. `aria-live` để người dùng bàn phím biết trạng thái đổi
            mà không phải đi tìm — nếu không, nút "Hoàn tất" tắt mà không rõ vì sao.
          */}
          {missingCount(question) > 0 ? (
            <p className={`typeCaption ${styles.hint}`} aria-live="polite">
              {labels.needMore.replace('{count}', String(missingCount(question)))}
            </p>
          ) : null}
        </fieldset>
      ))}

      {error ? (
        <p className={`typeBodySmall ${styles.error}`} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button
          type="submit"
          className={`typeBody ${styles.submit}`}
          disabled={!canComplete || pending}
        >
          {pending ? labels.submitting : labels.complete}
        </button>

        {/*
          `type="button"` để không kích hoạt submit của form. Bỏ qua KHÔNG bị vô hiệu khi
          đang gửi dở là có chủ đích — nhưng `pending` vẫn chặn gửi trùng ở `send`.
        */}
        <button
          type="button"
          className={`typeBodySmall ${styles.skip}`}
          onClick={() => void send('skipped')}
        >
          {labels.skip}
        </button>
      </div>
    </form>
  );
}
