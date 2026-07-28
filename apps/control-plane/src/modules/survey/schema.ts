import { index, integer, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts, controlPlane } from '../account/schema.js';

/**
 * Module Survey sở hữu `survey_questions`, `survey_question_translations`, `survey_options`,
 * `survey_option_translations`, `survey_responses`, `survey_answers`. Khớp migration 0012.
 *
 * SQL-first (DEC-T09): migration là nguồn sự thật của DDL. File này chỉ để query có type,
 * KHÔNG dùng `drizzle-kit push`.
 */

/**
 * Khoá câu hỏi — danh mục ĐÓNG. Cấu trúc khảo sát cố định (chủ dự án chốt 2026-07-28): code
 * biết trước có ba câu nào để render đúng layout; chỉ nội dung sửa được trong `/admin`.
 */
export const SURVEY_QUESTION_KEYS = ['categories', 'primary_use', 'discover_first'] as const;
export type SurveyQuestionKey = (typeof SURVEY_QUESTION_KEYS)[number];

/**
 * Ngôn ngữ của bản dịch khảo sát. Khớp danh mục locale của web (`apps/web/lib/i18n`).
 *
 * Thiếu bản dịch cho một ngôn ngữ là hợp lệ ở `draft`, nhưng mục đó sẽ bị LOẠI khỏi đường
 * công khai của ngôn ngữ đó — join là INNER, không fallback.
 */
export const SURVEY_LOCALES = ['vi', 'en'] as const;
export type SurveyLocale = (typeof SURVEY_LOCALES)[number];

/** `multi` render checkbox, `single` render radio. */
export const SURVEY_QUESTION_KINDS = ['single', 'multi'] as const;
export type SurveyQuestionKind = (typeof SURVEY_QUESTION_KINDS)[number];

/** Trạng thái của một lần trả lời. `skipped` là dữ liệu thật, không phải "không có gì". */
export const SURVEY_RESPONSE_STATUSES = ['completed', 'skipped'] as const;
export type SurveyResponseStatus = (typeof SURVEY_RESPONSE_STATUSES)[number];

/**
 * Danh mục icon ĐÓNG — khớp CHECK ở migration. Code render SVG theo key.
 *
 * Không nhận SVG/HTML tự nhập: CSP theo nonce (DEC-T20) chặn markup inline, và nới CSP để
 * chiều một ô nhập icon là đánh đổi tệ nhất trong kiến trúc này.
 */
export const SURVEY_ICONS = [
  'writing',
  'design',
  'code',
  'video',
  'image',
  'automation',
  'research',
  'business',
  'chart',
  'chat',
  'cloud',
  'shield',
  'sparkle',
  'rocket',
  'book',
] as const;
export type SurveyIcon = (typeof SURVEY_ICONS)[number];

export const surveyQuestions = controlPlane.table(
  'survey_questions',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull(),
    kind: text('kind').notNull(),
    minSelect: integer('min_select').notNull(),
    sortOrder: integer('sort_order').notNull(),
    /** Chỉ `active`/`inactive` — hàng do migration seed nên `draft` không bao giờ đạt tới. */
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('survey_questions_key_key').on(table.key)],
);

export type SurveyQuestionRow = typeof surveyQuestions.$inferSelect;

export const surveyQuestionTranslations = controlPlane.table(
  'survey_question_translations',
  {
    id: uuid('id').primaryKey(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => surveyQuestions.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('survey_question_translations_question_locale_key').on(
      table.questionId,
      table.locale,
    ),
  ],
);

export const surveyOptions = controlPlane.table(
  'survey_options',
  {
    id: uuid('id').primaryKey(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => surveyQuestions.id, { onDelete: 'restrict' }),
    key: text('key').notNull(),
    icon: text('icon'),
    sortOrder: integer('sort_order').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // `survey_options_question_sort_key` (UNIQUE DEFERRABLE) KHÔNG khai ở đây: Drizzle sinh
  // unique thường, không sinh `DEFERRABLE`. Migration là nguồn sự thật; khai lại sai ở đây
  // chỉ tạo một mô tả lệch với database thật.
  (table) => [
    index('survey_options_question_status_sort_idx').on(
      table.questionId,
      table.status,
      table.sortOrder,
    ),
  ],
);

export type SurveyOptionRow = typeof surveyOptions.$inferSelect;

export const surveyOptionTranslations = controlPlane.table(
  'survey_option_translations',
  {
    id: uuid('id').primaryKey(),
    optionId: uuid('option_id')
      .notNull()
      .references(() => surveyOptions.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    label: text('label').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('survey_option_translations_option_locale_key').on(table.optionId, table.locale),
  ],
);

/**
 * DỮ LIỆU CÁ NHÂN. Thời hạn lưu và chính sách ẩn danh hoá thuộc DEC-B11 (đang `open`) và chỉ
 * chủ dự án chốt được — không có thời hạn nào được viết vào code.
 *
 * `UNIQUE (account_id)` ở migration cũng chính là cờ "đã onboard": có hàng nghĩa là đã hỏi.
 * Cố ý không thêm cột vào `accounts` — module Survey ghi vào bảng của module Account sẽ vi
 * phạm luật ranh giới ở `modular.md` mục 1.2.
 */
export const surveyResponses = controlPlane.table(
  'survey_responses',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    status: text('status').notNull(),
    locale: text('locale').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('survey_responses_account_key').on(table.accountId)],
);

export type SurveyResponseRow = typeof surveyResponses.$inferSelect;

export const surveyAnswers = controlPlane.table(
  'survey_answers',
  {
    id: uuid('id').primaryKey(),
    responseId: uuid('response_id')
      .notNull()
      .references(() => surveyResponses.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => surveyQuestions.id, { onDelete: 'restrict' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => surveyOptions.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('survey_answers_option_idx').on(table.optionId)],
);
