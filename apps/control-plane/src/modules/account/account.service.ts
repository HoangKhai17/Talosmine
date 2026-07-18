import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { accounts } from './schema.js';

/**
 * View account trả cho chính user. CỐ Ý không có trường quản trị nội bộ (disabled_at,
 * updated_at...). "User xem account của mình ở mức phù hợp" (modular.md mục 4.2) —
 * chỉ hồ sơ, không dữ liệu vận hành.
 */
export interface OwnAccountView {
  id: string;
  status: 'pending' | 'active' | 'disabled';
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
  locale: string | null;
  timezone: string | null;
  createdAt: string;
}

@Injectable()
export class AccountService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  /** Trả hồ sơ của chính account, hoặc null nếu không tồn tại. */
  async getOwnAccount(accountId: string): Promise<OwnAccountView | null> {
    const rows = await this.database.db
      .select({
        id: accounts.id,
        status: accounts.status,
        displayName: accounts.displayName,
        email: accounts.email,
        emailVerified: accounts.emailVerified,
        locale: accounts.locale,
        timezone: accounts.timezone,
        createdAt: accounts.createdAt,
      })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      status: row.status as OwnAccountView['status'],
      displayName: row.displayName,
      email: row.email,
      emailVerified: row.emailVerified,
      locale: row.locale,
      timezone: row.timezone,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
