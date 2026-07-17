import { AsyncLocalStorage } from 'node:async_hooks';
import { uuidv7 } from 'uuidv7';

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Correlation ID truyền xuyên BFF -> API -> worker -> log -> audit.
 *
 * Lưu ý contract (build-plan README): correlation ID KHÔNG phải idempotency key.
 * Nó để truy vết, không để khử trùng lặp. Đừng dùng lẫn.
 */
interface CorrelationContext {
  correlationId: string;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Chấp nhận UUID bất kỳ version. Định dạng sai thì KHÔNG từ chối request —
 * chỉ bỏ qua giá trị client gửi và sinh cái mới. Lý do: correlation ID chỉ để
 * quan sát; làm fail một request hợp lệ vì header truy vết xấu là đánh đổi sai.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Nhận ID từ client nếu hợp lệ, ngược lại sinh mới (UUIDv7 theo DEC-T06). */
export function resolveCorrelationId(incoming: unknown): string {
  return isValidCorrelationId(incoming) ? incoming : uuidv7();
}

export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

/** Trả correlation ID của ngữ cảnh hiện tại, hoặc undefined nếu ngoài request scope. */
export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
