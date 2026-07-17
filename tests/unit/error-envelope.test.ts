import { describe, expect, it } from 'vitest';
import {
  buildErrorEnvelope,
  ErrorCode,
  type ErrorEnvelope,
} from '../../apps/control-plane/src/shared/error-envelope';

/**
 * Contract: phase-1 mục 9. Shape `{code, message, correlationId, details?}` là hợp đồng
 * công khai — client bắt lỗi theo `code`, không theo `message`.
 */
describe('error envelope', () => {
  const CORRELATION_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

  it('tạo envelope tối thiểu với đúng ba field bắt buộc', () => {
    const envelope = buildErrorEnvelope(
      ErrorCode.INTERNAL_ERROR,
      'Something went wrong.',
      CORRELATION_ID,
    );

    expect(envelope).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
      correlationId: CORRELATION_ID,
    });
  });

  it('KHÔNG gắn key `details` khi không truyền — envelope tối thiểu phải sạch', () => {
    const envelope = buildErrorEnvelope(ErrorCode.NOT_FOUND, 'Not found.', CORRELATION_ID);

    // `'details' in envelope` chứ không phải `envelope.details === undefined`:
    // JSON.stringify bỏ undefined nên hai case đó không phân biệt được qua wire,
    // nhưng chúng khác nhau với Object.keys và với consumer đọc trực tiếp.
    expect('details' in envelope).toBe(false);
    expect(Object.keys(envelope).sort()).toEqual(['code', 'correlationId', 'message']);
  });

  it('gắn `details` khi được truyền', () => {
    const envelope = buildErrorEnvelope(
      ErrorCode.VALIDATION_FAILED,
      'Validation failed.',
      CORRELATION_ID,
      { fields: ['email'] },
    );

    expect(envelope.details).toEqual({ fields: ['email'] });
  });

  it('giữ `details` rỗng khi truyền object rỗng — không nhầm với "không truyền"', () => {
    const envelope = buildErrorEnvelope(ErrorCode.FORBIDDEN, 'Forbidden.', CORRELATION_ID, {});

    expect('details' in envelope).toBe(true);
    expect(envelope.details).toEqual({});
  });

  it('serialize qua JSON giữ nguyên shape hợp đồng', () => {
    const envelope = buildErrorEnvelope(ErrorCode.UNAUTHORIZED, 'Unauthorized.', CORRELATION_ID);
    const roundTripped: ErrorEnvelope = JSON.parse(JSON.stringify(envelope));

    expect(roundTripped).toEqual(envelope);
  });

  it('mọi ErrorCode baseline có value bằng chính key — mã phải ổn định, không phải số thứ tự', () => {
    for (const [key, value] of Object.entries(ErrorCode)) {
      expect(value).toBe(key);
    }
  });

  it('code baseline của P1 đầy đủ', () => {
    expect(Object.keys(ErrorCode).sort()).toEqual([
      'FORBIDDEN',
      'INTERNAL_ERROR',
      'NOT_FOUND',
      'SERVICE_UNAVAILABLE',
      'UNAUTHORIZED',
      'VALIDATION_FAILED',
    ]);
  });
});
