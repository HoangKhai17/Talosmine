import 'reflect-metadata';
import { VersioningType } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/control-plane/src/app.module';
import type { AdminPermission } from '../../apps/control-plane/src/modules/admin/schema';
import { provisionByExternalIdentity } from '../../apps/control-plane/src/modules/identity/account-provisioning';
import { createWebSession } from '../../apps/control-plane/src/modules/identity/web-session';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../../apps/control-plane/src/shared/database';
import { DATABASE_CLIENT } from '../../apps/control-plane/src/shared/database.module';
import { applyAllMigrations, startPostgres } from '../support/postgres';

describe('/v1/admin/accounts', () => {
  let container: StartedPostgreSqlContainer;
  let client: DatabaseClient;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await startPostgres();
    client = createDatabaseClient(container.getConnectionUri());
    await applyAllMigrations(client.sql);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE_CLIENT)
      .useValue(client)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await client?.sql.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await client.sql`TRUNCATE control_plane.admin_role_assignments, control_plane.admin_role_permissions, control_plane.admin_roles`;
    await client.sql`TRUNCATE control_plane.accounts CASCADE`;
  });

  async function createUser(subject: string) {
    const { accountId } = await provisionByExternalIdentity(client.db, {
      issuer: 'http://localhost:3001/oidc',
      subject,
    });
    const session = await createWebSession(client.db, accountId, { ttlSeconds: 3600 });
    return { accountId, token: session.sessionToken, csrf: session.csrfToken };
  }

  /**
   * Header cho mutation quản trị: session token + CSRF token.
   *
   * Mọi mutation đều đi qua WebSessionGuard nên đều bắt buộc có CSRF token, kể cả khi
   * người gọi đã có đủ permission.
   */
  function writeHeaders(user: { token: string; csrf: string }) {
    return { 'x-session-token': user.token, 'x-csrf-token': user.csrf };
  }

  /** Gán cho account một role có đúng các permission cho trước. */
  async function grantPermissions(accountId: string, permissions: AdminPermission[]) {
    const roleId = uuidv7();
    const key = `role-${roleId.slice(0, 8)}`;
    await client.sql`
      INSERT INTO control_plane.admin_roles (id, key, display_name, status)
      VALUES (${roleId}, ${key}, 'Test role', 'active')
    `;
    for (const permission of permissions) {
      await client.sql`
        INSERT INTO control_plane.admin_role_permissions (id, admin_role_id, permission)
        VALUES (${uuidv7()}, ${roleId}, ${permission})
      `;
    }
    await client.sql`
      INSERT INTO control_plane.admin_role_assignments
        (id, admin_role_id, account_id, valid_from, reason, assigned_by_account_id)
      VALUES (${uuidv7()}, ${roleId}, ${accountId}, now(), 'test grant', ${accountId})
    `;
    return roleId;
  }

  it('USER THƯỜNG (không có role) → 403, không lộ thiếu quyền nào', async () => {
    const user = await createUser('plain-user');
    const target = await createUser('target-1');

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/accounts/${target.accountId}`,
      headers: { 'x-session-token': user.token },
    });

    // 403 chứ không phải 401: đã đăng nhập nhưng không đủ quyền.
    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.json())).not.toContain('account:read');
  });

  it('không có phiên → 401 (chưa xác thực, khác với thiếu quyền)', async () => {
    const target = await createUser('target-2');
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/accounts/${target.accountId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('admin có account:read → 200', async () => {
    const admin = await createUser('admin-read');
    await grantPermissions(admin.accountId, ['account:read']);
    const target = await createUser('target-3');

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/accounts/${target.accountId}`,
      headers: writeHeaders(admin),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(target.accountId);
  });

  it('có account:read nhưng KHÔNG có account:disable → 403 (permission tách biệt)', async () => {
    const admin = await createUser('admin-readonly');
    await grantPermissions(admin.accountId, ['account:read']);
    const target = await createUser('target-4');

    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/accounts/${target.accountId}/disable`,
      headers: writeHeaders(admin),
      payload: { reason: 'thử vượt quyền' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('disable: đổi status, THU HỒI phiên và GHI AUDIT — tất cả trong một transaction', async () => {
    const admin = await createUser('admin-disable');
    await grantPermissions(admin.accountId, ['account:disable']);
    const target = await createUser('target-5');

    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/accounts/${target.accountId}/disable`,
      headers: writeHeaders(admin),
      payload: { reason: 'vi phạm điều khoản' },
    });
    expect(res.statusCode).toBe(204);

    // 1. Account bị vô hiệu hóa.
    const account = await client.sql`
      SELECT status, disabled_at FROM control_plane.accounts WHERE id = ${target.accountId}
    `;
    expect(account[0]?.status).toBe('disabled');
    expect(account[0]?.disabled_at).not.toBeNull();

    // 2. Phiên của user đó hết dùng được NGAY.
    const check = await app.inject({
      method: 'GET',
      url: '/v1/me/account',
      headers: { 'x-session-token': target.token },
    });
    expect(check.statusCode).toBe(401);

    // 3. Audit ghi đồng bộ, có actor là admin và reason.
    const audit = await client.sql`
      SELECT action, actor_type, actor_account_id, reason
      FROM control_plane.audit_events WHERE target_id = ${target.accountId}
        AND action = 'account.disabled'
    `;
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actor_type).toBe('account');
    expect(audit[0]?.actor_account_id).toBe(admin.accountId);
    expect(audit[0]?.reason).toBe('vi phạm điều khoản');
  });

  it('mutation THIẾU reason → 400 và KHÔNG đổi gì', async () => {
    const admin = await createUser('admin-noreason');
    await grantPermissions(admin.accountId, ['account:disable']);
    const target = await createUser('target-6');

    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/accounts/${target.accountId}/disable`,
      headers: writeHeaders(admin),
      payload: {},
    });
    expect(res.statusCode).toBe(400);

    const account = await client.sql`
      SELECT status FROM control_plane.accounts WHERE id = ${target.accountId}
    `;
    expect(account[0]?.status).toBe('active');
  });

  it('enable: đưa disabled → active và xóa disabled_at', async () => {
    const admin = await createUser('admin-enable');
    await grantPermissions(admin.accountId, ['account:disable', 'account:enable']);
    const target = await createUser('target-7');

    await app.inject({
      method: 'POST',
      url: `/v1/admin/accounts/${target.accountId}/disable`,
      headers: writeHeaders(admin),
      payload: { reason: 'tạm khóa' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/accounts/${target.accountId}/enable`,
      headers: writeHeaders(admin),
      payload: { reason: 'đã xác minh lại' },
    });
    expect(res.statusCode).toBe(204);

    const account = await client.sql`
      SELECT status, disabled_at FROM control_plane.accounts WHERE id = ${target.accountId}
    `;
    expect(account[0]?.status).toBe('active');
    // disabled_at phải về NULL, nếu không accounts_disabled_state_check sẽ vỡ.
    expect(account[0]?.disabled_at).toBeNull();
  });

  it('role bị vô hiệu hóa → quyền mất NGAY, không cần thu hồi từng assignment', async () => {
    const admin = await createUser('admin-inactive-role');
    const roleId = await grantPermissions(admin.accountId, ['account:read']);
    const target = await createUser('target-8');

    // Đang có quyền.
    const before = await app.inject({
      method: 'GET',
      url: `/v1/admin/accounts/${target.accountId}`,
      headers: writeHeaders(admin),
    });
    expect(before.statusCode).toBe(200);

    await client.sql`UPDATE control_plane.admin_roles SET status = 'inactive' WHERE id = ${roleId}`;

    const after = await app.inject({
      method: 'GET',
      url: `/v1/admin/accounts/${target.accountId}`,
      headers: writeHeaders(admin),
    });
    expect(after.statusCode).toBe(403);
  });

  it('assignment ĐÃ THU HỒI → mất quyền', async () => {
    const admin = await createUser('admin-revoked');
    await grantPermissions(admin.accountId, ['account:read']);
    const target = await createUser('target-9');

    await client.sql`
      UPDATE control_plane.admin_role_assignments
      SET revoked_at = now(), revoked_by_account_id = ${admin.accountId},
          revocation_reason = 'hết nhiệm vụ'
      WHERE account_id = ${admin.accountId}
    `;

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/accounts/${target.accountId}`,
      headers: writeHeaders(admin),
    });
    expect(res.statusCode).toBe(403);
  });

  it('assignment HẾT HẠN → mất quyền', async () => {
    const admin = await createUser('admin-expired');
    await grantPermissions(admin.accountId, ['account:read']);
    const target = await createUser('target-10');

    await client.sql`
      UPDATE control_plane.admin_role_assignments
      SET valid_from = now() - interval '2 days', valid_until = now() - interval '1 day'
      WHERE account_id = ${admin.accountId}
    `;

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/accounts/${target.accountId}`,
      headers: writeHeaders(admin),
    });
    expect(res.statusCode).toBe(403);
  });
});
