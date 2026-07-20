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
 * `GET /v1/admin/accounts` (tìm kiếm) và `GET /v1/admin/accounts/:id/sessions`.
 *
 * Hai điểm cần chứng minh:
 *   1. Tìm rỗng KHÔNG trả toàn bộ account — chống dùng API tra cứu để tải cả database.
 *   2. Hai endpoint cần HAI permission KHÁC NHAU; có cái này không tự động có cái kia.
 */
describe('/v1/admin/accounts — tìm kiếm và phiên', () => {
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

  async function createUser(subject: string, email?: string, displayName?: string) {
    const { accountId } = await provisionByExternalIdentity(
      client.db,
      { issuer: 'http://localhost:3001/oidc', subject },
      { ...(email ? { email } : {}), ...(displayName ? { displayName } : {}) },
    );
    const session = await createWebSession(client.db, accountId, { ttlSeconds: 3600 });
    return { accountId, token: session.sessionToken, csrf: session.csrfToken };
  }

  async function grant(accountId: string, permissions: string[]) {
    const roleId = crypto.randomUUID();
    await client.sql`
      INSERT INTO control_plane.admin_roles (id, key, display_name, status)
      VALUES (${roleId}, ${`role-${roleId.slice(0, 8)}`}, 'Test', 'active')
    `;
    for (const permission of permissions) {
      await client.sql`
        INSERT INTO control_plane.admin_role_permissions (id, admin_role_id, permission)
        VALUES (${crypto.randomUUID()}, ${roleId}, ${permission})
      `;
    }
    await client.sql`
      INSERT INTO control_plane.admin_role_assignments
        (id, admin_role_id, account_id, valid_from, reason, assigned_by_account_id)
      VALUES (${crypto.randomUUID()}, ${roleId}, ${accountId}, now(), 'test', ${accountId})
    `;
  }

  describe('tìm kiếm', () => {
    it('query RỖNG trả về danh sách rỗng — không tải toàn bộ account', async () => {
      // Đây là ràng buộc chống dò dữ liệu, không phải giới hạn của giao diện.
      await createUser('search-a', 'a@example.com');
      await createUser('search-b', 'b@example.com');
      const admin = await createUser('search-admin');
      await grant(admin.accountId, ['account:read']);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/accounts',
        headers: { 'x-session-token': admin.token },
      });

      expect(res.statusCode).toBe(200);
      expect((res.json() as { items: unknown[] }).items).toEqual([]);
    });

    it('tìm theo email khớp một phần, không phân biệt hoa thường', async () => {
      await createUser('search-c', 'NguoiDung@Example.com');
      const admin = await createUser('search-admin-2');
      await grant(admin.accountId, ['account:read']);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/accounts?query=nguoidung',
        headers: { 'x-session-token': admin.token },
      });

      const items = (res.json() as { items: Array<{ email: string }> }).items;
      expect(items).toHaveLength(1);
      expect(items[0]?.email).toBe('NguoiDung@Example.com');
    });

    it('tìm theo UUID account khớp chính xác', async () => {
      const target = await createUser('search-uuid', 'uuid@example.com');
      const admin = await createUser('search-admin-3');
      await grant(admin.accountId, ['account:read']);

      const res = await app.inject({
        method: 'GET',
        url: `/v1/admin/accounts?query=${target.accountId}`,
        headers: { 'x-session-token': admin.token },
      });

      const items = (res.json() as { items: Array<{ id: string }> }).items;
      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe(target.accountId);
    });

    it('ký tự đại diện của người dùng bị escape — `%` không thành wildcard', async () => {
      // Không escape thì gõ `%` sẽ khớp MỌI account, biến ô tìm kiếm thành nút "tải hết".
      await createUser('search-esc', 'binhthuong@example.com');
      const admin = await createUser('search-admin-4');
      await grant(admin.accountId, ['account:read']);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/accounts?query=%25',
        headers: { 'x-session-token': admin.token },
      });

      expect((res.json() as { items: unknown[] }).items).toEqual([]);
    });

    it('phân trang cursor trả nextCursor rồi hết', async () => {
      for (let i = 0; i < 3; i++) {
        await createUser(`page-${i}`, `page${i}@example.com`);
      }
      const admin = await createUser('search-admin-5');
      await grant(admin.accountId, ['account:read']);

      const first = await app.inject({
        method: 'GET',
        url: '/v1/admin/accounts?query=page&limit=2',
        headers: { 'x-session-token': admin.token },
      });
      const firstBody = first.json() as { items: unknown[]; nextCursor: string | null };
      expect(firstBody.items).toHaveLength(2);
      expect(firstBody.nextCursor).not.toBeNull();

      const second = await app.inject({
        method: 'GET',
        url: `/v1/admin/accounts?query=page&limit=2&cursor=${encodeURIComponent(firstBody.nextCursor as string)}`,
        headers: { 'x-session-token': admin.token },
      });
      const secondBody = second.json() as { items: unknown[]; nextCursor: string | null };
      expect(secondBody.items).toHaveLength(1);
      expect(secondBody.nextCursor).toBeNull();
    });

    it('limit bị chặn trên 100 — không cho tự đặt số tuỳ ý', async () => {
      const admin = await createUser('search-admin-6');
      await grant(admin.accountId, ['account:read']);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/accounts?query=x&limit=999999',
        headers: { 'x-session-token': admin.token },
      });

      expect(res.statusCode).toBe(200);
    });

    it('thiếu permission `account:read` → 403', async () => {
      const plain = await createUser('search-plain');

      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/accounts?query=abc',
        headers: { 'x-session-token': plain.token },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('liệt kê phiên', () => {
    it('trả metadata phiên, KHÔNG có hash token dưới bất kỳ tên trường nào', async () => {
      const target = await createUser('sessions-target');
      const admin = await createUser('sessions-admin');
      await grant(admin.accountId, ['session:revoke']);

      const res = await app.inject({
        method: 'GET',
        url: `/v1/admin/accounts/${target.accountId}/sessions`,
        headers: { 'x-session-token': admin.token },
      });

      expect(res.statusCode).toBe(200);
      const items = res.json() as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
      expect(Object.keys(items[0] as object)).toEqual([
        'id',
        'createdAt',
        'lastSeenAt',
        'expiresAt',
        'revokedAt',
      ]);
    });

    it('cần `session:revoke`, KHÔNG phải `account:read`', async () => {
      // Hai permission tách biệt có chủ đích: xem thiết bị và giờ hoạt động của người khác
      // là dữ liệu nhạy cảm hơn xem hồ sơ.
      const target = await createUser('sessions-target-2');
      const readOnly = await createUser('sessions-readonly');
      await grant(readOnly.accountId, ['account:read']);

      const detail = await app.inject({
        method: 'GET',
        url: `/v1/admin/accounts/${target.accountId}`,
        headers: { 'x-session-token': readOnly.token },
      });
      expect(detail.statusCode).toBe(200);

      const sessions = await app.inject({
        method: 'GET',
        url: `/v1/admin/accounts/${target.accountId}/sessions`,
        headers: { 'x-session-token': readOnly.token },
      });
      expect(sessions.statusCode).toBe(403);
    });
  });
});
