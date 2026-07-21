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

/**
 * Redirect URI và Feature — tài nguyên con của application.
 *
 * Trọng tâm: **cách ly giữa các app**. Mọi route mang `applicationId` trong đường dẫn, và
 * service phải ràng buộc theo nó — nếu không, biết id của một redirect URI là đủ để xoá
 * nó khỏi app khác.
 */
describe('/v1/admin/catalog/applications/:id — redirect URI và feature', () => {
  let container: StartedPostgreSqlContainer;
  let client: DatabaseClient;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await startPostgres();
    client = createDatabaseClient(container.getConnectionUri());
    await applyAllMigrations(client.sql);

    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.NODE_ENV = 'test';
    process.env.CATALOG_ALLOWED_HOSTS = 'app.example.com';
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

  let headers: Record<string, string>;
  let appA: string;
  let appB: string;

  beforeEach(async () => {
    await client.sql`TRUNCATE control_plane.applications CASCADE`;
    await client.sql`TRUNCATE control_plane.admin_role_assignments, control_plane.admin_role_permissions, control_plane.admin_roles`;
    await client.sql`TRUNCATE control_plane.accounts CASCADE`;

    headers = await createAdmin('sub-admin', ['catalog:read', 'catalog:manage', 'catalog:publish']);
    appA = await createApplication('app-a');
    appB = await createApplication('app-b');
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
      'x-session-token': session.sessionToken,
      'x-csrf-token': session.csrfToken,
    };
  }

  async function createApplication(key: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/catalog/applications',
      headers,
      payload: {
        key,
        displayName: key,
        launchUrl: 'https://app.example.com/launch',
        reason: 'test',
      },
    });
    return (res.json() as { id: string }).id;
  }

  async function addRedirect(applicationId: string, uri: string, purpose = 'login') {
    return app.inject({
      method: 'POST',
      url: `/v1/admin/catalog/applications/${applicationId}/redirect-uris`,
      headers,
      payload: { purpose, uri, reason: 'test' },
    });
  }

  async function addFeature(applicationId: string, key: string) {
    return app.inject({
      method: 'POST',
      url: `/v1/admin/catalog/applications/${applicationId}/features`,
      headers,
      payload: { key, displayName: `Feature ${key}`, reason: 'test' },
    });
  }

  describe('redirect URI', () => {
    it('thêm và liệt kê được', async () => {
      const created = await addRedirect(appA, 'https://app.example.com/callback');
      expect(created.statusCode).toBe(201);

      const list = await app.inject({
        method: 'GET',
        url: `/v1/admin/catalog/applications/${appA}/redirect-uris`,
        headers,
      });
      const items = list.json() as Array<{ uri: string; purpose: string }>;
      expect(items).toHaveLength(1);
      expect(items[0]?.uri).toBe('https://app.example.com/callback');
    });

    it('ĐI QUA chính sách URL — host ngoài allowlist bị chặn', async () => {
      const res = await addRedirect(appA, 'https://evil.com/callback');
      expect(res.statusCode).toBe(400);
    });

    it('LƯU DẠNG CHUẨN HOÁ — nếu không, phép so khớp của IdP sẽ trượt', async () => {
      await addRedirect(appA, 'HTTPS://APP.Example.COM:443/CallBack#x');

      const rows = await client.sql`
        SELECT uri FROM control_plane.application_redirect_uris WHERE application_id = ${appA}
      `;
      expect(rows[0]?.uri).toBe('https://app.example.com/CallBack');
    });

    it('chặn purpose ngoài login/logout', async () => {
      const res = await addRedirect(appA, 'https://app.example.com/cb', 'any');
      expect(res.statusCode).toBe(400);
    });

    it('URI trùng trong cùng app và purpose → 409', async () => {
      expect((await addRedirect(appA, 'https://app.example.com/cb')).statusCode).toBe(201);
      expect((await addRedirect(appA, 'https://app.example.com/cb')).statusCode).toBe(409);
    });

    it('cùng URI nhưng KHÁC purpose thì được', async () => {
      expect((await addRedirect(appA, 'https://app.example.com/cb', 'login')).statusCode).toBe(201);
      expect((await addRedirect(appA, 'https://app.example.com/cb', 'logout')).statusCode).toBe(
        201,
      );
    });

    it('KHÔNG xoá được URI của app KHÁC dù đoán đúng id', async () => {
      // Đây là ràng buộc cách ly quan trọng nhất của controller này.
      const created = await addRedirect(appB, 'https://app.example.com/b-callback');
      const { id } = created.json() as { id: string };

      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/admin/catalog/applications/${appA}/redirect-uris/${id}`,
        headers,
        payload: { reason: 'thử xoá chéo app' },
      });
      expect(res.statusCode).toBe(404);

      // Và URI của app B còn nguyên.
      const rows = await client.sql`
        SELECT count(*)::int AS n FROM control_plane.application_redirect_uris
        WHERE application_id = ${appB}
      `;
      expect(rows[0]?.n).toBe(1);
    });

    it('xoá GHI LẠI giá trị đã xoá vào audit — đó là nơi duy nhất còn dấu vết', async () => {
      const created = await addRedirect(appA, 'https://app.example.com/go-di');
      const { id } = created.json() as { id: string };

      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/admin/catalog/applications/${appA}/redirect-uris/${id}`,
        headers,
        payload: { reason: 'không dùng nữa' },
      });
      expect(res.statusCode).toBe(204);

      const events = await client.sql`
        SELECT details, reason FROM control_plane.audit_events
        WHERE action = 'application_redirect_uri.removed'
      `;
      expect(events).toHaveLength(1);
      expect(events[0]?.details).toMatchObject({ uri: 'https://app.example.com/go-di' });
      expect(events[0]?.reason).toBe('không dùng nữa');
    });

    it('xoá thiếu `reason` → 400', async () => {
      const created = await addRedirect(appA, 'https://app.example.com/x');
      const { id } = created.json() as { id: string };

      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/admin/catalog/applications/${appA}/redirect-uris/${id}`,
        headers,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('feature', () => {
    it('tạo được, luôn ở draft', async () => {
      const res = await addFeature(appA, 'xuat-bao-cao');
      expect(res.statusCode).toBe(201);

      const rows = await client.sql`
        SELECT status FROM control_plane.features WHERE application_id = ${appA}
      `;
      expect(rows[0]?.status).toBe('draft');
    });

    it('key trùng TRONG CÙNG app → 409', async () => {
      expect((await addFeature(appA, 'trung')).statusCode).toBe(201);
      expect((await addFeature(appA, 'trung')).statusCode).toBe(409);
    });

    it('cùng key ở app KHÁC thì được — key chỉ ổn định trong phạm vi app', async () => {
      expect((await addFeature(appA, 'chung-key')).statusCode).toBe(201);
      expect((await addFeature(appB, 'chung-key')).statusCode).toBe(201);
    });

    it('KHÔNG sửa được feature của app KHÁC', async () => {
      const created = await addFeature(appB, 'cua-b');
      const { id } = created.json() as { id: string };

      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/admin/catalog/applications/${appA}/features/${id}`,
        headers,
        payload: { displayName: 'Đổi trộm', reason: 'thử' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('dùng CHUNG máy trạng thái với application — không quay về draft', async () => {
      const created = await addFeature(appA, 'vong-doi');
      const { id } = created.json() as { id: string };

      const activate = await app.inject({
        method: 'POST',
        url: `/v1/admin/catalog/applications/${appA}/features/${id}/status`,
        headers,
        payload: { status: 'active', reason: 'bật' },
      });
      expect(activate.statusCode).toBe(204);

      const back = await app.inject({
        method: 'POST',
        url: `/v1/admin/catalog/applications/${appA}/features/${id}/status`,
        headers,
        payload: { status: 'draft', reason: 'quay lại' },
      });
      expect(back.statusCode).toBe(400);
    });

    it('đổi trạng thái cần `catalog:publish`, không phải `catalog:manage`', async () => {
      const editorHeaders = await createAdmin('sub-editor', ['catalog:read', 'catalog:manage']);
      const created = await addFeature(appA, 'quyen-han');
      const { id } = created.json() as { id: string };

      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/catalog/applications/${appA}/features/${id}/status`,
        headers: editorHeaders,
        payload: { status: 'active', reason: 'thử' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('audit ghi key ghép app/feature để đọc log không phải tra bảng', async () => {
      await addFeature(appA, 'co-key-ghep');

      const events = await client.sql`
        SELECT target_key FROM control_plane.audit_events WHERE action = 'feature.created'
      `;
      expect(events[0]?.target_key).toBe('app-a/co-key-ghep');
    });

    it('app không tồn tại → 404', async () => {
      const res = await addFeature('00000000-0000-0000-0000-0000000000ff', 'mo-coi');
      expect(res.statusCode).toBe(404);
    });
  });

  describe('định tuyến', () => {
    it('`/features` KHÔNG bị khớp nhầm thành một applicationId', async () => {
      // Controller gốc khai `:applicationId`, controller con khai `features` dưới nó.
      // Nếu thứ tự đăng ký sai, Fastify sẽ coi "features" là một id và trả 400 vì
      // ParseUUIDPipe — chứ không chạy đúng handler.
      const res = await app.inject({
        method: 'GET',
        url: `/v1/admin/catalog/applications/${appA}/features`,
        headers,
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    });
  });
});
