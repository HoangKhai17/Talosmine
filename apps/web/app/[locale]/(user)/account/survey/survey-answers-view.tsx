'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '../../../../../i18n/locale';
import { format, type Messages } from '../../../../../i18n/messages';
import { ApiError, api, type OwnSurveyResponseView } from '../../../../../lib/api-client';
import styles from './page.module.css';

/**
 * Trang "câu trả lời khảo sát của tôi" — DEC-B11 câu 2 (2026-07-30): người dùng được tự
 * xem/xoá câu trả lời khảo sát onboarding của chính mình.
 *
 * KHÔNG có màn hình "sửa": khảo sát chỉ trả lời được MỘT LẦN (`UNIQUE (account_id)`) — muốn
 * đổi câu trả lời thì xoá rồi trả lời lại ở lần đăng nhập kế tiếp, không có luồng edit riêng.
 *
 * Chữ và href truyền từ server xuống; xem ghi chú ở `account-view.tsx`.
 */
export function SurveyAnswersView({
  t,
  common,
  locale,
  accountHref,
  signInHref,
}: {
  t: Messages['surveyAnswers'];
  common: Messages['common'];
  locale: Locale;
  accountHref: string;
  signInHref: string;
}) {
  const [response, setResponse] = useState<OwnSurveyResponseView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const noticeRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      setResponse(await api.get<OwnSurveyResponseView>(`/me/onboarding/response?locale=${locale}`));
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        window.location.href = signInHref;
        return;
      }
      // 404 nghĩa là "chưa trả lời" — trạng thái bình thường, không phải lỗi tải trang.
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
        return;
      }
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [locale, signInHref, t.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  async function deleteResponse() {
    if (!window.confirm(t.confirmDelete)) return;

    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      await api.delete('/me/onboarding/response');
      setResponse(null);
      setNotFound(true);
      setNotice(t.deleted);
      noticeRef.current?.focus();
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        window.location.href = signInHref;
        return;
      }
      setError(err instanceof Error ? err.message : t.deleteFailed);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="container section stack">
      <h1 className="typeH1">{t.title}</h1>

      <p className="typeBody textSecondary">{t.lead}</p>

      <div aria-live="polite" tabIndex={-1} ref={noticeRef}>
        {loading ? <p className="typeBody textSecondary">{common.loading}</p> : null}
        {notice ? <p className="typeBody">{notice}</p> : null}
        {error ? (
          <div className="notice" role="alert">
            <p className="typeBody">{error}</p>
            <button type="button" className="typeBody" onClick={() => void load()}>
              {common.retry}
            </button>
          </div>
        ) : null}
      </div>

      {!loading && notFound ? <p className={`typeBody ${styles.empty}`}>{t.empty}</p> : null}

      {!loading && response ? (
        <>
          <p className="typeBodySmall textSecondary">
            {response.status === 'skipped'
              ? format(t.skippedAt, { when: formatDateTime(response.createdAt) })
              : format(t.answeredAt, { when: formatDateTime(response.createdAt) })}
          </p>

          {response.status === 'skipped' ? (
            <p className="typeBody">{t.skippedNotice}</p>
          ) : (
            <div className={styles.answers}>
              {response.answers.map((answer) => (
                <div key={answer.questionKey} className={styles.answerCard}>
                  <h2 className={`typeH3 ${styles.questionTitle}`}>{answer.questionTitle}</h2>
                  <ul className={styles.optionList}>
                    {answer.selectedOptions.map((option) => (
                      <li key={option.key} className={styles.optionTag}>
                        {option.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className={styles.dangerZone}>
            <button
              type="button"
              className={`typeBody ${styles.deleteButton}`}
              onClick={() => void deleteResponse()}
              disabled={deleting}
            >
              {deleting ? t.deleting : t.deleteButton}
            </button>
          </div>
        </>
      ) : null}

      <p>
        <Link className="typeBody" href={accountHref}>
          {t.backToAccount}
        </Link>
      </p>
    </div>
  );
}

/** Xem ghi chú ở `account-view.tsx` — ngày giờ theo thói quen hệ điều hành, không theo trang. */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}
