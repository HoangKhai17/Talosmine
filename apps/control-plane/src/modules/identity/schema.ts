import { sql } from 'drizzle-orm';
import { customType, index, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts, controlPlane } from '../account/schema.js';

/**
 * `bytea` không có sẵn trong drizzle-orm/pg-core nên khai bằng customType.
 * Dùng cho hash token — lưu Buffer nhị phân, không phải chuỗi.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * Module Identity sở hữu `external_identities` (và `web_sessions` — thêm khi làm session).
 *
 * Xem ghi chú SQL-first ở account/schema.ts. File này khớp migration 0002.
 */
export const externalIdentities = controlPlane.table(
  'external_identities',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull(),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Khóa liên kết danh tính DUY NHẤT — không bao giờ theo email.
    uniqueIndex('external_identities_issuer_subject_key').on(table.issuer, table.subject),
    index('external_identities_account_idx').on(table.accountId),
  ],
);

export type ExternalIdentityRow = typeof externalIdentities.$inferSelect;

/**
 * `web_sessions` — phiên đăng nhập phía server (khớp migration 0003).
 *
 * Bảo mật cốt lõi: CHỈ lưu HASH của token, không bao giờ token thô. DB bị lộ cũng không
 * dựng lại được token để mạo danh phiên.
 */
export const webSessions = controlPlane.table(
  'web_sessions',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    sessionTokenHash: bytea('session_token_hash').notNull(),
    csrfTokenHash: bytea('csrf_token_hash').notNull(),
    /** Claim `sid` do IdP phát — dùng để propagate logout từ phía IdP về phiên của ta. */
    idpSid: text('idp_sid'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revocationReason: text('revocation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('web_sessions_token_hash_key').on(table.sessionTokenHash),
    index('web_sessions_account_active_idx')
      .on(table.accountId, table.expiresAt)
      .where(sql`${table.revokedAt} IS NULL`),
  ],
);

export type WebSessionRow = typeof webSessions.$inferSelect;
