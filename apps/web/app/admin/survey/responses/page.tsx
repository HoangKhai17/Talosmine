'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  api,
  type SurveyResponseRecordView,
  type SurveySummaryView,
} from '../../../../lib/api-client';
import {
  AdminTable,
  AdminTableBodyRow,
  AdminTableCaption,
  AdminTableCell,
  AdminTableHeadCell,
} from '../../_components/admin-table';
import forms from '../../admin-forms.module.css';
import { useAdminScreen } from '../../use-admin-screen';
import styles from './page.module.css';

/**
 * Kết quả khảo sát onboarding.
 *
 * BỐN ĐIỀU CHI PHỐI MÀN HÌNH NÀY:
 *
 * 1. **Tổng hợp đứng trước, danh sách thô đứng sau.** Câu hỏi thật sự cần trả lời là "người
 *    dùng quan tâm gì", và đó là số đếm theo lựa chọn. Danh sách từng lượt chỉ hữu ích khi
 *    điều tra một trường hợp cụ thể — để nó lên đầu sẽ khiến người đọc lướt qua dữ liệu cá
 *    nhân mà chẳng vì mục đích gì.
 *
 * 2. **Phần trăm tính trên SỐ NGƯỜI trả lời câu đó**, không phải tổng lượt chọn. Ở câu chọn
 *    nhiều, một người tick ba ô; chia cho tổng lượt chọn sẽ ra những con số nhỏ đi một cách
 *    vô nghĩa và không cộng lại thành bức tranh nào.
 *
 * 3. **Tỉ lệ bỏ qua là số liệu, không phải lỗi.** Bỏ qua cao nghĩa là khảo sát đang cản
 *    đường vào sản phẩm — chính là thứ cần biết.
 *
 * 4. **Đây là DỮ LIỆU CÁ NHÂN.** Cả trang nằm sau `survey_response:read`, permission tách
 *    hẳn khỏi `content:*`. Thời hạn lưu thuộc DEC-B11 và chưa được chốt — màn hình nói rõ
 *    điều đó thay vì im lặng.
 */

const RETURN_TO = '/admin/survey/responses';

/**
 * Báo cáo đọc nhãn tiếng Việt.
 *
 * Cố định thay vì theo ngôn ngữ trình duyệt: khu vực quản trị hiện chỉ có tiếng Việt, và một
 * ô chọn ngôn ngữ ở đây sẽ là thứ duy nhất trong `/admin` có nó. Đổi khi khu vực quản trị
 * thật sự song ngữ.
 */
const REPORT_LOCALE = 'vi';

const QUESTION_LABEL: Record<string, string> = {
  categories: 'Câu 1 — Lĩnh vực quan tâm',
  primary_use: 'Câu 2 — Mục đích sử dụng chính',
  discover_first: 'Câu 3 — Biết tới Talosmine qua đâu',
};

const EMPTY_SUMMARY: SurveySummaryView = {
  totalResponses: 0,
  completedCount: 0,
  skippedCount: 0,
  questions: [],
};

export default function AdminSurveyResponsesPage() {
  const summary = useAdminScreen<SurveySummaryView>({
    path: `/admin/survey/summary?locale=${REPORT_LOCALE}`,
    returnTo: RETURN_TO,
    initial: EMPTY_SUMMARY,
  });

  return (
    <div className="stack">
      <h1 className="typeH1">Kết quả khảo sát</h1>

      <p className="typeBody textSecondary">
        Câu trả lời của người dùng khi đăng ký. Đây là dữ liệu cá nhân — chỉ mở cho vai trò có quyền{' '}
        <code>survey_response:read</code>.
      </p>

      <div aria-live="polite" tabIndex={-1} ref={summary.noticeRef}>
        {summary.loading ? <p className="typeBody textSecondary">Đang tải…</p> : null}
        {summary.error ? (
          <div className="notice" role="alert">
            <p className="typeBody">{summary.error}</p>
            <button type="button" className="typeBody" onClick={() => void summary.reload()}>
              Thử lại
            </button>
          </div>
        ) : null}
      </div>

      {!summary.loading && !summary.error ? <SummarySection data={summary.data} /> : null}

      <ResponseList />
    </div>
  );
}

function SummarySection({ data }: { data: SurveySummaryView }) {
  if (data.totalResponses === 0) {
    return (
      <section className={styles.card}>
        <h2 className="typeH3">Tổng quan</h2>
        <p className="typeBodySmall textSecondary">
          Chưa có ai trả lời khảo sát. Số liệu xuất hiện sau lần đăng ký đầu tiên.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className={styles.card}>
        <h2 className="typeH3">Tổng quan</h2>

        <div className={styles.totals}>
          <div className={styles.total}>
            <span className="typeH2">{data.totalResponses}</span>
            <span className="typeCaption textSecondary">Lượt được hỏi</span>
          </div>
          <div className={styles.total}>
            <span className="typeH2">{data.completedCount}</span>
            <span className="typeCaption textSecondary">Hoàn tất</span>
          </div>
          <div className={styles.total}>
            <span className="typeH2">{data.skippedCount}</span>
            <span className="typeCaption textSecondary">
              Bỏ qua ({percent(data.skippedCount, data.totalResponses)})
            </span>
          </div>
        </div>
      </section>

      {data.questions.map((question) => (
        <section key={question.key} className={styles.card}>
          <h2 className="typeH3">{QUESTION_LABEL[question.key] ?? question.key}</h2>

          <p className="typeCaption textSecondary">
            {question.respondentCount} người trả lời câu này. Tỉ lệ tính trên con số đó, nên ở câu
            chọn nhiều tổng các dòng có thể vượt 100%.
          </p>

          {question.options.length === 0 ? (
            <p className="typeBodySmall textSecondary">Câu hỏi này chưa có lựa chọn nào.</p>
          ) : (
            <ul className={styles.optionList}>
              {[...question.options]
                // Nhiều nhất lên đầu: đây là báo cáo, không phải màn hình sắp xếp thứ tự hiển thị.
                .sort((a, b) => b.count - a.count)
                .map((option) => (
                  <li key={option.key} className={styles.optionRow}>
                    <div className={styles.optionHead}>
                      <span className={`typeBodySmall ${styles.optionName}`}>
                        {option.label ?? option.key}
                      </span>

                      {/* Lựa chọn đã gỡ vẫn còn số đếm lịch sử — không nói rõ thì người đọc
                          tưởng báo cáo hỏng khi thấy nó không có trong khảo sát hiện tại. */}
                      {option.status !== 'active' ? (
                        <span className={`typeCaption ${forms.badge} ${forms[option.status]}`}>
                          {option.status === 'draft' ? 'Nháp' : 'Đã gỡ'}
                        </span>
                      ) : null}

                      <span className="typeBodySmall">
                        {option.count} · {percent(option.count, question.respondentCount)}
                      </span>
                    </div>

                    <div className={styles.bar} aria-hidden="true">
                      <div
                        className={styles.barFill}
                        style={{ width: percent(option.count, question.respondentCount) }}
                      />
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}

/** Danh sách từng lượt trả lời. Phân trang cursor, nối thêm chứ không thay thế. */
function ResponseList() {
  const [items, setItems] = useState<SurveyResponseRecordView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextCursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : '';
      const data = await api.get<{
        items: SurveyResponseRecordView[];
        nextCursor: string | null;
      }>(`/admin/survey/responses${query}`);

      // Tải thêm thì NỐI vào cuối, không thay thế — người đọc đang xem dở trang trước.
      setItems((prev) => (nextCursor ? [...prev, ...data.items] : data.items));
      setCursor(data.nextCursor);
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        window.location.href = `/auth?returnTo=${encodeURIComponent(RETURN_TO)}`;
        return;
      }
      setError(err instanceof Error ? err.message : 'Không tải được danh sách.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.card}>
      <h2 className="typeH3">Chi tiết từng lượt</h2>

      <p className="typeCaption textSecondary">
        Dùng khi cần đối chiếu một tài khoản cụ thể. Lựa chọn hiển thị bằng{' '}
        <strong>khoá máy</strong> để bảng đọc được như nhau kể cả sau khi nhãn hiển thị đổi.
      </p>

      <div aria-live="polite">
        {loading && items.length === 0 ? (
          <p className="typeBodySmall textSecondary">Đang tải…</p>
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

      {!loading && items.length === 0 && !error ? (
        <p className="typeBodySmall textSecondary">Chưa có lượt trả lời nào.</p>
      ) : null}

      {items.length > 0 ? (
        <>
          <AdminTable minWidth="content" presentation="plain">
              <AdminTableCaption className="typeCaption textSecondary" unstyled>
                Đang hiển thị {items.length} lượt
              </AdminTableCaption>
              <thead>
                <tr>
                  <AdminTableHeadCell scope="col" compact>Thời điểm</AdminTableHeadCell>
                  <AdminTableHeadCell scope="col" compact>Tài khoản</AdminTableHeadCell>
                  <AdminTableHeadCell scope="col" compact>Trạng thái</AdminTableHeadCell>
                  <AdminTableHeadCell scope="col" compact>Ngôn ngữ</AdminTableHeadCell>
                  <AdminTableHeadCell scope="col" compact>Lựa chọn</AdminTableHeadCell>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <AdminTableBodyRow key={row.id}>
                    <AdminTableCell compact>{formatDateTime(row.createdAt)}</AdminTableCell>
                    <AdminTableCell className={styles.mono} compact>
                      {/* Rút gọn id: đủ để đối chiếu, không biến bảng thành bức tường ký tự. */}
                      <code>{row.accountId.slice(0, 8)}…</code>
                    </AdminTableCell>
                    <AdminTableCell compact>
                      {row.status === 'completed' ? 'Hoàn tất' : 'Bỏ qua'}
                    </AdminTableCell>
                    <AdminTableCell compact>{row.locale}</AdminTableCell>
                    <AdminTableCell className={styles.mono} compact>
                      {row.answers.length === 0 ? (
                        <span className="textSecondary">—</span>
                      ) : (
                        row.answers.map((answer) => (
                          <div key={answer.questionKey}>
                            <code>{answer.questionKey}</code>: {answer.optionKeys.join(', ')}
                          </div>
                        ))
                      )}
                    </AdminTableCell>
                  </AdminTableBodyRow>
                ))}
              </tbody>
          </AdminTable>

          <div className={styles.pager}>
            <button
              type="button"
              className={`typeBodySmall ${forms.button}`}
              disabled={cursor === null || loading}
              onClick={() => cursor && void load(cursor)}
            >
              {loading ? 'Đang tải…' : cursor ? 'Tải thêm' : 'Đã hết'}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

/** Mẫu số 0 trả `0%` chứ không phải `NaN%` — câu chưa ai trả lời là chuyện bình thường. */
function percent(value: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(
    date,
  );
}
