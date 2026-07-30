export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Logger có cấu trúc DUY NHẤT của `apps/web` được phép gọi `console.*` trực tiếp — xem
 * override cho đúng file này trong `biome.json` (`noConsole`). Mọi log vận hành khác trong
 * `apps/web` PHẢI đi qua đây, không gọi `console.*` rải rác: một điểm ra duy nhất nghĩa là
 * đổi định dạng (thêm field, đổi sang một sink thật) chỉ sửa một chỗ.
 *
 * Mỗi dòng là MỘT object JSON — B3 (`pending-work.md`) chỉ cần log có cấu trúc, chưa cần
 * một hệ thống metric/APM thật; định dạng JSON là điều kiện đủ để nạp vào bất kỳ log
 * aggregator nào sau này (Loki, CloudWatch, Datadog…) mà không phải đổi code gọi.
 *
 * KHÔNG log secret: `sessionToken`/`csrfToken`/`idToken` không bao giờ được truyền vào
 * `fields` — chỉ truyền định danh an toàn (`accountId`, `sessionId`, `correlationId`,
 * `reason`…), cùng nguyên tắc đã áp dụng cho error envelope của Control Plane.
 */
export interface LogFields {
  readonly correlationId?: string | undefined;
  readonly [key: string]: unknown;
}

function emit(level: LogLevel, event: string, fields: LogFields): void {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function logInfo(event: string, fields: LogFields = {}): void {
  emit('info', event, fields);
}

export function logWarn(event: string, fields: LogFields = {}): void {
  emit('warn', event, fields);
}

export function logError(event: string, fields: LogFields = {}): void {
  emit('error', event, fields);
}
