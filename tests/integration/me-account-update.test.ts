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
 * `PATCH /v1/me/account` và `GET /v1/me/permissions`.
 *
 * Trọng tâm là ALLOWLIST: trường ngoài danh sách phải KHÔNG có tác dụng. Đây là ranh giới
 * ngăn user tự nâng quyền cho mình (`status`) hoặc tự phong "email đã xác minh".
 */
describe('/v1/me — cập nhật hồ sơ và permission', () => {
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

  async function seedUser(subject: string) {
    const { accountId } = await provisionByExternalIdentity(
      client.db,
      { issuer: 'http://localhost:3001/oidc', subject },
      { email: `${subject}@example.com`, emailVerified: true },
    );
    const session = await createWebSession(client.db, accountId, { ttlSeconds: 3600 });
    return {
      accountId,
      headers: {
        'x-session-token': session.sessionToken,
        'x-csrf-token': session.csrfToken,
      },
    };
  }

  describe('PATCH /v1/me/account', () => {
    it('sửa được các trường trong allowlist', async () => {
      const user = await seedUser('patch-ok');

      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/me/account',
        headers: user.headers,
        payload: { displayName: 'Tên Mới', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as Record<string, unknown>;
      expect(body.displayName).toBe('Tên Mới');
      expect(body.locale).toBe('vi-VN');
      expect(body.timezone).toBe('Asia/Ho_Chi_Minh');
    });

    it('KHÔNG đổi được `status` — user không tự nâng/hạ trạng thái tài khoản', async () => {
      const user = await seedUser('patch-status');

      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/me/account',
        headers: user.headers,
        payload: { status: 'disabled' },
      });

      // 200 chứ không 400: trường lạ bị BỎ QUA im lặng để client cũ gửi thừa vẫn chạy.
      // Điều quan trọng là nó KHÔNG có tác dụng.
      expect(res.statusCode).toBe(200);
      expect((res.json() as Record<string, unknown>).status).toBe('active');

      const rows = await client.sql`
        SELECT status FROM control_plane.accounts WHERE id = ${user.accountId}
      `;
      expect(rows[0]?.status).toBe('active');
    });

    it('KHÔNG đổi được `email` và `email_verified` — hai trường này do IdP sở hữu', async () => {
      const user = await seedUser('patch-email');

      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/me/account',
        headers: user.headers,
        payload: { email: 'ke-tan-cong@evil.example', emailVerified: true },
      });

      expect(res.statusCode).toBe(200);
      expect((res.json() as Record<string, unknown>).email).toBe('patch-email@example.com');

      const rows = await client.sql`
        SELECT email FROM control_plane.accounts WHERE id = ${user.accountId}
      `;
      expect(rows[0]?.email).toBe('patch-email@example.com');
    });

    it('chuỗi rỗng nghĩa là XÓA giá trị (lưu NULL, không lưu chuỗi rỗng)', async () => {
      const user = await seedUser('patch-clear');

      await app.inject({
        method: 'PATCH',
        url: '/v1/me/account',
        headers: user.headers,
        payload: { displayName: 'Có tên' },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/me/account',
        headers: user.headers,
        payload: { displayName: '   ' },
      });

      expect(res.statusCode).toBe(200);
      expect((res.json() as Record<string, unknown>).displayName).toBeNull();
    });

    it('trường không truyền thì GIỮ NGUYÊN (PATCH đúng nghĩa, không phải PUT)', async () => {
      const user = await seedUser('patch-partial');

      await app.inject({
        method: 'PATCH',
        url: '/v1/me/account',
        headers: user.headers,
        payload: { displayName: 'Giữ tên', locale: 'vi-VN' },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/me/account',
        headers: user.headers,
        payload: { timezone: 'UTC' },
      });

      const body = res.json() as Record<string, unknown>;
      expect(body.displayName).toBe('Giữ tên');
      expect(body.locale).toBe('vi-VN');
      expect(body.timezone).toBe('UTC');
    });

    it('từ chối giá trị vượt độ dài cho phép', async () => {
      const user = await seedUser('patch-toolong');

      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/me/account',
        headers: user.headers,
        payload: { displayName: 'x'.repeat(101) },
      });

      expect(res.statusCode).toBe(400);
    });

    it('từ chối sai kiểu dữ liệu', async () => {
      const user = await seedUser('patch-wrongtype');

      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/me/account',
        headers: user.headers,
        payload: { displayName: 12345 },
      });

      expect(res.statusCode).toBe(400);
    });

    it('thiếu CSRF token → 403 (mutation phải qua cửa CSRF)', async () => {
      const user = await seedUser('patch-nocsrf');

      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/me/account',
        headers: { 'x-session-token': user.headers['x-session-token'] },
        payload: { displayName: 'Không qua được' },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /v1/me/permissions', () => {
    it('user thường nhận danh sách RỖNG — deny-by-default', async () => {
      const user = await seedUser('perm-plain');

      const res = await app.inject({
        method: 'GET',
        url: '/v1/me/permissions',
        headers: user.headers,
      });

      expect(res.statusCode).toBe(200);
      expect((res.json() as { permissions: string[] }).permissions).toEqual([]);
    });

    it('admin nhận đúng các permission được cấp', async () => {
      const user = await seedUser('perm-admin');

      const roleId = crypto.randomUUID();
      await client.sql`
        INSERT INTO control_plane.admin_roles (id, key, display_name, status)
        VALUES (${roleId}, 'support', 'Hỗ trợ', 'active')
      `;
      await client.sql`
        INSERT INTO control_plane.admin_role_permissions (id, admin_role_id, permission)
        VALUES (${crypto.randomUUID()}, ${roleId}, 'account:read')
      `;
      await client.sql`
        INSERT INTO control_plane.admin_role_assignments
          (id, admin_role_id, account_id, valid_from, reason, assigned_by_account_id)
        VALUES (${crypto.randomUUID()}, ${roleId}, ${user.accountId}, now(), 'test', ${user.accountId})
      `;

      const res = await app.inject({
        method: 'GET',
        url: '/v1/me/permissions',
        headers: user.headers,
      });

      expect((res.json() as { permissions: string[] }).permissions).toEqual(['account:read']);
    });

    it('không có phiên → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/me/permissions' });
      expect(res.statusCode).toBe(401);
    });
  });
});
