import { sql } from 'drizzle-orm';
import { index, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts, controlPlane } from '../account/schema.js';

/**
 * Module Admin sở hữu RBAC (modular.md mục 11.7). Khớp migration 0005.
 */

/**
 * Permission catalog — PHẢI khớp CHECK `admin_role_permissions_permission_check`, lần cuối
 * mở rộng ở migration 0012.
 *
 * Đây là bản sao ở tầng type để code không gõ sai; nguồn sự thật thực thi vẫn là CHECK
 * trong DB. Thêm permission = migration mới + cập nhật danh sách này.
 *
 * Danh sách này KHÔNG chỉ để gõ đúng: `grant-admin.ts` duyệt nó để cấp toàn quyền, và
 * `rbac.service.ts` trả nó ra làm catalog cho màn hình phân quyền. Bỏ sót một khoá nghĩa là
 * permission tồn tại trong database nhưng không ai cấp được qua giao diện.
 */
export const ADMIN_PERMISSIONS = [
  // P2 — identity, account, phiên, phân quyền, audit
  'account:read',
  'account:disable',
  'account:enable',
  'session:revoke',
  'admin_role:manage',
  'audit:read',
  // P3 — catalog (migration 0009). `publish` tách riêng vì đổi app sang `active` là đưa
  // nó ra trước người dùng, khác hẳn việc sửa mô tả ở trạng thái nháp.
  'catalog:read',
  'catalog:manage',
  'catalog:publish',
  // Site content — điều hướng header/footer (migration 0010). Cùng lập luận tách `publish`:
  // đổi một mục nav sang `active` là đưa nó lên MỌI trang cho MỌI khách.
  'content:read',
  'content:manage',
  'content:publish',
  // Khảo sát onboarding (migration 0012). TÁCH KHỎI `content:*` là có chủ đích: sửa câu hỏi
  // là việc biên tập, còn đọc câu trả lời là truy cập DỮ LIỆU CÁ NHÂN của người dùng. Gộp
  // chung nghĩa là ai sửa được chữ cũng đọc được dữ liệu của mọi người.
  'survey_response:read',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const adminRoles = controlPlane.table(
  'admin_roles',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('admin_roles_key_key').on(table.key),
    index('admin_roles_status_idx').on(table.status),
  ],
);

export const adminRolePermissions = controlPlane.table(
  'admin_role_permissions',
  {
    id: uuid('id').primaryKey(),
    adminRoleId: uuid('admin_role_id')
      .notNull()
      .references(() => adminRoles.id, { onDelete: 'restrict' }),
    permission: text('permission').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('admin_role_permissions_role_permission_key').on(
      table.adminRoleId,
      table.permission,
    ),
  ],
);

export const adminRoleAssignments = controlPlane.table(
  'admin_role_assignments',
  {
    id: uuid('id').primaryKey(),
    adminRoleId: uuid('admin_role_id')
      .notNull()
      .references(() => adminRoles.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    reason: text('reason').notNull(),
    assignedByAccountId: uuid('assigned_by_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByAccountId: uuid('revoked_by_account_id').references(() => accounts.id, {
      onDelete: 'restrict',
    }),
    revocationReason: text('revocation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('admin_role_assignments_lookup_idx')
      .on(table.accountId, table.validFrom, table.validUntil)
      .where(sql`${table.revokedAt} IS NULL`),
    index('admin_role_assignments_role_idx').on(table.adminRoleId),
  ],
);
