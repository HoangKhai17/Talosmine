import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { accounts } from '../account/schema.js';
import { appendAuditEvent } from '../audit/audit.js';
import { listAccountSessions, revokeAllAccountSessions } from '../identity/web-session.js';

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
   * Tìm account cho màn hình hỗ trợ.
   *
   * PHÂN TRANG THEO CURSOR, không phải OFFSET: offset lớn buộc PostgreSQL đếm và bỏ qua
   * từng hàng nên càng sâu càng chậm, và nếu có hàng mới chèn vào giữa lúc lật trang thì
   * bản ghi bị nhảy hoặc lặp. Cursor theo `created_at` ổn định trước cả hai vấn đề đó.
   *
   * CHỐNG DÒ DỮ LIỆU (phase-2 mục 11): tìm rỗng KHÔNG trả về toàn bộ account. Phải có
   * `query` — màn hình hỗ trợ dùng để tra một người cụ thể, không phải để tải danh bạ.
   */
  async searchAccounts(params: {
    query: string;
    limit: number;
    cursor?: string | undefined;
  }): Promise<{ items: AdminAccountView[]; nextCursor: string | null }> {
    const term = params.query.trim();
    if (term === '') {
      return { items: [], nextCursor: null };
    }

    // Tra theo id chính xác HOẶC email/tên chứa chuỗi tìm. `ILIKE` không phân biệt hoa
    // thường; ký tự đại diện của người dùng được escape để `%` họ gõ không thành wildcard.
    const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term);

    const conditions = [
      isUuid
        ? sql`${accounts.id} = ${term}::uuid`
        : sql`(${accounts.email} ILIKE ${like} ESCAPE '\\' OR ${accounts.displayName} ILIKE ${like} ESCAPE '\\')`,
    ];

    if (params.cursor) {
      conditions.push(sql`${accounts.createdAt} < ${params.cursor}::timestamptz`);
    }

    // Lấy dư MỘT hàng để biết còn trang sau hay không, mà không phải chạy COUNT riêng.
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
      .where(and(...conditions))
      .orderBy(desc(accounts.createdAt))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;

    return {
      items: page.map((row) => ({
        ...row,
        disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.createdAt.toISOString() ?? null) : null,
    };
  }

  /**
   * Liệt kê phiên của một account cho màn hình hỗ trợ.
   *
   * KHÔNG trả hash token dưới bất kỳ dạng nào — `listAccountSessions` của Identity vốn đã
   * chỉ chọn cột metadata. Admin cần biết "có bao nhiêu phiên, hoạt động lúc nào" để quyết
   * định thu hồi, không cần và không được biết giá trị token.
   */
  async listAccountSessions(accountId: string): Promise<
    Array<{
      id: string;
      createdAt: string;
      lastSeenAt: string;
      expiresAt: string;
      revokedAt: string | null;
    }>
  > {
    const rows = await listAccountSessions(this.database.db, accountId);

    return rows.map((row) => ({
      id: row.sessionId,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    }));
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
