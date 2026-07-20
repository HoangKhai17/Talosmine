import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { DatabaseClient } from '../../shared/database.js';
import type { AdminPermission } from './schema.js';
import { adminRoleAssignments, adminRolePermissions, adminRoles } from './schema.js';

type Db = DatabaseClient['db'];

/**
 * Kiểm quyền quản trị — DENY-BY-DEFAULT (modular.md mục 11.4).
 *
 * Một account chỉ có permission khi tồn tại chuỗi đầy đủ:
 *   assignment CÒN HIỆU LỰC → role ACTIVE → role có permission đó
 *
 * "Còn hiệu lực" nghĩa là: chưa thu hồi (`revoked_at IS NULL`), đã bắt đầu
 * (`valid_from <= now()`), và chưa kết thúc (`valid_until IS NULL OR valid_until > now()`).
 *
 * Mọi mốc thời gian so với DB CLOCK, không phải đồng hồ app — để một app lệch giờ không
 * thể tự kéo dài quyền của mình.
 */
export async function hasAdminPermission(
  db: Db,
  accountId: string,
  permission: AdminPermission,
): Promise<boolean> {
  const rows = await db
    .select({ ok: adminRolePermissions.id })
    .from(adminRoleAssignments)
    .innerJoin(adminRoles, eq(adminRoles.id, adminRoleAssignments.adminRoleId))
    .innerJoin(adminRolePermissions, eq(adminRolePermissions.adminRoleId, adminRoles.id))
    .where(
      and(
        eq(adminRoleAssignments.accountId, accountId),
        eq(adminRolePermissions.permission, permission),
        // Role bị vô hiệu hóa thì mọi assignment tới nó mất tác dụng ngay, không cần
        // thu hồi từng assignment.
        eq(adminRoles.status, 'active'),
        isNull(adminRoleAssignments.revokedAt),
        sql`${adminRoleAssignments.validFrom} <= now()`,
        or(
          isNull(adminRoleAssignments.validUntil),
          gt(adminRoleAssignments.validUntil, sql`now()`),
        ),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

/** Liệt kê mọi permission còn hiệu lực của một account (cho UI admin và debug). */
export async function listAdminPermissions(db: Db, accountId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ permission: adminRolePermissions.permission })
    .from(adminRoleAssignments)
    .innerJoin(adminRoles, eq(adminRoles.id, adminRoleAssignments.adminRoleId))
    .innerJoin(adminRolePermissions, eq(adminRolePermissions.adminRoleId, adminRoles.id))
    .where(
      and(
        eq(adminRoleAssignments.accountId, accountId),
        eq(adminRoles.status, 'active'),
        isNull(adminRoleAssignments.revokedAt),
        sql`${adminRoleAssignments.validFrom} <= now()`,
        or(
          isNull(adminRoleAssignments.validUntil),
          gt(adminRoleAssignments.validUntil, sql`now()`),
        ),
      ),
    );

  return rows.map((row) => row.permission);
}
