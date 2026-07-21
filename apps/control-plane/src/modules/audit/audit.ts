import { uuidv7 } from 'uuidv7';
import type { DatabaseClient } from '../../shared/database.js';
import { type AuditActor, auditEvents } from './schema.js';

/**
 * Transaction hoặc db — audit LUÔN phải chạy trong cùng Unit of Work với mutation nó ghi
 * nhận (modular.md mục 11.4). Kiểu này cho phép truyền `tx` vào.
 */
type Executor = Pick<DatabaseClient['db'], 'insert'>;

export interface AuditEntry {
  actor: AuditActor;
  action: string;
  targetType: string;
  targetId?: string | undefined;
  /**
   * Định danh con người đọc được của đối tượng (ví dụ `key` của application).
   *
   * Lưu KÈM `targetId` chứ không thay thế: id là khoá liên kết, còn key là thứ đọc log
   * mà hiểu ngay đang nói về app nào mà không phải tra bảng.
   */
  targetKey?: string | undefined;
  reason?: string | undefined;
  correlationId?: string | undefined;
  details?: Record<string, unknown> | undefined;
  /** ID ổn định của một logical operation; retry cùng operation dùng lại giá trị này. */
  operationId?: string | undefined;
  /** Thứ tự event trong operation, bắt đầu từ 0. */
  sequence?: number | undefined;
}

/**
 * Append một audit event.
 *
 * BẮT BUỘC gọi trong cùng transaction với mutation: nếu append thất bại, mutation phải
 * rollback (modular.md 11.4 — "append failure rollback mutation, không chuyển thành retry
 * bất đồng bộ sau khi mutation đã commit").
 *
 * KHÔNG ghi password, token, session hay dữ liệu nghiệp vụ dư thừa vào `details`.
 */
export async function appendAuditEvent(executor: Executor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditEvents).values({
    id: uuidv7(),
    operationId: entry.operationId ?? uuidv7(),
    sequence: entry.sequence ?? 0,
    actorType: entry.actor.type,
    actorAccountId: entry.actor.type === 'account' ? entry.actor.accountId : null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    targetKey: entry.targetKey ?? null,
    reason: entry.reason ?? null,
    correlationId: entry.correlationId ?? null,
    details: entry.details ?? null,
  });
}
