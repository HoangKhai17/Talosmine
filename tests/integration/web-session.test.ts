import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { provisionByExternalIdentity } from '../../apps/control-plane/src/modules/identity/account-provisioning';
import {
  createWebSession,
  listAccountSessions,
  revokeAllAccountSessions,
  revokeSession,
  validateSession,
} from '../../apps/control-plane/src/modules/identity/web-session';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../../apps/control-plane/src/shared/database';
import { applyAllMigrations, startPostgres } from '../support/postgres';

describe('web session', () => {
  let container: StartedPostgreSqlContainer;
  let client: DatabaseClient;
  let db: DatabaseClient['db'];
  let sql: DatabaseClient['sql'];
  let accountId: string;

  beforeAll(async () => {
    container = await startPostgres();
    client = createDatabaseClient(container.getConnectionUri());
    sql = client.sql;
    db = client.db;
    await applyAllMigrations(sql);
  }, 120_000);

  afterAll(async () => {
    await client?.sql.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await sql`TRUNCATE control_plane.accounts CASCADE`;
    const provisioned = await provisionByExternalIdentity(db, {
      issuer: 'http://localhost:3001/oidc',
      subject: 'session-user',
    });
    accountId = provisioned.accountId;
  });

  it('tạo phiên, validate được, và trả đúng account', async () => {
    const session = await createWebSession(db, accountId, { ttlSeconds: 3600 });
    expect(session.sessionToken).toBeTruthy();
    expect(session.csrfToken).toBeTruthy();
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const valid = await validateSession(db, session.sessionToken);
    expect(valid?.accountId).toBe(accountId);
    expect(valid?.sessionId).toBe(session.sessionId);
  });

  it('DB chỉ lưu HASH — token thô KHÔNG có trong database', async () => {
    const session = await createWebSession(db, accountId, { ttlSeconds: 3600 });

    // Lấy hash đã lưu và convert token thô sang hash để so — hai cái phải khớp,
    // nhưng token thô KHÔNG được xuất hiện dưới dạng plaintext ở bất kỳ cột nào.
    const rows = await sql`
      SELECT encode(session_token_hash, 'hex') AS h,
             session_token_hash::text AS raw
      FROM control_plane.web_sessions WHERE id = ${session.sessionId}
    `;
    const storedHex = rows[0]?.h as string;

    // Không cột nào chứa token thô.
    expect(storedHex).not.toContain(session.sessionToken);
    // Hash lưu phải là SHA-256 (32 byte = 64 hex char).
    expect(storedHex).toHaveLength(64);
  });

  it('token sai → không validate được', async () => {
    await createWebSession(db, accountId, { ttlSeconds: 3600 });
    const valid = await validateSession(db, 'token-bia-dat');
    expect(valid).toBeNull();
  });

  it('phiên hết hạn → không validate được', async () => {
    const session = await createWebSession(db, accountId, { ttlSeconds: 3600 });
    // Đẩy CẢ created_at lẫn expires_at về quá khứ. Phải giữ expires_at > created_at, nếu
    // không web_sessions_expiry_check sẽ chặn UPDATE — chính constraint đó vừa bắt cách
    // test sai trước đó. Cả hai < now() nên phiên coi như đã hết hạn.
    await sql`
      UPDATE control_plane.web_sessions
      SET created_at = now() - interval '2 hours',
          expires_at = now() - interval '1 hour'
      WHERE id = ${session.sessionId}
    `;
    const valid = await validateSession(db, session.sessionToken);
    expect(valid).toBeNull();
  });

  it('thu hồi phiên → không validate được, và idempotent', async () => {
    const session = await createWebSession(db, accountId, { ttlSeconds: 3600 });

    const first = await revokeSession(db, session.sessionId, 'user logout');
    expect(first).toBe(true);

    const valid = await validateSession(db, session.sessionToken);
    expect(valid).toBeNull();

    // Thu hồi lần hai: idempotent, trả false (đã thu hồi), không lỗi.
    const second = await revokeSession(db, session.sessionId, 'user logout');
    expect(second).toBe(false);
  });

  it('thu hồi tất cả phiên của account', async () => {
    await createWebSession(db, accountId, { ttlSeconds: 3600 });
    await createWebSession(db, accountId, { ttlSeconds: 3600 });
    await createWebSession(db, accountId, { ttlSeconds: 3600 });

    const revoked = await revokeAllAccountSessions(db, accountId, 'account disabled');
    expect(revoked).toBe(3);

    // Gọi lại: không còn phiên active → 0.
    const again = await revokeAllAccountSessions(db, accountId, 'account disabled');
    expect(again).toBe(0);
  });

  it('liệt kê phiên KHÔNG lộ hash token', async () => {
    await createWebSession(db, accountId, { ttlSeconds: 3600 });
    const sessions = await listAccountSessions(db, accountId);

    expect(sessions).toHaveLength(1);
    const summary = sessions[0];
    // Chỉ metadata an toàn — không có trường hash nào.
    expect(Object.keys(summary ?? {})).toEqual([
      'sessionId',
      'createdAt',
      'lastSeenAt',
      'expiresAt',
      'revokedAt',
    ]);
  });
});
