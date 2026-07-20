/**
 * Cấp quyền quản trị cho một account — chạy TAY, một lần, trên máy chủ.
 *
 * VÌ SAO LÀ SCRIPT CLI CHỨ KHÔNG PHẢI ENDPOINT:
 *
 * Việc cấp quyền admin đầu tiên là bài toán con gà–quả trứng: muốn cấp quyền phải có
 * permission `admin_role:manage`, mà chưa ai có. Ba cách thường dùng:
 *
 *   1. Script CLI (chọn cách này) — không thêm route nào ra internet. Ai chạy được nó
 *      thì vốn đã có quyền truy cập máy chủ và connection string của database, tức là
 *      đã ở trong vòng tin cậy. Không có gì để quên đóng lại.
 *   2. Endpoint bootstrap tự vô hiệu sau lần đầu — tiện hơn, nhưng nếu logic "tự vô hiệu"
 *      sai hoặc bị reset thì đó là cửa cấp quyền admin mở ra internet. phase-2 mục 11
 *      cảnh báo riêng về việc này.
 *   3. Seed trong migration — đơn giản nhất nhưng nhét định danh admin vào code đã commit.
 *
 * Script này dùng MIGRATION_DATABASE_URL (nối trực tiếp PostgreSQL) vì nó là công cụ vận
 * hành, không phải đường chạy của ứng dụng.
 *
 * Cách dùng:
 *   pnpm --filter @talosmine/control-plane admin:grant -- --subject <sub-cua-logto>
 *   pnpm --filter @talosmine/control-plane admin:grant -- --account <uuid>
 *
 * Mặc định cấp role `platform_admin` với TOÀN BỘ permission. Muốn hẹp hơn thì tạo role
 * khác qua UI sau khi đã có admin đầu tiên.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { accounts } from '../modules/account/schema.js';
import {
  ADMIN_PERMISSIONS,
  adminRoleAssignments,
  adminRolePermissions,
  adminRoles,
} from '../modules/admin/schema.js';
import { appendAuditEvent } from '../modules/audit/audit.js';
import { externalIdentities } from '../modules/identity/schema.js';
import { createDatabaseClient } from '../shared/database.js';

const ROLE_KEY = 'platform_admin';

interface Args {
  subject?: string;
  accountId?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (argv[i] === '--subject' && value) args.subject = value;
    if (argv[i] === '--account' && value) args.accountId = value;
  }
  return args;
}

function usage(): never {
  console.error(
    [
      'Cấp quyền quản trị cho một account.',
      '',
      'Cách dùng:',
      '  admin:grant -- --subject <subject-cua-IdP>',
      '  admin:grant -- --account <uuid-account>',
      '',
      'Tìm subject: đăng nhập một lần rồi xem cột `subject` trong',
      'control_plane.external_identities, hoặc xem User ID trong Logto Admin Console.',
    ].join('\n'),
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.subject && !args.accountId) usage();

  // Script vận hành → dùng đường nối trực tiếp, không qua Supavisor.
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('Thiếu MIGRATION_DATABASE_URL (hoặc DATABASE_URL).');
    process.exit(1);
  }

  const client = createDatabaseClient(url);

  try {
    const accountId = await resolveAccountId(client, args);

    await client.db.transaction(async (tx) => {
      // 1. Role `platform_admin` — tạo nếu chưa có, giữ nguyên nếu đã có.
      const existingRole = await tx
        .select({ id: adminRoles.id })
        .from(adminRoles)
        .where(eq(adminRoles.key, ROLE_KEY))
        .limit(1);

      let roleId = existingRole[0]?.id;

      if (!roleId) {
        roleId = uuidv7();
        await tx.insert(adminRoles).values({
          id: roleId,
          key: ROLE_KEY,
          displayName: 'Quản trị nền tảng',
          description: 'Toàn quyền quản trị. Tạo bởi script bootstrap.',
          status: 'active',
        });

        // Cấp toàn bộ permission trong catalog. Danh sách này khớp CHECK ở migration 0005,
        // nên thêm permission mới mà quên migration sẽ vỡ ngay tại đây thay vì âm thầm.
        for (const permission of ADMIN_PERMISSIONS) {
          await tx.insert(adminRolePermissions).values({
            id: uuidv7(),
            adminRoleId: roleId,
            permission,
          });
        }
        console.log(`Đã tạo role \`${ROLE_KEY}\` với ${ADMIN_PERMISSIONS.length} permission.`);
      } else {
        console.log(`Role \`${ROLE_KEY}\` đã tồn tại — dùng lại.`);
      }

      // 2. Đã có assignment còn hiệu lực thì dừng, không cấp chồng.
      const existingAssignment = await tx
        .select({ id: adminRoleAssignments.id })
        .from(adminRoleAssignments)
        .where(
          and(
            eq(adminRoleAssignments.accountId, accountId),
            eq(adminRoleAssignments.adminRoleId, roleId),
            isNull(adminRoleAssignments.revokedAt),
          ),
        )
        .limit(1);

      if (existingAssignment.length > 0) {
        console.log('Account này đã có quyền quản trị. Không làm gì thêm.');
        return;
      }

      const assignmentId = uuidv7();
      await tx.insert(adminRoleAssignments).values({
        id: assignmentId,
        adminRoleId: roleId,
        accountId,
        validFrom: new Date(),
        reason: 'bootstrap admin đầu tiên qua script CLI',
        // Tự gán cho chính mình: chưa có admin nào khác để đứng tên. Audit ghi actor
        // `system` để dấu vết nói đúng sự thật là thao tác này không do một admin thực hiện.
        assignedByAccountId: accountId,
      });

      // 3. Audit trong CÙNG transaction — audit lỗi thì việc cấp quyền cũng rollback.
      await appendAuditEvent(tx, {
        operationId: uuidv7(),
        sequence: 0,
        actor: { type: 'system' },
        action: 'admin_role.assigned',
        targetType: 'account',
        targetId: accountId,
        reason: 'bootstrap admin đầu tiên qua script CLI',
        details: { role: ROLE_KEY, via: 'cli' },
      });

      console.log(`Đã cấp quyền quản trị cho account ${accountId}.`);
    });
  } finally {
    await client.sql.end();
  }
}

async function resolveAccountId(
  client: ReturnType<typeof createDatabaseClient>,
  args: Args,
): Promise<string> {
  if (args.accountId) {
    const rows = await client.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, args.accountId))
      .limit(1);

    const id = rows[0]?.id;
    if (!id) throw new Error(`Không tìm thấy account ${args.accountId}.`);
    return id;
  }

  const rows = await client.db
    .select({ accountId: externalIdentities.accountId })
    .from(externalIdentities)
    .where(eq(externalIdentities.subject, args.subject as string))
    .limit(1);

  const accountId = rows[0]?.accountId;
  if (!accountId) {
    throw new Error(
      `Không tìm thấy danh tính với subject "${args.subject}". ` +
        'Người này đã đăng nhập vào Talosmine ít nhất một lần chưa?',
    );
  }
  return accountId;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
