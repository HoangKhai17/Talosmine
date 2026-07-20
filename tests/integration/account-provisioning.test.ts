import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { provisionByExternalIdentity } from '../../apps/control-plane/src/modules/identity/account-provisioning';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../../apps/control-plane/src/shared/database';
import { applyAllMigrations, startPostgres } from '../support/postgres';

/**
 * Provisioning là trái tim của identity (modular.md mục 3.5). Test chạy trên PostgreSQL
 * THẬT (DEC-T05) vì hành vi cần chứng minh — transaction, unique race, audit-trong-tx —
 * là hành vi của engine, mock không chứng minh được.
 *
 * Dùng `createDatabaseClient` (đường production) để `db` khớp CHÍNH XÁC type mà service
 * nhận — không tự gọi `drizzle(sql)` vì overload cho ra type generic khác.
 */
describe('account provisioning', () => {
  let container: StartedPostgreSqlContainer;
  let client: DatabaseClient;
  let db: DatabaseClient['db'];
  let sql: DatabaseClient['sql'];

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
    // CASCADE để dọn cả các bảng FK tới accounts (external_identities, web_sessions,
    // audit_events). TRUNCATE KHÔNG kích hoạt trigger DELETE nên append-only không cản.
    await sql`TRUNCATE control_plane.accounts CASCADE`;
  });

  it('tạo account ACTIVE ngay + identity + audit trong một lần', async () => {
    const result = await provisionByExternalIdentity(
      db,
      { issuer: 'http://localhost:3001/oidc', subject: 'alice' },
      { displayName: 'Alice', email: 'alice@example.com', emailVerified: true },
    );

    expect(result.created).toBe(true);

    const account = await sql`
      SELECT status, display_name, email, email_verified
      FROM control_plane.accounts WHERE id = ${result.accountId}
    `;
    expect(account[0]?.status).toBe('active'); // DEC-B04a: active ngay
    expect(account[0]?.email).toBe('alice@example.com');
    expect(account[0]?.email_verified).toBe(true);

    const identity = await sql`
      SELECT provider, issuer, subject FROM control_plane.external_identities
      WHERE account_id = ${result.accountId}
    `;
    expect(identity).toHaveLength(1);
    expect(identity[0]?.provider).toBe('logto');
    expect(identity[0]?.subject).toBe('alice');

    // Audit ghi ĐỒNG BỘ trong cùng transaction.
    const audit = await sql`
      SELECT action, actor_type, target_id FROM control_plane.audit_events
      WHERE target_id = ${result.accountId}
    `;
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe('account.provisioned');
    expect(audit[0]?.actor_type).toBe('system');
  });

  it('login lần sau cùng (issuer, subject) KHÔNG tạo account thứ hai', async () => {
    const first = await provisionByExternalIdentity(db, {
      issuer: 'http://localhost:3001/oidc',
      subject: 'bob',
    });
    const second = await provisionByExternalIdentity(db, {
      issuer: 'http://localhost:3001/oidc',
      subject: 'bob',
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.accountId).toBe(first.accountId);

    const count = await sql`SELECT count(*)::int AS n FROM control_plane.accounts`;
    expect(count[0]?.n).toBe(1);
  });

  it('KHÔNG liên kết theo email: cùng email, khác subject → hai account', async () => {
    // Đây là ràng buộc bảo mật cốt lõi (database-schema mục 4.2): email không phải khóa.
    const a = await provisionByExternalIdentity(
      db,
      { issuer: 'http://localhost:3001/oidc', subject: 'user-a' },
      { email: 'same@example.com' },
    );
    const b = await provisionByExternalIdentity(
      db,
      { issuer: 'http://localhost:3001/oidc', subject: 'user-b' },
      { email: 'same@example.com' },
    );

    expect(a.accountId).not.toBe(b.accountId);
    const count = await sql`SELECT count(*)::int AS n FROM control_plane.accounts`;
    expect(count[0]?.n).toBe(2);
  });

  it('RACE-SAFE: 8 provisioning đồng thời cùng identity chỉ tạo MỘT account', async () => {
    // Đây là điểm khó nhất: nhiều callback đồng thời cùng (issuer, subject). Kẻ thắng
    // unique constraint tạo account; kẻ thua rollback (không orphan) rồi đọc winner.
    const identity = { issuer: 'http://localhost:3001/oidc', subject: 'concurrent' };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => provisionByExternalIdentity(db, identity)),
    );

    // Tất cả trả về CÙNG một accountId.
    const ids = new Set(results.map((r) => r.accountId));
    expect(ids.size).toBe(1);

    // Đúng một account, đúng một identity trong DB.
    const accounts = await sql`SELECT count(*)::int AS n FROM control_plane.accounts`;
    expect(accounts[0]?.n).toBe(1);
    const identities = await sql`SELECT count(*)::int AS n FROM control_plane.external_identities`;
    expect(identities[0]?.n).toBe(1);

    // Đúng một lần báo created=true.
    const createdCount = results.filter((r) => r.created).length;
    expect(createdCount).toBe(1);
  });
});
