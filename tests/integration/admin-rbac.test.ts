import 'reflect-metadata';
import { VersioningType } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/control-plane/src/app.module';
import { provisionByExternalIdentity } from '../../apps/control-plane/src/modules/identity/account-provisioning';
import { createWebSession } from '../../apps/control-plane/src/modules/identity/web-session';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../../apps/control-plane/src/shared/database';
import { DATABASE_CLIENT } from '../../apps/control-plane/src/shared/database.module';
import { applyAllMigrations, startPostgres } from '../support/postgres';

/**
 * `/v1/admin/rbac` — vai trò và phân quyền.
 *
 * Điều quan trọng nhất cần chứng minh là CHỐT CHẶN LEO THANG ĐẶC QUYỀN: một admin không
 * được cấp permission mà chính họ không có. Thiếu nó thì mọi giới hạn quyền trong hệ thống
 * đều vô nghĩa — ai cũng tự nâng mình lên toàn quyền qua hai bước.
 */
describe('/v1/admin/rbac', () => {
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
    return {
      accountId,
      headers: {
        'x-session-token': session.sessionToken,
        'x-csrf-token': session.csrfToken,
      },
    };
  }

  /** Tạo role kèm permission; trả roleId. */
  async function createRole(key: string, permissions: string[], status = 'active') {
    const roleId = crypto.randomUUID();
    await client.sql`
      INSERT INTO control_plane.admin_roles (id, key, display_name, status)
      VALUES (${roleId}, ${key}, ${key}, ${status})
    `;
    for (const permission of permissions) {
      await client.sql`
        INSERT INTO control_plane.admin_role_permissions (id, admin_role_id, permission)
        VALUES (${crypto.randomUUID()}, ${roleId}, ${permission})
      `;
    }
    return roleId;
  }

  async function grant(accountId: string, roleId: string) {
    await client.sql`
      INSERT INTO control_plane.admin_role_assignments
        (id, admin_role_id, account_id, valid_from, reason, assigned_by_account_id)
      VALUES (${crypto.randomUUID()}, ${roleId}, ${accountId}, now(), 'test', ${accountId})
    `;
  }

  describe('chốt chặn leo thang đặc quyền', () => {
    it('KHÔNG cấp được role chứa permission mà chính mình không có', async () => {
      // Kẻ tấn công chỉ có `admin_role:manage` — đủ để vào màn hình phân quyền, nhưng
      // KHÔNG có `account:disable`. Nếu chốt chặn hỏng, họ tự cấp cho mình role toàn quyền.
      const attacker = await createUser('escalate-attacker');
      const weakRole = await createRole('weak', ['admin_role:manage']);
      await grant(attacker.accountId, weakRole);

      const powerfulRole = await createRole('powerful', [
        'admin_role:manage',
        'account:disable',
        'account:enable',
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/rbac/assignments',
        headers: attacker.headers,
        payload: {
          roleId: powerfulRole,
          accountId: attacker.accountId,
          reason: 'tự nâng quyền',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ message: expect.stringContaining('account:disable') });

      // Và KHÔNG có assignment nào được ghi.
      const rows = await client.sql`
        SELECT count(*)::int AS n FROM control_plane.admin_role_assignments
        WHERE admin_role_id = ${powerfulRole}
      `;
      expect(rows[0]?.n).toBe(0);
    });

    it('cấp được role mà mình có ĐỦ mọi permission', async () => {
      const admin = await createUser('escalate-ok');
      const fullRole = await createRole('full', ['admin_role:manage', 'account:read']);
      await grant(admin.accountId, fullRole);

      const target = await createUser('escalate-target');
      const subsetRole = await createRole('subset', ['account:read']);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/rbac/assignments',
        headers: admin.headers,
        payload: { roleId: subsetRole, accountId: target.accountId, reason: 'bổ nhiệm hỗ trợ' },
      });

      expect(res.statusCode).toBe(201);
    });
  });

  describe('deny-by-default', () => {
    it('user thường không đọc được danh sách vai trò → 403', async () => {
      const plain = await createUser('rbac-plain');

      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/rbac/roles',
        headers: plain.headers,
      });

      expect(res.statusCode).toBe(403);
    });

    it('có permission KHÁC cũng không đủ — cần đúng `admin_role:manage`', async () => {
      // `account:read` cho phép xem tài khoản, nhưng biết ai đang có quyền gì là thông tin
      // nhạy cảm hơn: nó cho biết nên tấn công tài khoản nào.
      const reader = await createUser('rbac-reader');
      const readRole = await createRole('reader', ['account:read']);
      await grant(reader.accountId, readRole);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/rbac/assignments',
        headers: reader.headers,
      });

      expect(res.statusCode).toBe(403);
    });

    it('không có phiên → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/admin/rbac/roles' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('quy tắc nghiệp vụ', () => {
    async function makeManager(subject: string) {
      const user = await createUser(subject);
      const role = await createRole(`mgr-${subject}`, [
        'admin_role:manage',
        'account:read',
        'account:disable',
        'account:enable',
        'session:revoke',
        'audit:read',
      ]);
      await grant(user.accountId, role);
      return user;
    }

    it('thiếu `reason` → 400 (mọi thao tác quản trị phải nêu lý do)', async () => {
      const admin = await makeManager('rbac-noreason');
      const target = await createUser('rbac-noreason-target');
      const role = await createRole('r-noreason', ['account:read']);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/rbac/assignments',
        headers: admin.headers,
        payload: { roleId: role, accountId: target.accountId },
      });

      expect(res.statusCode).toBe(400);
    });

    it('role đã vô hiệu hoá thì không cấp được → 400', async () => {
      const admin = await makeManager('rbac-inactive');
      const target = await createUser('rbac-inactive-target');
      const role = await createRole('r-inactive', ['account:read'], 'inactive');

      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/rbac/assignments',
        headers: admin.headers,
        payload: { roleId: role, accountId: target.accountId, reason: 'thử' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('cấp trùng role còn hiệu lực → 409', async () => {
      const admin = await makeManager('rbac-dup');
      const target = await createUser('rbac-dup-target');
      const role = await createRole('r-dup', ['account:read']);

      const payload = { roleId: role, accountId: target.accountId, reason: 'lần đầu' };
      const first = await app.inject({
        method: 'POST',
        url: '/v1/admin/rbac/assignments',
        headers: admin.headers,
        payload,
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: 'POST',
        url: '/v1/admin/rbac/assignments',
        headers: admin.headers,
        payload: { ...payload, reason: 'lần hai' },
      });
      expect(second.statusCode).toBe(409);
    });

    it('thu hồi GIỮ LẠI dòng và ghi ai thu hồi, vì sao', async () => {
      const admin = await makeManager('rbac-revoke');
      const target = await createUser('rbac-revoke-target');
      const role = await createRole('r-revoke', ['account:read']);

      const created = await app.inject({
        method: 'POST',
        url: '/v1/admin/rbac/assignments',
        headers: admin.headers,
        payload: { roleId: role, accountId: target.accountId, reason: 'bổ nhiệm' },
      });
      const { id } = created.json() as { id: string };

      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/admin/rbac/assignments/${id}`,
        headers: admin.headers,
        payload: { reason: 'hết nhiệm kỳ' },
      });
      expect(res.statusCode).toBe(204);

      // Dòng VẪN CÒN — lịch sử phân quyền không bị xoá.
      const rows = await client.sql`
        SELECT revoked_at, revoked_by_account_id, revocation_reason
        FROM control_plane.admin_role_assignments WHERE id = ${id}
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.revoked_at).not.toBeNull();
      expect(rows[0]?.revoked_by_account_id).toBe(admin.accountId);
      expect(rows[0]?.revocation_reason).toBe('hết nhiệm kỳ');
    });

    it('thu hồi ghi audit trong cùng transaction', async () => {
      const admin = await makeManager('rbac-audit');
      const target = await createUser('rbac-audit-target');
      const role = await createRole('r-audit', ['account:read']);

      const created = await app.inject({
        method: 'POST',
        url: '/v1/admin/rbac/assignments',
        headers: admin.headers,
        payload: { roleId: role, accountId: target.accountId, reason: 'bổ nhiệm' },
      });
      const { id } = created.json() as { id: string };

      await app.inject({
        method: 'DELETE',
        url: `/v1/admin/rbac/assignments/${id}`,
        headers: admin.headers,
        payload: { reason: 'thu hồi để kiểm audit' },
      });

      const audit = await client.sql`
        SELECT action, actor_account_id, reason FROM control_plane.audit_events
        WHERE action = 'admin_role.revoked'
      `;
      expect(audit).toHaveLength(1);
      expect(audit[0]?.actor_account_id).toBe(admin.accountId);
      expect(audit[0]?.reason).toBe('thu hồi để kiểm audit');
    });

    it('thu hồi thiếu CSRF token → 403', async () => {
      const admin = await makeManager('rbac-csrf');
      const target = await createUser('rbac-csrf-target');
      const role = await createRole('r-csrf', ['account:read']);

      const created = await app.inject({
        method: 'POST',
        url: '/v1/admin/rbac/assignments',
        headers: admin.headers,
        payload: { roleId: role, accountId: target.accountId, reason: 'bổ nhiệm' },
      });
      const { id } = created.json() as { id: string };

      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/admin/rbac/assignments/${id}`,
        headers: { 'x-session-token': admin.headers['x-session-token'] },
        payload: { reason: 'không có csrf' },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
