import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { listAccountSessions, revokeAllAccountSessions, revokeSession } from './web-session.js';

/**
 * View phiên trả cho user. KHÔNG có hash token — chỉ metadata đủ để nhận ra phiên nào
 * là phiên nào ("đăng nhập lúc nào, hoạt động gần nhất khi nào, còn hiệu lực không").
 */
export interface SessionView {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  /** Phiên đang dùng để gọi request này — UI cần biết để cảnh báo "đây là phiên hiện tại". */
  current: boolean;
}

@Injectable()
export class SessionService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async listOwnSessions(accountId: string, currentSessionId: string): Promise<SessionView[]> {
    const rows = await listAccountSessions(this.database.db, accountId);

    return rows.map((row) => ({
      id: row.sessionId,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      current: row.sessionId === currentSessionId,
    }));
  }

  /**
   * Thu hồi một phiên CỦA CHÍNH account đó.
   *
   * Kiểm quyền sở hữu bằng cách lọc theo accountId trong chính câu truy vấn: user không
   * thể thu hồi phiên của người khác dù có đoán đúng sessionId. Trả false nếu phiên không
   * thuộc account, không tồn tại, hoặc đã thu hồi — gộp làm một để không tiết lộ phiên
   * nào có thật (chống dò).
   */
  async revokeOwnSession(accountId: string, sessionId: string): Promise<boolean> {
    const owned = await listAccountSessions(this.database.db, accountId);
    if (!owned.some((row) => row.sessionId === sessionId)) {
      return false;
    }

    return revokeSession(this.database.db, sessionId, 'user revoked session');
  }

  /** Đăng xuất mọi nơi. Trả số phiên vừa thu hồi. */
  async revokeAllOwnSessions(accountId: string): Promise<number> {
    return revokeAllAccountSessions(this.database.db, accountId, 'user logout all');
  }
}
