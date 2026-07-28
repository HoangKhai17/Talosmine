import { describe, expect, it } from 'vitest';
import {
  type QuestionSpec,
  validateAnswers,
} from '../../apps/control-plane/src/modules/survey/answer-validation';

/**
 * Kiểm câu trả lời khảo sát.
 *
 * VÌ SAO BỘ TEST NÀY QUAN TRỌNG: `POST /v1/me/onboarding` mở với bất kỳ ai có phiên đăng
 * nhập, nên toàn bộ màn hình khảo sát có thể bị bỏ qua bằng một lời gọi HTTP. Ràng buộc
 * "chọn ít nhất 3" mà chỉ tồn tại ở giao diện thì không phải ràng buộc.
 *
 * Phần lớn là NEGATIVE test — đó là phần dễ viết sai và không ai phát hiện.
 */

const QUESTIONS: QuestionSpec[] = [
  {
    key: 'categories',
    kind: 'multi',
    minSelect: 3,
    activeOptionKeys: ['writing', 'design', 'coding', 'video'],
  },
  {
    key: 'primary_use',
    kind: 'single',
    minSelect: 1,
    activeOptionKeys: ['personal_productivity', 'business_marketing'],
  },
];

/** Bộ trả lời hợp lệ tối thiểu — mỗi ca chỉ đổi đúng thứ nó đang kiểm. */
const VALID = [
  { questionKey: 'categories', optionKeys: ['writing', 'design', 'coding'] },
  { questionKey: 'primary_use', optionKeys: ['personal_productivity'] },
];

describe('validateAnswers — đường hợp lệ', () => {
  it('chấp nhận bộ trả lời đầy đủ và đúng luật', () => {
    expect(validateAnswers(QUESTIONS, VALID)).toEqual({ ok: true });
  });

  it('chấp nhận nhiều hơn mức tối thiểu', () => {
    const answers = [
      { questionKey: 'categories', optionKeys: ['writing', 'design', 'coding', 'video'] },
      { questionKey: 'primary_use', optionKeys: ['business_marketing'] },
    ];
    expect(validateAnswers(QUESTIONS, answers).ok).toBe(true);
  });
});

describe('validateAnswers — số lượng lựa chọn', () => {
  it('TỪ CHỐI khi câu multi chưa đủ minSelect', () => {
    const answers = [
      { questionKey: 'categories', optionKeys: ['writing', 'design'] },
      ...VALID.slice(1),
    ];
    expect(validateAnswers(QUESTIONS, answers)).toMatchObject({
      ok: false,
      code: 'BELOW_MIN_SELECT',
    });
  });

  it('TỪ CHỐI khi câu single nhận nhiều hơn một lựa chọn', () => {
    const answers = [
      VALID[0] as (typeof VALID)[number],
      {
        questionKey: 'primary_use',
        optionKeys: ['personal_productivity', 'business_marketing'],
      },
    ];
    expect(validateAnswers(QUESTIONS, answers)).toMatchObject({
      ok: false,
      code: 'TOO_MANY_FOR_SINGLE',
    });
  });
});

describe('validateAnswers — lựa chọn không hợp lệ', () => {
  it('TỪ CHỐI lựa chọn không tồn tại', () => {
    const answers = [
      { questionKey: 'categories', optionKeys: ['writing', 'design', 'khong-co-that'] },
      ...VALID.slice(1),
    ];
    expect(validateAnswers(QUESTIONS, answers)).toMatchObject({
      ok: false,
      code: 'UNKNOWN_OPTION',
    });
  });

  /**
   * Ca quan trọng nhất nhóm này: lựa chọn CÓ THẬT nhưng thuộc câu hỏi khác. Một bộ kiểm chỉ
   * tra "khoá này có tồn tại không" trên toàn hệ thống sẽ cho qua, và dữ liệu thống kê sẽ
   * đếm một lựa chọn vào nhầm câu hỏi.
   */
  it('TỪ CHỐI lựa chọn của câu hỏi KHÁC', () => {
    const answers = [
      { questionKey: 'categories', optionKeys: ['writing', 'design', 'personal_productivity'] },
      ...VALID.slice(1),
    ];
    expect(validateAnswers(QUESTIONS, answers)).toMatchObject({
      ok: false,
      code: 'UNKNOWN_OPTION',
    });
  });

  it('TỪ CHỐI lựa chọn chưa phát hành (không nằm trong activeOptionKeys)', () => {
    // `draft`/`inactive` không có mặt trong `activeOptionKeys`, nên chúng đi cùng đường với
    // lựa chọn không tồn tại — người ngoài không phân biệt được hai trường hợp.
    const questions: QuestionSpec[] = [
      { key: 'categories', kind: 'multi', minSelect: 1, activeOptionKeys: ['writing'] },
    ];
    expect(
      validateAnswers(questions, [{ questionKey: 'categories', optionKeys: ['design'] }]),
    ).toMatchObject({ ok: false, code: 'UNKNOWN_OPTION' });
  });

  it('TỪ CHỐI lựa chọn trùng lặp', () => {
    const answers = [
      { questionKey: 'categories', optionKeys: ['writing', 'writing', 'design'] },
      ...VALID.slice(1),
    ];
    expect(validateAnswers(QUESTIONS, answers)).toMatchObject({
      ok: false,
      code: 'DUPLICATE_OPTION',
    });
  });

  it('trùng lặp KHÔNG được tính để lách minSelect', () => {
    // Nếu bộ kiểm đếm trước khi khử trùng lặp, ba lần "writing" sẽ qua được mức tối thiểu 3.
    const answers = [
      { questionKey: 'categories', optionKeys: ['writing', 'writing', 'writing'] },
      ...VALID.slice(1),
    ];
    expect(validateAnswers(QUESTIONS, answers).ok).toBe(false);
  });
});

describe('validateAnswers — hình dạng bộ trả lời', () => {
  it('TỪ CHỐI câu hỏi không tồn tại', () => {
    const answers = [...VALID, { questionKey: 'cau-la', optionKeys: ['x'] }];
    expect(validateAnswers(QUESTIONS, answers)).toMatchObject({
      ok: false,
      code: 'UNKNOWN_QUESTION',
    });
  });

  it('TỪ CHỐI cùng một câu hỏi gửi hai lần', () => {
    const answers = [...VALID, VALID[0] as (typeof VALID)[number]];
    expect(validateAnswers(QUESTIONS, answers)).toMatchObject({
      ok: false,
      code: 'DUPLICATE_QUESTION',
    });
  });

  /**
   * Thiếu câu hỏi phải bị từ chối, không lưu một phần: một bản ghi `completed` trả lời nửa
   * chừng sẽ được đếm như bản đầy đủ trong mọi thống kê. Ai không muốn trả lời thì bỏ qua —
   * đó là đường riêng (`status = 'skipped'`).
   */
  it('TỪ CHỐI khi thiếu câu trả lời cho một câu hỏi active', () => {
    expect(validateAnswers(QUESTIONS, [VALID[0] as (typeof VALID)[number]])).toMatchObject({
      ok: false,
      code: 'MISSING_QUESTION',
    });
  });

  it('TỪ CHỐI bộ trả lời rỗng', () => {
    expect(validateAnswers(QUESTIONS, []).ok).toBe(false);
  });

  it('không có câu hỏi active nào thì bộ trả lời rỗng là hợp lệ', () => {
    expect(validateAnswers([], [])).toEqual({ ok: true });
  });
});
