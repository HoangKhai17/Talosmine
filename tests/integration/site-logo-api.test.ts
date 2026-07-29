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
import { resetEnvCache } from '../../apps/control-plane/src/shared/env';
import { applyAllMigrations, startPostgres } from '../support/postgres';

/** PNG 1×1 hợp lệ — đủ để kiểm đường bytes đi và về nguyên vẹn. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Logo tải lên (`/v1/site/logo` + `/v1/admin/site/logo`).
 *
 * TRỌNG TÂM: bytes đi và về NGUYÊN VẸN kèm đúng Content-Type; MIME ngoài danh mục (nhất là
 * SVG) bị chặn; và quyền runtime có UPDATE/DELETE tường minh — bug 0010.
 */
describe('/v1/site/logo', () => {
  let container: StartedPostgreSqlContainer;
  let client: DatabaseClient;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await startPostgres();
    client = createDatabaseClient(container.getConnectionUri());
    await applyAllMigrations(client.sql);

    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.NODE_ENV = 'test';
    resetEnvCache();

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
    resetEnvCache();
  });

  beforeEach(async () => {
    await client.sql`TRUNCATE control_plane.site_assets`;
    await client.sql`TRUNCATE control_plane.admin_role_assignments, control_plane.admin_role_permissions, control_plane.admin_roles`;
    await client.sql`TRUNCATE control_plane.accounts CASCADE`;
  });

  async function createAdmin(subject: string, permissions: string[]) {
    const { accountId } = await provisionByExternalIdentity(client.db, {
      issuer: 'http://localhost:3001/oidc',
      subject,
    });

    const roleId = crypto.randomUUID();
    await client.sql`
      INSERT INTO control_plane.admin_roles (id, key, display_name, status)
      VALUES (${roleId}, ${`r-${subject}`}, ${subject}, 'active')
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

    const session = await createWebSession(client.db, accountId, { ttlSeconds: 3600 });
    return {
      headers: {
        'x-session-token': session.sessionToken,
        'x-csrf-token': session.csrfToken,
      },
    };
  }

  function put(headers: Record<string, string>, payload: Record<string, unknown>) {
    return app.inject({
      method: 'PUT',
      url: '/v1/admin/site/logo',
      headers,
      payload: { reason: 'test', ...payload },
    });
  }

  it('chưa tải logo → đường công khai trả 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/site/logo' });
    expect(res.statusCode).toBe(404);
  });

  it('bytes đi và về NGUYÊN VẸN, kèm đúng Content-Type và nosniff', async () => {
    const admin = await createAdmin('uploader', ['content:manage']);
    expect(
      (await put(admin.headers, { mime: 'image/png', data: TINY_PNG.toString('base64') }))
        .statusCode,
    ).toBe(204);

    const res = await app.inject({ method: 'GET', url: '/v1/site/logo' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(res.rawPayload, TINY_PNG)).toBe(0);
  });

  it('tải lần hai là THAY, không phải thêm — bảng chỉ có một hàng', async () => {
    const admin = await createAdmin('replacer', ['content:manage']);
    await put(admin.headers, { mime: 'image/png', data: TINY_PNG.toString('base64') });
    await put(admin.headers, { mime: 'image/webp', data: TINY_PNG.toString('base64') });

    const rows = await client.sql<{ mime: string }[]>`
      SELECT mime FROM control_plane.site_assets
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.mime).toBe('image/webp');
  });

  it('TỪ CHỐI SVG và MIME lạ — đường XSS bị đóng ở cả API lẫn CHECK', async () => {
    const admin = await createAdmin('svg', ['content:manage']);
    for (const mime of ['image/svg+xml', 'text/html', 'application/pdf']) {
      const res = await put(admin.headers, { mime, data: TINY_PNG.toString('base64') });
      expect(res.statusCode, mime).toBe(400);
    }
  });

  it('TỪ CHỐI chuỗi không phải base64', async () => {
    const admin = await createAdmin('garbage', ['content:manage']);
    expect(
      (await put(admin.headers, { mime: 'image/png', data: 'khong-phai-base64!!!' })).statusCode,
    ).toBe(400);
  });

  it('gỡ logo → đường công khai quay về 404; gỡ lần nữa vẫn 204', async () => {
    const admin = await createAdmin('remover', ['content:manage']);
    await put(admin.headers, { mime: 'image/png', data: TINY_PNG.toString('base64') });

    const del = () =>
      app.inject({
        method: 'DELETE',
        url: '/v1/admin/site/logo',
        headers: admin.headers,
        payload: { reason: 'test' },
      });

    expect((await del()).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/v1/site/logo' })).statusCode).toBe(404);
    expect((await del()).statusCode).toBe(204);
  });

  it('thiếu phiên → 401; `content:read` không tải lên được → 403', async () => {
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/admin/site/logo',
          payload: { mime: 'image/png', data: 'AA==', reason: 't' },
        })
      ).statusCode,
    ).toBe(401);

    const reader = await createAdmin('reader', ['content:read']);
    expect(
      (await put(reader.headers, { mime: 'image/png', data: TINY_PNG.toString('base64') }))
        .statusCode,
    ).toBe(403);
  });

  /** Chỉ kiểm GRANT tường minh — xem `docs/coding-conventions.md` mục 6. */
  it('role runtime có UPDATE và DELETE tường minh trên site_assets', async () => {
    for (const privilege of ['UPDATE', 'DELETE']) {
      const rows = await client.sql<{ ok: boolean }[]>`
        SELECT has_table_privilege('talosmine_runtime', 'control_plane.site_assets', ${privilege}) AS ok
      `;
      expect(rows[0]?.ok, `cần ${privilege}`).toBe(true);
    }
  });
});
