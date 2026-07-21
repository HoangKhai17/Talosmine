import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { accounts } from '../account/schema.js';
import { appendAuditEvent } from '../audit/audit.js';
import type { AdminMutationContext } from './admin.service.js';
import { listAdminPermissions } from './admin-authorization.js';
import {
  type AdminPermission,
  adminRoleAssignments,
  adminRolePermissions,
  adminRoles,
} from './schema.js';

export interface AdminRoleView {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  status: string;
  permissions: string[];
}

export interface AdminAssignmentView {
  id: string;
  accountId: string;
  accountEmail: string | null;
  accountDisplayName: string | null;
  roleId: string;
  roleKey: string;
  validFrom: string;
  validUntil: string | null;
  reason: string;
  revokedAt: string | null;
}

/** Lỗi nghiệp vụ của RBAC. Controller map sang mã HTTP; service không biết gì về HTTP. */
export class RbacError extends Error {
  constructor(
    public readonly code:
      | 'ROLE_NOT_FOUND'
      | 'ACCOUNT_NOT_FOUND'
      | 'ROLE_INACTIVE'
      | 'ALREADY_ASSIGNED'
      | 'ASSIGNMENT_NOT_FOUND'
      | 'PRIVILEGE_ESCALATION',
    message: string,
  ) {
    super(message);
    this.name = 'RbacError';
  }
}

/**
 * Quản lý vai trò và phân quyền quản trị.
 *
 * Nguyên tắc xuyên suốt: DENY-BY-DEFAULT và KHÔNG CẤP VƯỢT QUYỀN CHÍNH MÌNH.
 *
 * Điều thứ hai quan trọng hơn vẻ ngoài của nó: nếu một admin chỉ có `account:read` mà cấp
 * được role chứa `admin_role:manage` cho tài khoản phụ của mình, thì mọi giới hạn quyền
 * trong hệ thống đều vô nghĩa — ai cũng tự nâng mình lên toàn quyền qua hai bước.
 */
@Injectable()
export class RbacService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  /** Danh sách role kèm permission của từng role. */
  async listRoles(): Promise<AdminRoleView[]> {
    const roles = await this.database.db
      .select({
        id: adminRoles.id,
        key: adminRoles.key,
        displayName: adminRoles.displayName,
        description: adminRoles.description,
        status: adminRoles.status,
      })
      .from(adminRoles)
      .orderBy(adminRoles.key);

    const permissions = await this.database.db
      .select({
        adminRoleId: adminRolePermissions.adminRoleId,
        permission: adminRolePermissions.permission,
      })
      .from(adminRolePermissions);

    // Gom trong bộ nhớ thay vì N+1 query: số role luôn nhỏ (đây là vai trò vận hành, không
    // phải dữ liệu người dùng), nên hai query rồi ghép là đủ và đơn giản.
    const byRole = new Map<string, string[]>();
    for (const row of permissions) {
      const list = byRole.get(row.adminRoleId) ?? [];
      list.push(row.permission);
      byRole.set(row.adminRoleId, list);
    }

    return roles.map((role) => ({
      ...role,
      permissions: (byRole.get(role.id) ?? []).sort(),
    }));
  }

  /** Assignment còn hiệu lực và đã thu hồi — lịch sử giữ nguyên, không xoá. */
  async listAssignments(): Promise<AdminAssignmentView[]> {
    const rows = await this.database.db
      .select({
        id: adminRoleAssignments.id,
        accountId: adminRoleAssignments.accountId,
        accountEmail: accounts.email,
        accountDisplayName: accounts.displayName,
        roleId: adminRoles.id,
        roleKey: adminRoles.key,
        validFrom: adminRoleAssignments.validFrom,
        validUntil: adminRoleAssignments.validUntil,
        reason: adminRoleAssignments.reason,
        revokedAt: adminRoleAssignments.revokedAt,
      })
      .from(adminRoleAssignments)
      .innerJoin(adminRoles, eq(adminRoles.id, adminRoleAssignments.adminRoleId))
      .innerJoin(accounts, eq(accounts.id, adminRoleAssignments.accountId))
      .orderBy(adminRoleAssignments.validFrom);

    return rows.map((row) => ({
      ...row,
      validFrom: row.validFrom.toISOString(),
      validUntil: row.validUntil ? row.validUntil.toISOString() : null,
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    }));
  }

  /**
   * Gán role cho một account.
   *
   * Ba lớp kiểm trước khi ghi:
   *   1. Role tồn tại và đang `active` — gán role đã vô hiệu hoá là tạo quyền chết.
   *   2. Account tồn tại.
   *   3. **Người gán phải TỰ CÓ mọi permission của role đó.** Đây là chốt chặn leo thang
   *      đặc quyền; thiếu nó thì phân quyền chỉ là hình thức.
   *
   * Toàn bộ nằm trong MỘT transaction cùng audit — audit lỗi thì việc cấp quyền rollback.
   */
  async assignRole(
    params: { roleId: string; accountId: string; validUntil?: string | undefined },
    ctx: AdminMutationContext,
  ): Promise<string> {
    return this.database.db.transaction(async (tx) => {
      const roleRows = await tx
        .select({ id: adminRoles.id, key: adminRoles.key, status: adminRoles.status })
        .from(adminRoles)
        .where(eq(adminRoles.id, params.roleId))
        .limit(1);

      const role = roleRows[0];
      if (!role) throw new RbacError('ROLE_NOT_FOUND', 'Không tìm thấy vai trò.');
      if (role.status !== 'active') {
        throw new RbacError('ROLE_INACTIVE', 'Vai trò đang bị vô hiệu hoá.');
      }

      const accountRows = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.id, params.accountId))
        .limit(1);
      if (!accountRows[0]) throw new RbacError('ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');

      // CHỐT CHẶN LEO THANG ĐẶC QUYỀN.
      const rolePermissions = await tx
        .select({ permission: adminRolePermissions.permission })
        .from(adminRolePermissions)
        .where(eq(adminRolePermissions.adminRoleId, params.roleId));

      const actorPermissions = new Set(
        await listAdminPermissions(this.database.db, ctx.actorAccountId),
      );
      const missing = rolePermissions
        .map((row) => row.permission)
        .filter((permission) => !actorPermissions.has(permission));

      if (missing.length > 0) {
        throw new RbacError(
          'PRIVILEGE_ESCALATION',
          `Không thể cấp quyền mà chính bạn không có: ${missing.join(', ')}.`,
        );
      }

      // Đã có assignment còn hiệu lực cho cùng (account, role) thì không cấp chồng —
      // database-schema mục 10.3 cấm khoảng hiệu lực chồng lấp.
      const existing = await tx
        .select({ id: adminRoleAssignments.id })
        .from(adminRoleAssignments)
        .where(
          and(
            eq(adminRoleAssignments.accountId, params.accountId),
            eq(adminRoleAssignments.adminRoleId, params.roleId),
            isNull(adminRoleAssignments.revokedAt),
            or(
              isNull(adminRoleAssignments.validUntil),
              gt(adminRoleAssignments.validUntil, sql`now()`),
            ),
          ),
        )
        .limit(1);

      if (existing[0]) {
        throw new RbacError('ALREADY_ASSIGNED', 'Tài khoản đã có vai trò này.');
      }

      const assignmentId = uuidv7();
      await tx.insert(adminRoleAssignments).values({
        id: assignmentId,
        adminRoleId: params.roleId,
        accountId: params.accountId,
        validFrom: new Date(),
        validUntil: params.validUntil ? new Date(params.validUntil) : null,
        reason: ctx.reason,
        assignedByAccountId: ctx.actorAccountId,
      });

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'admin_role.assigned',
        targetType: 'account',
        targetId: params.accountId,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { role: role.key },
      });

      return assignmentId;
    });
  }

  /**
   * Thu hồi một assignment.
   *
   * Thu hồi = ghi ba cột `revoked_*`, KHÔNG xoá dòng. Lịch sử "ai từng có quyền gì, trong
   * khoảng nào, ai thu hồi" phải giữ được — đó là mục đích của bảng này.
   */
  async revokeAssignment(assignmentId: string, ctx: AdminMutationContext): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(adminRoleAssignments)
        .set({
          revokedAt: sql`now()`,
          revokedByAccountId: ctx.actorAccountId,
          revocationReason: ctx.reason,
        })
        .where(
          and(eq(adminRoleAssignments.id, assignmentId), isNull(adminRoleAssignments.revokedAt)),
        )
        .returning({ accountId: adminRoleAssignments.accountId });

      const row = rows[0];
      if (!row) {
        throw new RbacError('ASSIGNMENT_NOT_FOUND', 'Không tìm thấy phân quyền đang hiệu lực.');
      }

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'admin_role.revoked',
        targetType: 'account',
        targetId: row.accountId,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
      });
    });
  }

  /** Danh mục permission — để giao diện hiển thị đúng những gì hệ thống thực sự hỗ trợ. */
  listPermissionCatalog(): readonly AdminPermission[] {
    // Không đọc từ DB: danh mục được khoá bằng CHECK trong migration 0005 và bản sao type
    // ở schema.ts. Trả về hằng số nghĩa là UI không bao giờ hiện một permission mà
    // database sẽ từ chối.
    return ADMIN_PERMISSION_CATALOG;
  }
}

const ADMIN_PERMISSION_CATALOG: readonly AdminPermission[] = [
  'account:read',
  'account:disable',
  'account:enable',
  'session:revoke',
  'admin_role:manage',
  'audit:read',
];
