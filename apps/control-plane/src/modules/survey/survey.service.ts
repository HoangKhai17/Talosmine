import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { type QuestionSpec, type SubmittedAnswer, validateAnswers } from './answer-validation.js';
import {
  type SurveyQuestionKind,
  type SurveyResponseStatus,
  surveyAnswers,
  surveyOptions,
  surveyOptionTranslations,
  surveyQuestions,
  surveyQuestionTranslations,
  surveyResponses,
} from './schema.js';

export interface SurveyOptionView {
  key: string;
  label: string;
  description: string | null;
  icon: string | null;
}

export interface SurveyQuestionView {
  key: string;
  kind: SurveyQuestionKind;
  minSelect: number;
  title: string;
  description: string | null;
  options: SurveyOptionView[];
}

export interface OnboardingSurveyView {
  required: boolean;
  questions: SurveyQuestionView[];
}

export class SurveyError extends Error {
  constructor(
    public readonly code: 'ALREADY_ANSWERED' | 'INVALID_ANSWERS',
    message: string,
  ) {
    super(message);
    this.name = 'SurveyError';
  }
}

export interface SubmitSurveyInput {
  status: SurveyResponseStatus;
  locale: string;
  answers?: readonly SubmittedAnswer[] | undefined;
}

/**
 * Khảo sát onboarding.
 *
 * BA NGUYÊN TẮC:
 *
 * 1. **Bỏ qua cũng là dữ liệu.** `status = 'skipped'` tạo một hàng thật. Thiếu nó thì hệ
 *    thống không phân biệt được "chưa từng hỏi" với "đã hỏi và họ từ chối" — và sẽ hỏi lại
 *    mãi mỗi lần đăng nhập.
 *
 * 2. **Không tin client.** Toàn bộ ràng buộc (lựa chọn thuộc đúng câu, đang `active`, đủ số
 *    tối thiểu) kiểm lại ở đây. Màn hình khảo sát bỏ qua được bằng một lời gọi HTTP.
 *
 * 3. **Câu trả lời trỏ `option_id`, không lưu chữ.** Đổi nhãn hiển thị về sau không làm hỏng
 *    dữ liệu lịch sử — cùng lý do `applications.key` bất biến.
 */
@Injectable()
export class SurveyService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  /**
   * Bộ câu hỏi cho một account, kèm việc account đó còn phải trả lời hay không.
   *
   * Gộp hai câu hỏi vào một endpoint là có chủ đích: BFF gọi nó ở `/auth/callback` để quyết
   * định chuyển hướng, và tách làm hai sẽ thành hai round-trip trên đường đăng nhập.
   */
  async getForAccount(accountId: string, locale: string): Promise<OnboardingSurveyView> {
    const answered = await this.hasResponded(accountId);

    // Đã trả lời rồi thì không cần dựng bộ câu hỏi — tiết kiệm ba truy vấn trên đường đăng
    // nhập của MỌI người dùng cũ, tức là gần như mọi lần đăng nhập.
    if (answered) return { required: false, questions: [] };

    return { required: true, questions: await this.readQuestions(locale) };
  }

  async hasResponded(accountId: string): Promise<boolean> {
    const rows = await this.database.db
      .select({ id: surveyResponses.id })
      .from(surveyResponses)
      .where(eq(surveyResponses.accountId, accountId))
      .limit(1);

    return rows.length > 0;
  }

  /**
   * Đọc câu hỏi `active` kèm lựa chọn `active` cho một ngôn ngữ.
   *
   * INNER JOIN với bảng bản dịch: mục thiếu bản dịch cho ngôn ngữ này bị LOẠI khỏi kết quả,
   * không rơi về ngôn ngữ khác. Cùng quy tắc đã ghi ở điều hướng site — một nhãn tiếng Việt
   * giữa màn hình tiếng Anh trông như lỗi hiển thị.
   */
  private async readQuestions(locale: string): Promise<SurveyQuestionView[]> {
    const questions = await this.database.db
      .select({
        id: surveyQuestions.id,
        key: surveyQuestions.key,
        kind: surveyQuestions.kind,
        minSelect: surveyQuestions.minSelect,
        title: surveyQuestionTranslations.title,
        description: surveyQuestionTranslations.description,
      })
      .from(surveyQuestions)
      .innerJoin(
        surveyQuestionTranslations,
        and(
          eq(surveyQuestionTranslations.questionId, surveyQuestions.id),
          eq(surveyQuestionTranslations.locale, locale),
        ),
      )
      .where(eq(surveyQuestions.status, 'active'))
      .orderBy(asc(surveyQuestions.sortOrder));

    if (questions.length === 0) return [];

    const options = await this.database.db
      .select({
        questionId: surveyOptions.questionId,
        key: surveyOptions.key,
        icon: surveyOptions.icon,
        label: surveyOptionTranslations.label,
        description: surveyOptionTranslations.description,
      })
      .from(surveyOptions)
      .innerJoin(
        surveyOptionTranslations,
        and(
          eq(surveyOptionTranslations.optionId, surveyOptions.id),
          eq(surveyOptionTranslations.locale, locale),
        ),
      )
      .where(
        and(
          eq(surveyOptions.status, 'active'),
          inArray(
            surveyOptions.questionId,
            questions.map((q) => q.id),
          ),
        ),
      )
      .orderBy(asc(surveyOptions.sortOrder));

    const byQuestion = new Map<string, SurveyOptionView[]>();
    for (const option of options) {
      const bucket = byQuestion.get(option.questionId) ?? [];
      bucket.push({
        key: option.key,
        label: option.label,
        description: option.description,
        icon: option.icon,
      });
      byQuestion.set(option.questionId, bucket);
    }

    return questions.map((q) => ({
      key: q.key,
      kind: q.kind as SurveyQuestionKind,
      minSelect: q.minSelect,
      title: q.title,
      description: q.description,
      options: byQuestion.get(q.id) ?? [],
    }));
  }

  /**
   * Ghi nhận một lần trả lời (hoặc bỏ qua).
   *
   * Toàn bộ nằm trong MỘT transaction: nếu ghi câu trả lời lỗi giữa chừng thì cả bản ghi
   * khảo sát cũng rollback. Một `survey_responses` mang `status = 'completed'` mà không có
   * câu trả lời nào sẽ làm mọi thống kê sai mà không ai phát hiện.
   */
  async submit(accountId: string, input: SubmitSurveyInput): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      // Kiểm trong CÙNG transaction, không phải trước đó: hai request song song đều thấy
      // "chưa trả lời" rồi cùng ghi. Unique index là chốt chặn cuối, nhưng kiểm sớm cho ra
      // thông điệp đúng thay vì một lỗi ràng buộc thô.
      const existing = await tx
        .select({ id: surveyResponses.id })
        .from(surveyResponses)
        .where(eq(surveyResponses.accountId, accountId))
        .limit(1);

      if (existing.length > 0) {
        throw new SurveyError('ALREADY_ANSWERED', 'Bạn đã trả lời khảo sát này rồi.');
      }

      const responseId = uuidv7();
      await tx.insert(surveyResponses).values({
        id: responseId,
        accountId,
        status: input.status,
        locale: input.locale,
      });

      // Bỏ qua thì dừng ở đây: có bản ghi để không hỏi lại, không có câu trả lời nào.
      if (input.status === 'skipped') return;

      const rows = await this.loadAnswerable(tx as unknown as ReadOnlyTx);
      const verdict = validateAnswers(rows.specs, input.answers ?? []);
      if (!verdict.ok) {
        throw new SurveyError('INVALID_ANSWERS', verdict.message ?? 'Câu trả lời không hợp lệ.');
      }

      for (const answer of input.answers ?? []) {
        const questionId = rows.questionIdByKey.get(answer.questionKey);
        if (questionId === undefined) continue; // đã được `validateAnswers` loại trừ

        for (const optionKey of answer.optionKeys) {
          const optionId = rows.optionIdByKey.get(`${answer.questionKey}:${optionKey}`);
          if (optionId === undefined) continue;

          await tx.insert(surveyAnswers).values({
            id: uuidv7(),
            responseId,
            questionId,
            optionId,
          });
        }
      }
    });
  }

  /**
   * Nạp câu hỏi `active` và lựa chọn `active` để kiểm và để tra id.
   *
   * KHÔNG join bảng bản dịch: việc kiểm không phụ thuộc ngôn ngữ. Một lựa chọn thiếu bản
   * dịch tiếng Anh vẫn là một lựa chọn hợp lệ nếu người dùng đang xem tiếng Việt.
   */
  private async loadAnswerable(tx: ReadOnlyTx) {
    const questions = await tx
      .select({
        id: surveyQuestions.id,
        key: surveyQuestions.key,
        kind: surveyQuestions.kind,
        minSelect: surveyQuestions.minSelect,
      })
      .from(surveyQuestions)
      .where(eq(surveyQuestions.status, 'active'))
      .orderBy(asc(surveyQuestions.sortOrder));

    const options =
      questions.length === 0
        ? []
        : await tx
            .select({
              questionId: surveyOptions.questionId,
              key: surveyOptions.key,
              id: surveyOptions.id,
            })
            .from(surveyOptions)
            .where(
              and(
                eq(surveyOptions.status, 'active'),
                inArray(
                  surveyOptions.questionId,
                  questions.map((q) => q.id),
                ),
              ),
            );

    const questionKeyById = new Map(questions.map((q) => [q.id, q.key]));
    const questionIdByKey = new Map(questions.map((q) => [q.key, q.id]));
    const optionIdByKey = new Map<string, string>();
    const optionKeysByQuestion = new Map<string, string[]>();

    for (const option of options) {
      const questionKey = questionKeyById.get(option.questionId);
      if (questionKey === undefined) continue;

      optionIdByKey.set(`${questionKey}:${option.key}`, option.id);
      const bucket = optionKeysByQuestion.get(questionKey) ?? [];
      bucket.push(option.key);
      optionKeysByQuestion.set(questionKey, bucket);
    }

    const specs: QuestionSpec[] = questions.map((q) => ({
      key: q.key,
      kind: q.kind as SurveyQuestionKind,
      minSelect: q.minSelect,
      activeOptionKeys: optionKeysByQuestion.get(q.key) ?? [],
    }));

    return { specs, questionIdByKey, optionIdByKey };
  }
}

/** Kiểu tối thiểu của transaction mà `loadAnswerable` cần. */
type ReadOnlyTx = Pick<DatabaseClient['db'], 'select'>;
