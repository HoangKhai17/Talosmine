import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { accounts } from '../account/schema.js';
import { appendAuditEvent } from '../audit/audit.js';
import { revokeAllAccountSessions } from '../identity/web-session.js';

export interface AdminAccountView {
  id: string;
  status: string;
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
  disabledAt: string | null;
  createdAt: string;
}

export interface AdminMutationContext {
  /** Admin thực hiện thao tác — dùng làm audit actor. */
  actorAccountId: string;
  /** Lý do BẮT BUỘC cho mọi mutation quản trị (modular.md mục 11.4). */
  reason: string;
  correlationId?: string | undefined;
}

@Injectable()
export class AdminService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  /** Admin xem account bất kỳ — nhiều trường hơn view của user (có disabledAt). */
  async getAccount(accountId: string): Promise<AdminAccountView | null> {
    const rows = await this.database.db
      .select({
        id: accounts.id,
        status: accounts.status,
        displayName: accounts.displayName,
        email: accounts.email,
        emailVerified: accounts.emailVerified,
        disabledAt: accounts.disabledAt,
        createdAt: accounts.createdAt,
      })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      ...row,
      disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Vô hiệu hóa account.
   *
   * Ba việc trong MỘT transaction: đổi status, thu hồi mọi phiên, ghi audit.
   * Nếu bất kỳ bước nào fail, cả ba rollback — không có trạng thái "đã disable nhưng
   * phiên vẫn sống" hay "đã disable nhưng không có vết audit".
   *
   * Thu hồi phiên ngay là fail-closed có chủ đích: không chờ revoke SLA (DEC-B10 chưa
   * chốt) vì đây là phiên NỘI BỘ của Hub, ta kiểm soát được ngay.
   */
  async disableAccount(accountId: string, ctx: AdminMutationContext): Promise<boolean> {
    return this.database.db.transaction(async (tx) => {
      const updated = await tx
        .update(accounts)
        .set({ status: 'disabled', disabledAt: sql`now()`, updatedAt: sql`now()` })
        .where(and(eq(accounts.id, accountId), ne(accounts.status, 'disabled')))
        .returning({ id: accounts.id });

      if (updated.length === 0) {
        // Không tồn tại hoặc đã disabled — idempotent, không ghi audit trùng.
        return false;
      }

      const revokedSessions = await revokeAllAccountSessions(
        tx,
        accountId,
        'account disabled by admin',
      );

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'account.disabled',
        targetType: 'account',
        targetId: accountId,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { revokedSessions },
      });

      return true;
    });
  }

  /**
   * Kích hoạt lại account đã bị vô hiệu hóa (`disabled -> active`).
   *
   * Đây là hành động NHẠY CẢM (database-schema mục 11.1): cần permission riêng
   * `account:enable`, reason bắt buộc, audit đồng bộ. `disabled_at` phải về NULL để giữ
   * `accounts_disabled_state_check`.
   */
  async enableAccount(accountId: string, ctx: AdminMutationContext): Promise<boolean> {
    return this.database.db.transaction(async (tx) => {
      const updated = await tx
        .update(accounts)
        .set({ status: 'active', disabledAt: null, updatedAt: sql`now()` })
        .where(and(eq(accounts.id, accountId), eq(accounts.status, 'disabled')))
        .returning({ id: accounts.id });

      if (updated.length === 0) {
        return false;
      }

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'account.enabled',
        targetType: 'account',
        targetId: accountId,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
      });

      return true;
    });
  }

  /** Admin thu hồi toàn bộ phiên của một user (ví dụ nghi ngờ lộ tài khoản). */
  async revokeAccountSessions(accountId: string, ctx: AdminMutationContext): Promise<number> {
    return this.database.db.transaction(async (tx) => {
      const revoked = await revokeAllAccountSessions(tx, accountId, ctx.reason);

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'account.sessions_revoked',
        targetType: 'account',
        targetId: accountId,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { revokedSessions: revoked },
      });

      return revoked;
    });
  }
}
