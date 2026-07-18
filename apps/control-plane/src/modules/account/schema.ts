import { boolean, index, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Drizzle schema cho query builder (type-safe query).
 *
 * QUAN TRỌNG — quan hệ với migration: migration SQL viết tay là NGUỒN SỰ THẬT của DDL
 * (constraint có tên, trigger, grant... — những thứ Drizzle không diễn đạt hết). File này
 * CHỈ để query type-safe; nó phải KHỚP với migration nhưng KHÔNG dùng để `drizzle-kit
 * generate`. Dự án theo mô hình SQL-first (DEC-T09): apply migration tay, query bằng Drizzle.
 *
 * Module Account sở hữu bảng `accounts` (modular.md mục 4.7).
 */
export const controlPlane = pgSchema('control_plane');

export const accounts = controlPlane.table(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    status: text('status').notNull(),
    displayName: text('display_name'),
    email: text('email'),
    emailVerified: boolean('email_verified').notNull().default(false),
    locale: text('locale'),
    timezone: text('timezone'),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('accounts_status_idx').on(table.status)],
);

export type AccountRow = typeof accounts.$inferSelect;
export type AccountStatus = 'pending' | 'active' | 'disabled';
