import type { SurveyQuestionKind } from './schema.js';

/**
 * Kiểm câu trả lời khảo sát trước khi ghi.
 *
 * VÌ SAO KIỂM Ở SERVER dù giao diện đã chặn: `POST /v1/me/onboarding` là endpoint công khai
 * với bất kỳ ai có phiên đăng nhập. Màn hình khảo sát có thể bị bỏ qua hoàn toàn bằng một
 * lời gọi HTTP. Ràng buộc "chọn ít nhất 3" mà chỉ tồn tại ở giao diện thì không phải ràng
 * buộc, nó là gợi ý.
 *
 * HÀM THUẦN, tách khỏi service để test được mà không cần database — cùng lý do với
 * `isValidNavTransition` của site-content.
 */

export interface QuestionSpec {
  key: string;
  kind: SurveyQuestionKind;
  minSelect: number;
  /** Khoá của các lựa chọn đang `active`. Lựa chọn `draft`/`inactive` không được nhận. */
  activeOptionKeys: readonly string[];
}

export interface SubmittedAnswer {
  questionKey: string;
  optionKeys: readonly string[];
}

export type AnswerRejection =
  | 'UNKNOWN_QUESTION'
  | 'DUPLICATE_QUESTION'
  | 'MISSING_QUESTION'
  | 'UNKNOWN_OPTION'
  | 'DUPLICATE_OPTION'
  | 'TOO_MANY_FOR_SINGLE'
  | 'BELOW_MIN_SELECT';

export interface AnswerValidationResult {
  ok: boolean;
  code?: AnswerRejection;
  message?: string;
}

export function validateAnswers(
  questions: readonly QuestionSpec[],
  submitted: readonly SubmittedAnswer[],
): AnswerValidationResult {
  const byKey = new Map(questions.map((q) => [q.key, q]));
  const seen = new Set<string>();

  for (const answer of submitted) {
    const question = byKey.get(answer.questionKey);
    if (!question) {
      return reject('UNKNOWN_QUESTION', `Không có câu hỏi \`${answer.questionKey}\`.`);
    }

    // Hai mục cho cùng một câu hỏi nghĩa là client và server đang bất đồng về hình dạng dữ
    // liệu. Gộp chúng lại sẽ che mất bất đồng đó.
    if (seen.has(answer.questionKey)) {
      return reject('DUPLICATE_QUESTION', `Câu hỏi \`${answer.questionKey}\` xuất hiện hai lần.`);
    }
    seen.add(answer.questionKey);

    const unique = new Set(answer.optionKeys);
    if (unique.size !== answer.optionKeys.length) {
      return reject('DUPLICATE_OPTION', `Câu \`${answer.questionKey}\` có lựa chọn trùng lặp.`);
    }

    const allowed = new Set(question.activeOptionKeys);
    for (const optionKey of unique) {
      // Bắt luôn cả hai trường hợp: lựa chọn không tồn tại, VÀ lựa chọn của câu hỏi khác.
      // Cái thứ hai là cách một client bị lỗi (hoặc cố ý) làm dữ liệu thống kê sai lệch.
      if (!allowed.has(optionKey)) {
        return reject(
          'UNKNOWN_OPTION',
          `Lựa chọn \`${optionKey}\` không thuộc câu \`${answer.questionKey}\` hoặc chưa được phát hành.`,
        );
      }
    }

    if (question.kind === 'single' && unique.size > 1) {
      return reject(
        'TOO_MANY_FOR_SINGLE',
        `Câu \`${answer.questionKey}\` chỉ được chọn một phương án.`,
      );
    }

    if (unique.size < question.minSelect) {
      return reject(
        'BELOW_MIN_SELECT',
        `Câu \`${answer.questionKey}\` cần ít nhất ${question.minSelect} lựa chọn.`,
      );
    }
  }

  // Thiếu câu hỏi thì từ chối thay vì lưu một phần: một bản ghi khảo sát trả lời nửa chừng
  // sẽ được đếm như bản đầy đủ trong mọi thống kê về sau. Ai không muốn trả lời thì bỏ qua
  // (`status = 'skipped'`) — đó là đường đã có.
  for (const question of questions) {
    if (!seen.has(question.key)) {
      return reject('MISSING_QUESTION', `Thiếu câu trả lời cho \`${question.key}\`.`);
    }
  }

  return { ok: true };
}

function reject(code: AnswerRejection, message: string): AnswerValidationResult {
  return { ok: false, code, message };
}
