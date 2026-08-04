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
 * API danh mục ứng dụng (P3).
 *
 * Trọng tâm ba thứ:
 *   1. URL policy được THỰC SỰ gọi ở đường tạo/sửa — không chỉ tồn tại như một hàm rời.
 *   2. Người dùng chỉ thấy app `active`, và không phân biệt được "chưa phát hành" với
 *      "không tồn tại".
 *   3. `catalog:manage` KHÔNG cho phép phát hành — đó là `catalog:publish`.
 */
describe('/v1/catalog + /v1/admin/catalog', () => {
  let container: StartedPostgreSqlContainer;
  let client: DatabaseClient;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await startPostgres();
    client = createDatabaseClient(container.getConnectionUri());
    await applyAllMigrations(client.sql);

    // `CatalogService` đọc env lúc chạy để lấy allowlist, nên test phải cung cấp một env
    // HỢP LỆ ĐỦ — kể cả `DATABASE_URL` mà bình thường test không cần (nó override
    // `DATABASE_CLIENT`). Thiếu biến bắt buộc thì `loadEnv` ném lỗi và request trả 500,
    // che mất kết quả thật.
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.NODE_ENV = 'test'; // tắt ngoại lệ loopback của URL policy

    // `evil.com` CỐ Ý không có trong allowlist — đó là điểm của phần lớn ca kiểm.
    process.env.CATALOG_ALLOWED_HOSTS = 'app.example.com, storage.internal!internal';
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
    await client.sql`TRUNCATE control_plane.applications CASCADE`;
    await client.sql`TRUNCATE control_plane.admin_role_assignments, control_plane.admin_role_permissions, control_plane.admin_roles`;
    await client.sql`TRUNCATE control_plane.accounts CASCADE`;
  });

  async function createUser(subject: string, permissions: string[] = []) {
    const { accountId } = await provisionByExternalIdentity(client.db, {
      issuer: 'http://localhost:3001/oidc',
      subject,
    });

    if (permissions.length > 0) {
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
    }

    const session = await createWebSession(client.db, accountId, { ttlSeconds: 3600 });
    return {
      accountId,
      headers: {
        'x-session-token': session.sessionToken,
        'x-csrf-token': session.csrfToken,
      },
    };
  }

  const FULL = ['catalog:read', 'catalog:manage', 'catalog:publish'];

  async function createApp(headers: Record<string, string>, key: string, extra = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/catalog/applications',
      headers,
      payload: {
        key,
        displayName: `App ${key}`,
        launchUrl: 'https://app.example.com/launch',
        reason: 'test',
        ...extra,
      },
    });
    return res;
  }

  describe('URL policy được gọi thật ở đường ghi', () => {
    it('TỪ CHỐI host ngoài allowlist', async () => {
      const admin = await createUser('url-host', FULL);
      const res = await createApp(admin.headers, 'a1', {
        launchUrl: 'https://evil.com/launch',
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ message: expect.stringContaining('danh sách') });
    });

    it('TỪ CHỐI http', async () => {
      const admin = await createUser('url-http', FULL);
      const res = await createApp(admin.headers, 'a2', {
        launchUrl: 'http://app.example.com/launch',
      });
      expect(res.statusCode).toBe(400);
    });

    it('TỪ CHỐI userinfo — vector lừa đảo', async () => {
      const admin = await createUser('url-userinfo', FULL);
      const res = await createApp(admin.headers, 'a3', {
        launchUrl: 'https://talosmine.vn@app.example.com/',
      });
      expect(res.statusCode).toBe(400);
    });

    it('TỪ CHỐI javascript: — vector XSS khi render thành link', async () => {
      const admin = await createUser('url-js', FULL);
      const res = await createApp(admin.headers, 'a4', {
        launchUrl: 'javascript:alert(1)',
      });
      expect(res.statusCode).toBe(400);
    });

    it('LƯU DẠNG CHUẨN HOÁ, không lưu chuỗi gốc', async () => {
      const admin = await createUser('url-canon', FULL);
      const res = await createApp(admin.headers, 'a5', {
        launchUrl: 'HTTPS://APP.Example.COM:443/Launch#top',
      });
      expect(res.statusCode).toBe(201);

      const rows = await client.sql`
        SELECT launch_url FROM control_plane.applications WHERE key = 'a5'
      `;
      // Host hạ chữ thường, cổng mặc định bỏ, fragment bỏ. Path GIỮ NGUYÊN hoa thường.
      expect(rows[0]?.launch_url).toBe('https://app.example.com/Launch');
    });

    it('cũng áp cho imageUrl', async () => {
      const admin = await createUser('url-image', FULL);
      const res = await createApp(admin.headers, 'a6', {
        imageUrl: 'https://evil.com/logo.png',
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('vòng đời và phân quyền', () => {
    it('app mới LUÔN ở trạng thái draft — không tạo thẳng active', async () => {
      const admin = await createUser('life-draft', FULL);
      await createApp(admin.headers, 'b1');

      const rows = await client.sql`SELECT status FROM control_plane.applications WHERE key='b1'`;
      expect(rows[0]?.status).toBe('draft');
    });

    it('`catalog:manage` KHÔNG cho phép phát hành → 403', async () => {
      // Đây là lý do tách `publish` ra permission riêng: người sửa nội dung và người
      // quyết định đưa app ra trước người dùng không nhất thiết là một.
      const editor = await createUser('life-editor', ['catalog:read', 'catalog:manage']);
      const created = await createApp(editor.headers, 'b2');
      const { id } = created.json() as { id: string };

      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/catalog/applications/${id}/status`,
        headers: editor.headers,
        payload: { status: 'active', reason: 'thử phát hành' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('KHÔNG quay về draft sau khi đã phát hành', async () => {
      // App đã active nghĩa là người dùng đã thấy nó. Đưa về draft tạo ra trạng thái
      // "chưa từng phát hành" cho một thứ đã phát hành — dấu vết lịch sử nói dối.
      const admin = await createUser('life-back', FULL);
      const created = await createApp(admin.headers, 'b3');
      const { id } = created.json() as { id: string };

      await app.inject({
        method: 'POST',
        url: `/v1/admin/catalog/applications/${id}/status`,
        headers: admin.headers,
        payload: { status: 'active', reason: 'phát hành' },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/catalog/applications/${id}/status`,
        headers: admin.headers,
        payload: { status: 'draft', reason: 'quay lại' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('active ⇄ inactive đi lại được', async () => {
      const admin = await createUser('life-toggle', FULL);
      const created = await createApp(admin.headers, 'b4');
      const { id } = created.json() as { id: string };

      for (const status of ['active', 'inactive', 'active']) {
        const res = await app.inject({
          method: 'POST',
          url: `/v1/admin/catalog/applications/${id}/status`,
          headers: admin.headers,
          payload: { status, reason: `đổi sang ${status}` },
        });
        expect(res.statusCode, `đổi sang ${status}`).toBe(204);
      }
    });

    it('key trùng → 409', async () => {
      const admin = await createUser('life-dup', FULL);
      expect((await createApp(admin.headers, 'b5')).statusCode).toBe(201);
      expect((await createApp(admin.headers, 'b5')).statusCode).toBe(409);
    });

    it('KHÔNG sửa được key — nó là định danh mà dữ liệu lịch sử tham chiếu', async () => {
      const admin = await createUser('life-key', FULL);
      const created = await createApp(admin.headers, 'b6');
      const { id } = created.json() as { id: string };

      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/admin/catalog/applications/${id}`,
        headers: admin.headers,
        payload: { key: 'doi-key', displayName: 'Tên mới', reason: 'thử đổi key' },
      });
      expect(res.statusCode).toBe(204);

      const rows = await client.sql`SELECT key FROM control_plane.applications WHERE id=${id}`;
      expect(rows[0]?.key).toBe('b6');
    });

    it('thiếu `reason` → 400', async () => {
      const admin = await createUser('life-noreason', FULL);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/catalog/applications',
        headers: admin.headers,
        payload: {
          key: 'b7',
          displayName: 'App',
          launchUrl: 'https://app.example.com/x',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('key sai định dạng → 400', async () => {
      const admin = await createUser('life-badkey', FULL);
      for (const key of ['Có Dấu', '1bat-dau-bang-so', 'có_gạch_dưới', '']) {
        const res = await createApp(admin.headers, key);
        expect(res.statusCode, `key "${key}"`).toBe(400);
      }
    });
  });

  describe('audit', () => {
    it('ghi audit kèm key đọc được, trong cùng transaction', async () => {
      const admin = await createUser('audit-create', FULL);
      const created = await createApp(admin.headers, 'c1');
      const { id } = created.json() as { id: string };

      await app.inject({
        method: 'POST',
        url: `/v1/admin/catalog/applications/${id}/status`,
        headers: admin.headers,
        payload: { status: 'active', reason: 'phát hành lần đầu' },
      });

      const events = await client.sql`
        SELECT action, target_key, actor_account_id, reason
        FROM control_plane.audit_events
        WHERE target_type = 'application' ORDER BY created_at
      `;
      expect(events.map((e) => e.action)).toEqual(['application.created', 'application.published']);
      expect(events[0]?.target_key).toBe('c1');
      expect(events[1]?.actor_account_id).toBe(admin.accountId);
      expect(events[1]?.reason).toBe('phát hành lần đầu');
    });
  });

  describe('danh mục cho người dùng', () => {
    it('CHỈ thấy app active', async () => {
      const admin = await createUser('pub-admin', FULL);
      const user = await createUser('pub-user');

      await createApp(admin.headers, 'p-draft');
      const activeApp = await createApp(admin.headers, 'p-active');
      const { id } = activeApp.json() as { id: string };
      await app.inject({
        method: 'POST',
        url: `/v1/admin/catalog/applications/${id}/status`,
        headers: admin.headers,
        payload: { status: 'active', reason: 'phát hành' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/catalog/applications',
        headers: { 'x-session-token': user.headers['x-session-token'] },
      });

      expect(res.statusCode).toBe(200);
      const items = res.json() as Array<{ key: string }>;
      expect(items.map((i) => i.key)).toEqual(['p-active']);
    });

    it('KHÔNG lộ `status` — trường đó không mang thông tin gì cho người dùng', async () => {
      const admin = await createUser('pub-nostatus', FULL);
      const user = await createUser('pub-nostatus-user');
      const created = await createApp(admin.headers, 'p2');
      const { id } = created.json() as { id: string };
      await app.inject({
        method: 'POST',
        url: `/v1/admin/catalog/applications/${id}/status`,
        headers: admin.headers,
        payload: { status: 'active', reason: 'phát hành' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/catalog/applications',
        headers: { 'x-session-token': user.headers['x-session-token'] },
      });
      const items = res.json() as Array<Record<string, unknown>>;
      // Danh sách CHÍNH XÁC — không thừa không thiếu. `kind` thêm ở migration 0017 (DEC-B17)
      // và CÓ CHỦ ĐÍCH lộ ra: frontend phải phân nhánh theo nó (`hosted` chạy trong Hub,
      // `external_link` mở ra ngoài), không được đoán từ việc `launchUrl` có giá trị hay
      // không. Khác hẳn `status` — trường đó bị giấu vì không mang thông tin gì cho người
      // dùng ngoài việc lộ ra rằng hệ thống có những trạng thái khác.
      expect(Object.keys(items[0] as object)).toEqual([
        'id',
        'key',
        'kind',
        'displayName',
        'description',
        'imageUrl',
        'launchUrl',
      ]);
    });

    it('app draft trả 404 GIỐNG HỆT app không tồn tại', async () => {
      // Phân biệt hai trường hợp cho phép dò xem hệ thống đang chuẩn bị app nào.
      const admin = await createUser('pub-404', FULL);
      const user = await createUser('pub-404-user');
      await createApp(admin.headers, 'chua-phat-hanh');

      const draft = await app.inject({
        method: 'GET',
        url: '/v1/catalog/applications/chua-phat-hanh',
        headers: { 'x-session-token': user.headers['x-session-token'] },
      });
      const missing = await app.inject({
        method: 'GET',
        url: '/v1/catalog/applications/khong-ton-tai',
        headers: { 'x-session-token': user.headers['x-session-token'] },
      });

      expect(draft.statusCode).toBe(404);
      expect(missing.statusCode).toBe(404);
      expect(draft.json()).toEqual(missing.json());
    });

    it('cần đăng nhập → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/catalog/applications' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('deny-by-default', () => {
    it('user thường không đọc được danh mục quản trị → 403', async () => {
      const plain = await createUser('deny-plain');
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/catalog/applications',
        headers: plain.headers,
      });
      expect(res.statusCode).toBe(403);
    });

    it('`catalog:read` KHÔNG cho phép tạo → 403', async () => {
      const reader = await createUser('deny-reader', ['catalog:read']);
      const res = await createApp(reader.headers, 'd1');
      expect(res.statusCode).toBe(403);
    });
  });
});
