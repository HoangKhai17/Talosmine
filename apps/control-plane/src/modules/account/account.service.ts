import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
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

/**
 * Trường user được phép tự sửa — ALLOWLIST, không phải denylist.
 *
 * Vì sao allowlist: thêm cột mới vào `accounts` sẽ KHÔNG vô tình trở thành sửa được.
 * Với denylist, mỗi cột nhạy cảm mới phải nhớ thêm vào danh sách cấm — quên một lần là
 * mở cửa. Ở đây quên nghĩa là cột đó không sửa được, tức là nghiêng về an toàn.
 *
 * `status`, `email`, `email_verified` KHÔNG có trong danh sách (phase-2 mục 9):
 *   - status: chỉ admin đổi, qua endpoint riêng có audit và reason
 *   - email + email_verified: do IdP sở hữu, tự khai ở đây là tự phong "đã xác minh"
 */
export interface UpdateOwnAccountInput {
  displayName?: string | null;
  locale?: string | null;
  timezone?: string | null;
}

@Injectable()
export class AccountService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  /**
   * Cập nhật hồ sơ của chính user. Chỉ những trường có mặt trong `input` mới bị đụng tới —
   * không truyền trường nào thì trường đó giữ nguyên (PATCH đúng nghĩa, không phải PUT).
   */
  async updateOwnAccount(
    accountId: string,
    input: UpdateOwnAccountInput,
  ): Promise<OwnAccountView | null> {
    const patch: Record<string, unknown> = { updatedAt: sql`now()` };

    if (input.displayName !== undefined) patch.displayName = input.displayName;
    if (input.locale !== undefined) patch.locale = input.locale;
    if (input.timezone !== undefined) patch.timezone = input.timezone;

    // Không có trường nào để sửa → không chạy UPDATE vô nghĩa, trả về trạng thái hiện tại.
    if (Object.keys(patch).length === 1) {
      return this.getOwnAccount(accountId);
    }

    await this.database.db.update(accounts).set(patch).where(eq(accounts.id, accountId));

    return this.getOwnAccount(accountId);
  }

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
