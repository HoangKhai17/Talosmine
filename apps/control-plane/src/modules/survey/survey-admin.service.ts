import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { isValidContentTransition, type PublishableStatus } from '../../shared/content-status.js';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import type { AdminMutationContext } from '../admin/admin.service.js';
import { appendAuditEvent } from '../audit/audit.js';
import {
  SURVEY_LOCALES,
  type SurveyIcon,
  type SurveyLocale,
  type SurveyQuestionKind,
  surveyAnswers,
  surveyOptions,
  surveyOptionTranslations,
  surveyQuestions,
  surveyQuestionTranslations,
  surveyResponses,
} from './schema.js';

/** Một đoạn văn bản theo ngôn ngữ. `null` ở đường ghi nghĩa là XOÁ bản dịch. */
export type LocalizedInput = Partial<Record<SurveyLocale, string | null>>;
type LocalizedView = Partial<Record<SurveyLocale, string | null>>;

export interface AdminSurveyOptionView {
  id: string;
  key: string;
  icon: string | null;
  sortOrder: number;
  status: string;
  labels: LocalizedView;
  descriptions: LocalizedView;
  updatedAt: string;
}

export interface AdminSurveyQuestionView {
  id: string;
  key: string;
  kind: SurveyQuestionKind;
  minSelect: number;
  sortOrder: number;
  status: string;
  titles: LocalizedView;
  descriptions: LocalizedView;
  options: AdminSurveyOptionView[];
  updatedAt: string;
}

export interface SurveySummaryView {
  totalResponses: number;
  completedCount: number;
  skippedCount: number;
  questions: {
    key: string;
    title: string | null;
    respondentCount: number;
    options: {
      key: string;
      label: string | null;
      icon: string | null;
      status: string;
      count: number;
    }[];
  }[];
}

export interface SurveyResponseRecordView {
  id: string;
  accountId: string;
  status: string;
  locale: string;
  createdAt: string;
  answers: { questionKey: string; optionKeys: string[] }[];
}

export class SurveyAdminError extends Error {
  constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'DUPLICATE_KEY'
      | 'INVALID_STATUS_TRANSITION'
      | 'INVALID_REORDER'
      | 'INVALID_CURSOR'
      | 'INVALID_MIN_SELECT'
      | 'NO_LABEL'
      | 'NO_TITLE'
      | 'OPTION_IN_USE',
    message: string,
  ) {
    super(message);
    this.name = 'SurveyAdminError';
  }
}

export interface UpdateQuestionInput {
  minSelect?: number | undefined;
  titles?: LocalizedInput | undefined;
  descriptions?: LocalizedInput | undefined;
}

export interface CreateOptionInput {
  questionKey: string;
  key: string;
  icon?: SurveyIcon | null | undefined;
  labels: LocalizedInput;
  descriptions?: LocalizedInput | undefined;
  sortOrder?: number | undefined;
}

export interface UpdateOptionInput {
  icon?: SurveyIcon | null | undefined;
  labels?: LocalizedInput | undefined;
  descriptions?: LocalizedInput | undefined;
}

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * Quản trị nội dung khảo sát và đọc kết quả.
 *
 * TÁCH KHỎI `SurveyService` vì hai bề mặt có hai luật khác nhau: `SurveyService` phục vụ
 * người dùng cuối và chỉ thấy những gì `active`, còn ở đây mọi trạng thái và mọi ngôn ngữ
 * đều hiện ra. Gộp lại sẽ khiến mỗi truy vấn phải mang thêm một cờ "đang là admin hay không",
 * và cờ đó chính là chỗ để một hàng `draft` rò ra người dùng.
 *
 * BA RÀNG BUỘC KHÔNG HIỂN NHIÊN, mỗi cái chặn một cách làm hỏng khảo sát bằng thao tác hợp lệ:
 *
 * 1. **`minSelect` không được vượt số lựa chọn `active`.** Đặt "chọn ít nhất 5" cho câu chỉ
 *    còn 3 ô nghĩa là không ai nộp nổi khảo sát nữa. Kiểm ở CẢ HAI đường: lúc đổi `minSelect`
 *    và lúc gỡ một lựa chọn xuống.
 *
 * 2. **`key` bất biến.** Câu trả lời đã thu thập trỏ tới `option_id`, nhưng báo cáo và mọi
 *    phân tích ngoài hệ thống đọc theo `key`. Đổi khoá là làm dữ liệu lịch sử nói sai đối
 *    tượng — cùng lý do `applications.key` bất biến.
 *
 * 3. **Lựa chọn đã có người trả lời thì không xoá được.** `ON DELETE RESTRICT` ở
 *    `survey_answers` chặn ở tầng database; ở đây chỉ dịch lỗi đó thành 409 kèm lời khuyên
 *    dùng `inactive`.
 */
@Injectable()
export class SurveyAdminService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  // ── Đường đọc: nội dung ──────────────────────────────────────────────────────

  /** Toàn bộ câu hỏi kèm lựa chọn, MỌI trạng thái, MỌI ngôn ngữ. */
  async listQuestions(): Promise<AdminSurveyQuestionView[]> {
    const questions = await this.database.db
      .select()
      .from(surveyQuestions)
      .orderBy(asc(surveyQuestions.sortOrder));

    if (questions.length === 0) return [];

    const questionIds = questions.map((q) => q.id);

    const [questionTexts, options] = await Promise.all([
      this.database.db
        .select()
        .from(surveyQuestionTranslations)
        .where(inArray(surveyQuestionTranslations.questionId, questionIds)),
      this.database.db
        .select()
        .from(surveyOptions)
        .where(inArray(surveyOptions.questionId, questionIds))
        .orderBy(asc(surveyOptions.sortOrder)),
    ]);

    const optionTexts =
      options.length === 0
        ? []
        : await this.database.db
            .select()
            .from(surveyOptionTranslations)
            .where(
              inArray(
                surveyOptionTranslations.optionId,
                options.map((o) => o.id),
              ),
            );

    const questionTitles = new Map<string, LocalizedView>();
    const questionDescriptions = new Map<string, LocalizedView>();
    for (const row of questionTexts) {
      const locale = row.locale as SurveyLocale;
      collect(questionTitles, row.questionId, locale, row.title);
      collect(questionDescriptions, row.questionId, locale, row.description);
    }

    const optionLabels = new Map<string, LocalizedView>();
    const optionDescriptions = new Map<string, LocalizedView>();
    for (const row of optionTexts) {
      const locale = row.locale as SurveyLocale;
      collect(optionLabels, row.optionId, locale, row.label);
      collect(optionDescriptions, row.optionId, locale, row.description);
    }

    const optionsByQuestion = new Map<string, AdminSurveyOptionView[]>();
    for (const option of options) {
      const bucket = optionsByQuestion.get(option.questionId) ?? [];
      bucket.push({
        id: option.id,
        key: option.key,
        icon: option.icon,
        sortOrder: option.sortOrder,
        status: option.status,
        labels: optionLabels.get(option.id) ?? {},
        descriptions: optionDescriptions.get(option.id) ?? {},
        updatedAt: option.updatedAt.toISOString(),
      });
      optionsByQuestion.set(option.questionId, bucket);
    }

    return questions.map((q) => ({
      id: q.id,
      key: q.key,
      kind: q.kind as SurveyQuestionKind,
      minSelect: q.minSelect,
      sortOrder: q.sortOrder,
      status: q.status,
      titles: questionTitles.get(q.id) ?? {},
      descriptions: questionDescriptions.get(q.id) ?? {},
      options: optionsByQuestion.get(q.id) ?? [],
      updatedAt: q.updatedAt.toISOString(),
    }));
  }

  // ── Đường đọc: kết quả ───────────────────────────────────────────────────────

  /**
   * Số liệu tổng hợp — thứ thật sự trả lời mục đích "thu thập thông tin".
   *
   * `respondentCount` đếm SỐ NGƯỜI trả lời câu đó, khác tổng `count` của các lựa chọn ở câu
   * `multi` vì một người chọn nhiều ô. Thiếu con số này thì mọi phần trăm tính trên tổng
   * lượt chọn đều sai.
   *
   * LEFT JOIN với bảng bản dịch, ngược với đường công khai: một lựa chọn thiếu bản dịch vẫn
   * phải xuất hiện trong báo cáo kèm số đếm của nó. Bỏ nó đi thì con số biến mất mà không ai
   * biết là đã mất.
   */
  async summary(locale: SurveyLocale): Promise<SurveySummaryView> {
    const [byStatus, perQuestion, perOption, questions, options] = await Promise.all([
      this.database.db
        .select({ status: surveyResponses.status, count: countInt() })
        .from(surveyResponses)
        .groupBy(surveyResponses.status),

      this.database.db
        .select({
          questionId: surveyAnswers.questionId,
          count: sql<number>`count(DISTINCT ${surveyAnswers.responseId})::int`,
        })
        .from(surveyAnswers)
        .groupBy(surveyAnswers.questionId),

      this.database.db
        .select({ optionId: surveyAnswers.optionId, count: countInt() })
        .from(surveyAnswers)
        .groupBy(surveyAnswers.optionId),

      this.database.db
        .select({
          id: surveyQuestions.id,
          key: surveyQuestions.key,
          sortOrder: surveyQuestions.sortOrder,
          title: surveyQuestionTranslations.title,
        })
        .from(surveyQuestions)
        .leftJoin(
          surveyQuestionTranslations,
          and(
            eq(surveyQuestionTranslations.questionId, surveyQuestions.id),
            eq(surveyQuestionTranslations.locale, locale),
          ),
        )
        .orderBy(asc(surveyQuestions.sortOrder)),

      this.database.db
        .select({
          id: surveyOptions.id,
          questionId: surveyOptions.questionId,
          key: surveyOptions.key,
          icon: surveyOptions.icon,
          status: surveyOptions.status,
          label: surveyOptionTranslations.label,
        })
        .from(surveyOptions)
        .leftJoin(
          surveyOptionTranslations,
          and(
            eq(surveyOptionTranslations.optionId, surveyOptions.id),
            eq(surveyOptionTranslations.locale, locale),
          ),
        )
        .orderBy(asc(surveyOptions.sortOrder)),
    ]);

    const completedCount = byStatus.find((r) => r.status === 'completed')?.count ?? 0;
    const skippedCount = byStatus.find((r) => r.status === 'skipped')?.count ?? 0;

    const respondents = new Map(perQuestion.map((r) => [r.questionId, r.count]));
    const counts = new Map(perOption.map((r) => [r.optionId, r.count]));

    const optionsByQuestion = new Map<string, SurveySummaryView['questions'][number]['options']>();
    for (const option of options) {
      const bucket = optionsByQuestion.get(option.questionId) ?? [];
      bucket.push({
        key: option.key,
        label: option.label,
        icon: option.icon,
        status: option.status,
        count: counts.get(option.id) ?? 0,
      });
      optionsByQuestion.set(option.questionId, bucket);
    }

    return {
      totalResponses: completedCount + skippedCount,
      completedCount,
      skippedCount,
      questions: questions.map((q) => ({
        key: q.key,
        title: q.title,
        respondentCount: respondents.get(q.id) ?? 0,
        options: optionsByQuestion.get(q.id) ?? [],
      })),
    };
  }

  /**
   * Danh sách lượt trả lời, mới nhất trước.
   *
   * Phân trang bằng cursor `createdAt` — cùng khuôn với `/v1/admin/audit`, và cùng giới hạn
   * đã biết: hai bản ghi trùng mốc thời gian tới microsecond sẽ khiến một bản bị bỏ qua ở
   * trang sau. Với dữ liệu do người dùng tạo rời rạc thì rủi ro đó không đáng đánh đổi bằng
   * một cursor phức hợp.
   *
   * DỮ LIỆU CÁ NHÂN — thời hạn lưu thuộc DEC-B11, chưa chốt.
   */
  async listResponses(params: {
    limit: number;
    cursor?: string | undefined;
  }): Promise<{ items: SurveyResponseRecordView[]; nextCursor: string | null }> {
    const before = params.cursor === undefined ? undefined : new Date(params.cursor);
    if (before !== undefined && Number.isNaN(before.getTime())) {
      // Cursor hỏng KHÔNG âm thầm trả trang đầu: người gọi sẽ tưởng mình đang đọc trang tiếp
      // theo và bỏ sót toàn bộ phần giữa.
      throw new SurveyAdminError('INVALID_CURSOR', '`cursor` không phải mốc thời gian hợp lệ.');
    }

    // Lấy dư MỘT hàng để biết còn trang sau hay không, thay vì đếm tổng.
    const rows = await this.database.db
      .select()
      .from(surveyResponses)
      .where(before === undefined ? undefined : lt(surveyResponses.createdAt, before))
      .orderBy(desc(surveyResponses.createdAt))
      .limit(params.limit + 1);

    const page = rows.slice(0, params.limit);
    const nextCursor =
      rows.length > params.limit ? (page.at(-1)?.createdAt.toISOString() ?? null) : null;

    if (page.length === 0) return { items: [], nextCursor: null };

    const answers = await this.database.db
      .select({
        responseId: surveyAnswers.responseId,
        questionKey: surveyQuestions.key,
        optionKey: surveyOptions.key,
        sortOrder: surveyOptions.sortOrder,
      })
      .from(surveyAnswers)
      .innerJoin(surveyQuestions, eq(surveyQuestions.id, surveyAnswers.questionId))
      .innerJoin(surveyOptions, eq(surveyOptions.id, surveyAnswers.optionId))
      .where(
        inArray(
          surveyAnswers.responseId,
          page.map((r) => r.id),
        ),
      )
      .orderBy(asc(surveyQuestions.sortOrder), asc(surveyOptions.sortOrder));

    const byResponse = new Map<string, Map<string, string[]>>();
    for (const row of answers) {
      const perQuestion = byResponse.get(row.responseId) ?? new Map<string, string[]>();
      const keys = perQuestion.get(row.questionKey) ?? [];
      keys.push(row.optionKey);
      perQuestion.set(row.questionKey, keys);
      byResponse.set(row.responseId, perQuestion);
    }

    return {
      items: page.map((row) => ({
        id: row.id,
        accountId: row.accountId,
        status: row.status,
        locale: row.locale,
        createdAt: row.createdAt.toISOString(),
        answers: [...(byResponse.get(row.id) ?? new Map<string, string[]>())].map(
          ([questionKey, optionKeys]) => ({ questionKey, optionKeys }),
        ),
      })),
      nextCursor,
    };
  }

  // ── Đường ghi: câu hỏi ───────────────────────────────────────────────────────

  /**
   * Sửa `minSelect` và bản dịch của một câu hỏi.
   *
   * KHÔNG sửa `key` (code render theo nó) và KHÔNG sửa `kind` — đổi `multi` thành `single`
   * khiến dữ liệu đã thu thập mâu thuẫn với ràng buộc mới, và không có cách nào sửa ngược
   * dữ liệu đó cho đúng.
   */
  async updateQuestion(
    id: string,
    input: UpdateQuestionInput,
    ctx: AdminMutationContext,
  ): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const rows = await tx
        .select({ key: surveyQuestions.key, kind: surveyQuestions.kind })
        .from(surveyQuestions)
        .where(eq(surveyQuestions.id, id))
        .limit(1);

      const question = rows[0];
      if (!question) throw new SurveyAdminError('NOT_FOUND', 'Không tìm thấy câu hỏi.');

      if (input.minSelect !== undefined) {
        await assertMinSelectFits(tx, id, question.kind, input.minSelect);

        await tx
          .update(surveyQuestions)
          .set({ minSelect: input.minSelect, updatedAt: sql`now()` })
          .where(eq(surveyQuestions.id, id));
      }

      const touched = await applyTranslations(tx, {
        table: 'question',
        ownerId: id,
        primary: input.titles,
        secondary: input.descriptions,
      });

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'survey_question.updated',
        targetType: 'survey_question',
        targetId: id,
        targetKey: question.key,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { minSelect: input.minSelect ?? null, locales: touched },
      });
    });
  }

  // ── Đường ghi: lựa chọn ──────────────────────────────────────────────────────

  /** Thêm một lựa chọn. LUÔN ở `draft` — đưa ra trước người dùng cần `content:publish`. */
  async create(input: CreateOptionInput, ctx: AdminMutationContext): Promise<string> {
    if (!hasAnyText(input.labels)) {
      throw new SurveyAdminError('NO_LABEL', 'Phải có ít nhất một nhãn (vi hoặc en).');
    }

    const id = uuidv7();

    try {
      await this.database.db.transaction(async (tx) => {
        const rows = await tx
          .select({ id: surveyQuestions.id })
          .from(surveyQuestions)
          .where(eq(surveyQuestions.key, input.questionKey))
          .limit(1);

        const question = rows[0];
        if (!question) throw new SurveyAdminError('NOT_FOUND', 'Không tìm thấy câu hỏi.');

        const sortOrder = input.sortOrder ?? (await nextSortOrder(tx, question.id));

        await tx.insert(surveyOptions).values({
          id,
          questionId: question.id,
          key: input.key,
          icon: input.icon ?? null,
          sortOrder,
          status: 'draft',
        });

        await applyTranslations(tx, {
          table: 'option',
          ownerId: id,
          primary: input.labels,
          secondary: input.descriptions,
        });

        await appendAuditEvent(tx, {
          actor: { type: 'account', accountId: ctx.actorAccountId },
          action: 'survey_option.created',
          targetType: 'survey_option',
          targetId: id,
          targetKey: `${input.questionKey}:${input.key}`,
          reason: ctx.reason,
          correlationId: ctx.correlationId,
          details: { icon: input.icon ?? null, sortOrder },
        });
      });
    } catch (error) {
      if (isPgError(error, UNIQUE_VIOLATION)) {
        throw new SurveyAdminError(
          'DUPLICATE_KEY',
          `Câu hỏi này đã có lựa chọn với khoá \`${input.key}\`.`,
        );
      }
      throw error;
    }

    return id;
  }

  /** Sửa icon và bản dịch. `key` và `status` đi đường khác — xem ghi chú ở đầu lớp. */
  async update(id: string, input: UpdateOptionInput, ctx: AdminMutationContext): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const option = await loadOption(tx, id);

      if (input.icon !== undefined) {
        await tx
          .update(surveyOptions)
          .set({ icon: input.icon, updatedAt: sql`now()` })
          .where(eq(surveyOptions.id, id));
      }

      const touched = await applyTranslations(tx, {
        table: 'option',
        ownerId: id,
        primary: input.labels,
        secondary: input.descriptions,
      });

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'survey_option.updated',
        targetType: 'survey_option',
        targetId: id,
        targetKey: `${option.questionKey}:${option.key}`,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { iconChanged: input.icon !== undefined, locales: touched },
      });
    });
  }

  /**
   * Đưa lựa chọn ra hoặc gỡ khỏi khảo sát.
   *
   * GỠ XUỐNG CÓ THỂ LÀM HỎNG CÂU HỎI: gỡ tới mức số lựa chọn `active` thấp hơn `minSelect`
   * thì không ai nộp nổi khảo sát nữa, mà mọi thao tác riêng lẻ đều trông hợp lệ. Chặn ở đây
   * là chỗ duy nhất nhìn thấy được cả hai con số.
   */
  async changeStatus(
    id: string,
    next: PublishableStatus,
    ctx: AdminMutationContext,
  ): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const option = await loadOption(tx, id);

      if (!isValidContentTransition(option.status, next)) {
        throw new SurveyAdminError(
          'INVALID_STATUS_TRANSITION',
          `Không thể chuyển từ \`${option.status}\` sang \`${next}\`.`,
        );
      }

      if (next === 'inactive') {
        await assertRemainingOptionsFit(tx, option.questionId, id);
      }

      await tx
        .update(surveyOptions)
        .set({ status: next, updatedAt: sql`now()` })
        .where(eq(surveyOptions.id, id));

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: `survey_option.${next === 'active' ? 'published' : 'unpublished'}`,
        targetType: 'survey_option',
        targetId: id,
        targetKey: `${option.questionKey}:${option.key}`,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { from: option.status, to: next },
      });
    });
  }

  /**
   * Sắp xếp lại toàn bộ lựa chọn của một câu hỏi.
   *
   * NHẬN TRỌN DANH SÁCH, không nhận "đổi chỗ hai mục" — kết quả không phụ thuộc thứ tự
   * request tới, nên hai người biên tập thao tác cùng lúc không tạo ra thứ tự lai.
   *
   * DỰA VÀO UNIQUE DEFERRABLE: trong lúc gán lại chỉ số, hai hàng sẽ tạm thời trùng
   * `sort_order`. Ràng buộc `survey_options_question_sort_key` khai `DEFERRABLE INITIALLY
   * DEFERRED` ở migration 0012 nên phép kiểm dời tới lúc COMMIT.
   */
  async reorder(
    questionKey: string,
    optionIds: string[],
    ctx: AdminMutationContext,
  ): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: surveyQuestions.id })
        .from(surveyQuestions)
        .where(eq(surveyQuestions.key, questionKey))
        .limit(1);

      const question = rows[0];
      if (!question) throw new SurveyAdminError('NOT_FOUND', 'Không tìm thấy câu hỏi.');

      const current = await tx
        .select({ id: surveyOptions.id })
        .from(surveyOptions)
        .where(eq(surveyOptions.questionId, question.id));

      const currentIds = new Set(current.map((r) => r.id));
      const givenIds = new Set(optionIds);

      if (givenIds.size !== optionIds.length) {
        throw new SurveyAdminError('INVALID_REORDER', 'Danh sách chứa id trùng lặp.');
      }
      // Phải khớp TRỌN VẸN: thiếu id nào thì mục đó giữ chỉ số cũ và có thể đụng độ chỉ số
      // mới; thừa id thì client đang nghĩ câu hỏi này chứa thứ nó không chứa. Cả hai đều là
      // dấu hiệu client và server bất đồng về trạng thái — dừng lại an toàn hơn.
      if (givenIds.size !== currentIds.size || optionIds.some((id) => !currentIds.has(id))) {
        throw new SurveyAdminError(
          'INVALID_REORDER',
          'Danh sách phải chứa đúng và đủ mọi lựa chọn của câu hỏi này.',
        );
      }

      for (const [index, id] of optionIds.entries()) {
        await tx
          .update(surveyOptions)
          .set({ sortOrder: index, updatedAt: sql`now()` })
          .where(eq(surveyOptions.id, id));
      }

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'survey_question.options_reordered',
        targetType: 'survey_question',
        targetId: question.id,
        targetKey: questionKey,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { order: optionIds },
      });
    });
  }

  /**
   * Xoá một lựa chọn.
   *
   * CHỈ XOÁ ĐƯỢC KHI CHƯA AI CHỌN. `ON DELETE RESTRICT` ở `survey_answers` là chốt chặn thật;
   * ở đây chỉ dịch lỗi khoá ngoại thành thông điệp nói được phải làm gì thay thế. Xoá một
   * lựa chọn đã có người trả lời sẽ làm mọi số liệu lịch sử trỏ vào hư không.
   */
  async remove(id: string, ctx: AdminMutationContext): Promise<void> {
    try {
      await this.database.db.transaction(async (tx) => {
        const option = await loadOption(tx, id);

        if (option.status === 'active') {
          await assertRemainingOptionsFit(tx, option.questionId, id);
        }

        await tx.delete(surveyOptions).where(eq(surveyOptions.id, id));

        await appendAuditEvent(tx, {
          actor: { type: 'account', accountId: ctx.actorAccountId },
          action: 'survey_option.deleted',
          targetType: 'survey_option',
          targetId: id,
          targetKey: `${option.questionKey}:${option.key}`,
          reason: ctx.reason,
          correlationId: ctx.correlationId,
          details: { status: option.status },
        });
      });
    } catch (error) {
      if (isPgError(error, FOREIGN_KEY_VIOLATION)) {
        throw new SurveyAdminError(
          'OPTION_IN_USE',
          'Lựa chọn này đã có người trả lời nên không xoá được. Chuyển sang `inactive` để gỡ khỏi khảo sát.',
        );
      }
      throw error;
    }
  }
}

// ── Trợ giúp ───────────────────────────────────────────────────────────────────

/**
 * Kiểu transaction thật, suy ra từ chính `db.transaction` thay vì khai một `Pick<...>` tối
 * thiểu. Khai tối thiểu thì mọi lời gọi phải `as unknown as Tx`, và một cast như thế sẽ nuốt
 * luôn mọi sai kiểu thật sự.
 */
type Tx = Parameters<Parameters<DatabaseClient['db']['transaction']>[0]>[0];

function countInt() {
  return sql<number>`count(*)::int`;
}

function collect(
  target: Map<string, LocalizedView>,
  ownerId: string,
  locale: SurveyLocale,
  value: string | null,
): void {
  const entry = target.get(ownerId) ?? {};
  entry[locale] = value;
  target.set(ownerId, entry);
}

function hasAnyText(input: LocalizedInput | undefined): boolean {
  if (input === undefined) return false;
  return SURVEY_LOCALES.some((locale) => {
    const value = input[locale];
    return typeof value === 'string' && value.trim() !== '';
  });
}

async function loadOption(tx: Tx, id: string) {
  const rows = await tx
    .select({
      id: surveyOptions.id,
      key: surveyOptions.key,
      status: surveyOptions.status,
      questionId: surveyOptions.questionId,
      questionKey: surveyQuestions.key,
    })
    .from(surveyOptions)
    .innerJoin(surveyQuestions, eq(surveyQuestions.id, surveyOptions.questionId))
    .where(eq(surveyOptions.id, id))
    .limit(1);

  const option = rows[0];
  if (!option) throw new SurveyAdminError('NOT_FOUND', 'Không tìm thấy lựa chọn.');
  return option;
}

/** Chỉ số kế tiếp trong câu hỏi. Câu hỏi chưa có lựa chọn nào → 0. */
async function nextSortOrder(tx: Tx, questionId: string): Promise<number> {
  const rows = await tx
    .select({ max: sql<number | null>`max(${surveyOptions.sortOrder})` })
    .from(surveyOptions)
    .where(eq(surveyOptions.questionId, questionId));

  const max = rows[0]?.max;
  return max === null || max === undefined ? 0 : Number(max) + 1;
}

async function countActiveOptions(tx: Tx, questionId: string, excludeId?: string): Promise<number> {
  const rows = await tx
    .select({ count: countInt() })
    .from(surveyOptions)
    .where(and(eq(surveyOptions.questionId, questionId), eq(surveyOptions.status, 'active')));

  const total = rows[0]?.count ?? 0;
  if (excludeId === undefined) return total;

  const excluded = await tx
    .select({ status: surveyOptions.status })
    .from(surveyOptions)
    .where(eq(surveyOptions.id, excludeId))
    .limit(1);

  return excluded[0]?.status === 'active' ? total - 1 : total;
}

/** Từ chối `minSelect` mà số lựa chọn `active` hiện có không đáp ứng nổi. */
async function assertMinSelectFits(
  tx: Tx,
  questionId: string,
  kind: string,
  minSelect: number,
): Promise<void> {
  if (kind === 'single' && minSelect !== 1) {
    throw new SurveyAdminError(
      'INVALID_MIN_SELECT',
      'Câu hỏi `single` chỉ nhận một lựa chọn, nên `minSelect` phải bằng 1.',
    );
  }

  const active = await countActiveOptions(tx, questionId);
  if (minSelect > active) {
    throw new SurveyAdminError(
      'INVALID_MIN_SELECT',
      `Câu hỏi chỉ có ${active} lựa chọn đang hiển thị, không thể yêu cầu chọn ${minSelect}.`,
    );
  }
}

/** Từ chối thao tác gỡ một lựa chọn nếu phần còn lại không đủ cho `minSelect`. */
async function assertRemainingOptionsFit(
  tx: Tx,
  questionId: string,
  removingOptionId: string,
): Promise<void> {
  const rows = await tx
    .select({ minSelect: surveyQuestions.minSelect })
    .from(surveyQuestions)
    .where(eq(surveyQuestions.id, questionId))
    .limit(1);

  const minSelect = rows[0]?.minSelect ?? 1;
  const remaining = await countActiveOptions(tx, questionId, removingOptionId);

  if (remaining < minSelect) {
    throw new SurveyAdminError(
      'INVALID_MIN_SELECT',
      `Câu hỏi yêu cầu chọn ít nhất ${minSelect}; gỡ lựa chọn này sẽ chỉ còn ${remaining} và không ai nộp được khảo sát.`,
    );
  }
}

/**
 * Ghi bản dịch cho câu hỏi hoặc lựa chọn.
 *
 * MỘT HÀM CHO CẢ HAI vì luật giống hệt nhau, chỉ khác tên bảng và tên cột. Viết hai bản là
 * tạo hai chỗ để cùng một luật lệch đi.
 *
 * BA QUY TẮC, mỗi cái xuất phát từ chỗ `title`/`label` là NOT NULL còn `description` thì không:
 *
 *   - Không gửi khoá của một ngôn ngữ → KHÔNG đụng tới bản dịch đó.
 *   - `title = null` (hoặc chuỗi rỗng) → XOÁ cả hàng, tức mất luôn `description` của ngôn ngữ
 *     đó. Đúng: chúng nằm chung một hàng, và một mô tả không có tiêu đề là dữ liệu mồ côi.
 *   - Chỉ gửi `description` cho ngôn ngữ CHƯA CÓ tiêu đề → từ chối. Không thể chèn hàng mới
 *     mà bỏ trống cột NOT NULL, và tự bịa một tiêu đề rỗng để lách sẽ đẩy chuỗi rỗng ra
 *     giao diện người dùng.
 */
async function applyTranslations(
  tx: Tx,
  args: {
    table: 'question' | 'option';
    ownerId: string;
    primary: LocalizedInput | undefined;
    secondary: LocalizedInput | undefined;
  },
): Promise<string[]> {
  const { primary, secondary } = args;
  if (primary === undefined && secondary === undefined) return [];

  const isQuestion = args.table === 'question';
  const touched: string[] = [];

  for (const locale of SURVEY_LOCALES) {
    const primaryGiven = primary?.[locale] !== undefined;
    const secondaryGiven = secondary?.[locale] !== undefined;
    if (!primaryGiven && !secondaryGiven) continue;

    touched.push(locale);

    const ownerColumn = isQuestion
      ? surveyQuestionTranslations.questionId
      : surveyOptionTranslations.optionId;
    const localeColumn = isQuestion
      ? surveyQuestionTranslations.locale
      : surveyOptionTranslations.locale;
    const scope = and(eq(ownerColumn, args.ownerId), eq(localeColumn, locale));

    const rawPrimary = primary?.[locale];
    const primaryText = typeof rawPrimary === 'string' ? rawPrimary.trim() : '';
    const rawSecondary = secondary?.[locale];
    const secondaryText = typeof rawSecondary === 'string' ? rawSecondary.trim() : null;
    // Chuỗi rỗng và `null` cùng nghĩa "không có mô tả" — không để chuỗi rỗng lọt vào DB rồi
    // hiện thành một dòng trắng trong ô lựa chọn.
    const secondaryValue = secondaryText === '' ? null : secondaryText;

    if (primaryGiven && primaryText === '') {
      if (isQuestion) {
        await tx.delete(surveyQuestionTranslations).where(scope);
      } else {
        await tx.delete(surveyOptionTranslations).where(scope);
      }
      continue;
    }

    if (!primaryGiven) {
      // Chỉ đổi mô tả — hàng phải sẵn có, vì `title`/`label` là NOT NULL.
      const updated = isQuestion
        ? await tx
            .update(surveyQuestionTranslations)
            .set({ description: secondaryValue, updatedAt: sql`now()` })
            .where(scope)
            .returning({ id: surveyQuestionTranslations.id })
        : await tx
            .update(surveyOptionTranslations)
            .set({ description: secondaryValue, updatedAt: sql`now()` })
            .where(scope)
            .returning({ id: surveyOptionTranslations.id });

      if (updated.length === 0) {
        throw new SurveyAdminError(
          'NO_TITLE',
          `Ngôn ngữ \`${locale}\` chưa có ${isQuestion ? 'tiêu đề' : 'nhãn'}, không thể đặt riêng mô tả.`,
        );
      }
      continue;
    }

    if (isQuestion) {
      await tx
        .insert(surveyQuestionTranslations)
        .values({
          id: uuidv7(),
          questionId: args.ownerId,
          locale,
          title: primaryText,
          description: secondaryValue,
        })
        .onConflictDoUpdate({
          target: [surveyQuestionTranslations.questionId, surveyQuestionTranslations.locale],
          // Không gửi `descriptions` → giữ nguyên mô tả đang có, không xoá kèm theo.
          set: {
            title: primaryText,
            ...(secondaryGiven ? { description: secondaryValue } : {}),
            updatedAt: sql`now()`,
          },
        });
    } else {
      await tx
        .insert(surveyOptionTranslations)
        .values({
          id: uuidv7(),
          optionId: args.ownerId,
          locale,
          label: primaryText,
          description: secondaryValue,
        })
        .onConflictDoUpdate({
          target: [surveyOptionTranslations.optionId, surveyOptionTranslations.locale],
          set: {
            label: primaryText,
            ...(secondaryGiven ? { description: secondaryValue } : {}),
            updatedAt: sql`now()`,
          },
        });
    }
  }

  return touched;
}

/**
 * Nhận diện lỗi PostgreSQL theo `SQLSTATE`.
 *
 * PHẢI XÉT CẢ `.cause`: Drizzle BỌC lỗi query thành `DrizzleQueryError` với `PostgresError`
 * bên trong, nên kiểm mỗi `err.code` sẽ trượt và ràng buộc database biến thành 500. Đây là
 * lỗi đã xảy ra ở module identity rồi lặp lại ở catalog — xem `isUniqueViolation` ở đó.
 */
function isPgError(error: unknown, code: string): boolean {
  const layers = [error, (error as { cause?: unknown } | null)?.cause];
  return layers.some(
    (layer) =>
      typeof layer === 'object' && layer !== null && 'code' in layer && layer.code === code,
  );
}
