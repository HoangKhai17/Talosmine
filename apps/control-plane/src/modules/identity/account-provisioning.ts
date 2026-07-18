import { and, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { DatabaseClient } from '../../shared/database.js';
import { accounts } from '../account/schema.js';
import { auditEvents } from '../audit/schema.js';
import { externalIdentities } from './schema.js';

type Db = DatabaseClient['db'];

/** Danh tính đã được XÁC MINH bởi caller (token đã verify). KHÔNG nhận accountId từ client. */
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
}

/** Hồ sơ khởi tạo từ claims đã verified. Chỉ dùng khi tạo account LẦN ĐẦU. */
export interface InitialProfile {
  displayName?: string | undefined;
  email?: string | undefined;
  emailVerified?: boolean | undefined;
}

export interface ProvisionResult {
  accountId: string;
  /** true nếu account vừa được tạo; false nếu đã tồn tại (login lần sau). */
  created: boolean;
}

const UNIQUE_VIOLATION = '23505';

/**
 * Kiểm một lỗi có phải PostgreSQL SQLSTATE `code` không.
 *
 * Phải nhìn CẢ HAI tầng: postgres.js đôi khi ném PostgresError trực tiếp (`.code`), nhưng
 * Drizzle BỌC lỗi query thành `DrizzleQueryError` với PostgresError nằm ở `.cause`. Chỉ
 * kiểm `err.code` sẽ bỏ sót unique violation từ trong `db.transaction()` — và đó chính là
 * bug từng làm race handling im lặng re-throw thay vì đọc winner.
 */
function hasPgCode(err: unknown, code: string): boolean {
  const layers = [err, (err as { cause?: unknown } | null)?.cause];
  return layers.some((e) => typeof e === 'object' && e !== null && 'code' in e && e.code === code);
}

/**
 * Tạo (hoặc lấy) account từ một danh tính Auth0 đã verified.
 *
 * Hợp đồng (modular.md mục 3.5, 4.5; database-schema mục 4.2):
 *   • Liên kết DUY NHẤT bằng (issuer, subject) — KHÔNG BAO GIỜ theo email.
 *   • Lần đầu: tạo account + external_identity + audit trong MỘT transaction. Audit ghi
 *     ĐỒNG BỘ trong cùng tx — nếu audit fail, cả account lẫn identity rollback.
 *   • Account được kích hoạt `active` NGAY (DEC-B04a — policy tạm thời).
 *   • Race-safe: hai callback đồng thời cùng (issuer, subject) chỉ tạo MỘT account.
 *     Kẻ thua unique constraint rollback rồi đọc mapping của kẻ thắng — không tạo
 *     orphan account (vì account nằm cùng tx với mapping).
 */
export async function provisionByExternalIdentity(
  db: Db,
  identity: VerifiedIdentity,
  profile: InitialProfile = {},
): Promise<ProvisionResult> {
  // 1. Đã có mapping chưa? Đường nhanh cho login lần sau (đa số request).
  const existing = await findByIdentity(db, identity);
  if (existing) {
    return { accountId: existing, created: false };
  }

  // 2. Chưa có → tạo mới trong một transaction.
  try {
    return await db.transaction(async (tx) => {
      const accountId = uuidv7();

      // email_verified=true chỉ hợp lệ khi có email (khớp accounts_email_verified_check).
      // Không có email thì ép false — không "xác minh một email không tồn tại".
      const email = profile.email ?? null;
      const emailVerified = email !== null ? (profile.emailVerified ?? false) : false;

      await tx.insert(accounts).values({
        id: accountId,
        status: 'active', // DEC-B04a
        displayName: profile.displayName ?? null,
        email,
        emailVerified,
      });

      await tx.insert(externalIdentities).values({
        id: uuidv7(),
        accountId,
        provider: 'auth0',
        issuer: identity.issuer,
        subject: identity.subject,
        lastSeenAt: new Date(),
      });

      // Audit ĐỒNG BỘ trong cùng transaction (modular.md luật 5). Audit fail → rollback tất cả.
      await tx.insert(auditEvents).values({
        id: uuidv7(),
        operationId: uuidv7(),
        sequence: 0,
        actorType: 'system', // provisioning do hệ thống thực hiện, chưa có admin actor
        action: 'account.provisioned',
        targetType: 'account',
        targetId: accountId,
        details: { issuer: identity.issuer },
      });

      return { accountId, created: true };
    });
  } catch (err) {
    // Race: một transaction đồng thời đã thắng unique (issuer, subject). Transaction của ta
    // đã rollback (cả account lẫn mapping) — không có orphan. Đọc mapping của kẻ thắng.
    if (hasPgCode(err, UNIQUE_VIOLATION)) {
      const winner = await findByIdentity(db, identity);
      if (winner) {
        return { accountId: winner, created: false };
      }
    }
    throw err;
  }
}

async function findByIdentity(db: Db, identity: VerifiedIdentity): Promise<string | null> {
  const rows = await db
    .select({ accountId: externalIdentities.accountId })
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.issuer, identity.issuer),
        eq(externalIdentities.subject, identity.subject),
      ),
    )
    .limit(1);

  return rows[0]?.accountId ?? null;
}
