import { index, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts, controlPlane } from '../account/schema.js';

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
