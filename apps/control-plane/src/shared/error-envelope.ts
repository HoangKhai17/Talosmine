/**
 * Error envelope ổn định — phase-1 mục 9 và build-plan README "Quy ước contract xuyên phase".
 *
 * Shape này là contract công khai. Mọi lỗi rời khỏi API đều mang đúng hình dạng này,
 * kể cả lỗi không lường trước.
 */
export interface ErrorEnvelope {
  /** Mã máy đọc được, ổn định, không phụ thuộc câu chữ giao diện. */
  code: string;
  /** Thông điệp an toàn để hiển thị. Không chứa stack, secret hay chi tiết nội bộ. */
  message: string;
  /** Truy vết xuyên BFF/API/worker/log. */
  correlationId: string;
  /** Chi tiết bổ sung theo allowlist. Không bao giờ chứa dữ liệu nhạy cảm. */
  details?: Record<string, unknown>;
}

/**
 * Mã lỗi baseline của P1. Các phase sau bổ sung mã riêng của mình.
 * Giữ ổn định: client bắt theo `code`, không theo `message`.
 */
export const ErrorCode = {
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export function buildErrorEnvelope(
  code: string,
  message: string,
  correlationId: string,
  details?: Record<string, unknown>,
): ErrorEnvelope {
  const envelope: ErrorEnvelope = { code, message, correlationId };
  if (details !== undefined) {
    envelope.details = details;
  }
  return envelope;
}
