import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { DatabaseClient } from '../../shared/database.js';
import { webSessions } from './schema.js';

type Db = DatabaseClient['db'];

/**
 * `db` hoặc một transaction. Cho phép module khác (ví dụ Admin khi disable account) gọi
 * hàm của Identity TRONG transaction của họ — giữ được ranh giới module (Admin không
 * đụng bảng `web_sessions`) mà vẫn nguyên tử cùng mutation và audit.
 */
type Executor = Pick<Db, 'update' | 'select' | 'insert'>;

/**
 * Quản lý phiên đăng nhập phía server (modular.md mục 3, database-schema mục 4.3).
 *
 * NGUYÊN TẮC BẢO MẬT XUYÊN SUỐT FILE:
 *   • Token thô CHỈ tồn tại trong RAM và trong response trả về BFF một lần. DB chỉ giữ HASH.
 *   • Mọi thời gian (hết hạn, hoạt động gần nhất, thu hồi) dùng DB CLOCK (`now()`),
 *     không tin đồng hồ app — để nhất quán với `created_at` và với hard quota sau này.
 *   • Thu hồi = set `revoked_at` (giữ row để audit), KHÔNG xóa.
 */

/** Token thô ngẫu nhiên 256-bit, an toàn cho cookie (base64url). */
function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash token để tra cứu. SHA-256 (không salt) là ĐỦ ở đây vì token đã có 256-bit entropy —
 * không như password (entropy thấp, cần bcrypt+salt chống brute-force). Hash cần
 * deterministic để lookup theo index; bcrypt sẽ không lookup được.
 */
function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

export interface CreatedSession {
  sessionId: string;
  /** Token thô — trả về BFF để đặt cookie. KHÔNG lưu ở đâu; lần sau không lấy lại được. */
  sessionToken: string;
  /** CSRF token thô — BFF gắn vào form/header. */
  csrfToken: string;
  expiresAt: Date;
}

/**
 * Tạo phiên cho một account đã xác thực. `ttlSeconds` là hạn tuyệt đối — phiên không
 * sống vô hạn (modular.md mục 3.4).
 */
export async function createWebSession(
  db: Db,
  accountId: string,
  opts: { ttlSeconds: number; auth0Sid?: string | undefined },
): Promise<CreatedSession> {
  const sessionToken = generateToken();
  const csrfToken = generateToken();
  const sessionId = uuidv7();

  // expires_at tính bằng DB clock: now() + ttl. Đảm bảo expires_at > created_at (cùng now())
  // nên web_sessions_expiry_check luôn thỏa, không phụ thuộc skew đồng hồ app.
  const rows = await db
    .insert(webSessions)
    .values({
      id: sessionId,
      accountId,
      sessionTokenHash: hashToken(sessionToken),
      csrfTokenHash: hashToken(csrfToken),
      auth0Sid: opts.auth0Sid ?? null,
      expiresAt: sql`now() + make_interval(secs => ${opts.ttlSeconds})`,
    })
    .returning({ expiresAt: webSessions.expiresAt });

  const expiresAt = rows[0]?.expiresAt;
  if (!expiresAt) throw new Error('tạo phiên thất bại: không nhận được expires_at');

  return { sessionId, sessionToken, csrfToken, expiresAt };
}

export interface ValidSession {
  sessionId: string;
  accountId: string;
}

/**
 * Xác thực token và cập nhật `last_seen_at` trong MỘT query (UPDATE ... RETURNING).
 * Trả null nếu token không khớp, đã hết hạn, hoặc đã thu hồi — gộp cả ba thành "phiên
 * không hợp lệ", không tiết lộ lý do cụ thể cho caller.
 */
export async function validateSession(db: Db, sessionToken: string): Promise<ValidSession | null> {
  const rows = await db
    .update(webSessions)
    .set({ lastSeenAt: sql`now()` })
    .where(
      and(
        eq(webSessions.sessionTokenHash, hashToken(sessionToken)),
        isNull(webSessions.revokedAt),
        gt(webSessions.expiresAt, sql`now()`),
      ),
    )
    .returning({ sessionId: webSessions.id, accountId: webSessions.accountId });

  return rows[0] ?? null;
}

/**
 * Thu hồi một phiên theo id. Trả true nếu vừa thu hồi, false nếu phiên đã thu hồi từ trước
 * (idempotent — gọi lại không đổi kết quả, không lỗi).
 */
export async function revokeSession(db: Db, sessionId: string, reason: string): Promise<boolean> {
  const rows = await db
    .update(webSessions)
    .set({ revokedAt: sql`now()`, revocationReason: reason })
    .where(and(eq(webSessions.id, sessionId), isNull(webSessions.revokedAt)))
    .returning({ id: webSessions.id });

  return rows.length > 0;
}

/**
 * Thu hồi TẤT CẢ phiên còn hiệu lực của một account. Dùng khi logout-all, khi disable
 * account, hoặc khi có tín hiệu bảo mật. Trả số phiên vừa thu hồi.
 */
export async function revokeAllAccountSessions(
  db: Executor,
  accountId: string,
  reason: string,
): Promise<number> {
  const rows = await db
    .update(webSessions)
    .set({ revokedAt: sql`now()`, revocationReason: reason })
    .where(and(eq(webSessions.accountId, accountId), isNull(webSessions.revokedAt)))
    .returning({ id: webSessions.id });

  return rows.length;
}

export interface SessionSummary {
  sessionId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * Liệt kê phiên của một account cho trang "các phiên đăng nhập của tôi".
 * KHÔNG trả hash token — chỉ metadata an toàn để hiển thị.
 */
export async function listAccountSessions(db: Db, accountId: string): Promise<SessionSummary[]> {
  return db
    .select({
      sessionId: webSessions.id,
      createdAt: webSessions.createdAt,
      lastSeenAt: webSessions.lastSeenAt,
      expiresAt: webSessions.expiresAt,
      revokedAt: webSessions.revokedAt,
    })
    .from(webSessions)
    .where(eq(webSessions.accountId, accountId))
    .orderBy(webSessions.createdAt);
}
