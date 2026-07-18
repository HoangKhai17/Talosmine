import { integer, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { controlPlane } from '../account/schema.js';

/**
 * Module Audit sở hữu `audit_events` — ledger append-only (modular.md mục 11.7).
 *
 * Khớp migration 0004 (shape P2 staging: actor 'account'|'system', chưa có service actor).
 * KHÔNG expose bất kỳ đường UPDATE/DELETE nào ở tầng query — bảng append-only, và
 * trigger DB chặn mutation kể cả khi query builder lỡ tạo ra.
 */
export const auditEvents = controlPlane.table('audit_events', {
  id: uuid('id').primaryKey(),
  operationId: uuid('operation_id').notNull(),
  sequence: integer('sequence').notNull(),
  actorType: text('actor_type').notNull(),
  actorAccountId: uuid('actor_account_id'),
  actorServiceIdentityId: uuid('actor_service_identity_id'),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id'),
  targetKey: text('target_key'),
  reason: text('reason'),
  correlationId: uuid('correlation_id'),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuditEventRow = typeof auditEvents.$inferSelect;

/** Actor của một audit event ở P2: chỉ 'account' (có accountId) hoặc 'system' (không actor). */
export type AuditActor = { type: 'account'; accountId: string } | { type: 'system' };
