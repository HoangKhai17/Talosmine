import 'reflect-metadata';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
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
 * Ứng dụng `hosted` — DEC-B17, DEC-T27, migration 0017.
 *
 * Bốn nhóm bất biến được kiểm ở đây:
 *   1. Lược đồ: `kind` là danh mục đóng; app `external_link` BẮT BUỘC có `launchUrl`, app
 *      `hosted` bắt buộc KHÔNG có.
 *   2. Binding chỉ đặt được cho app `hosted`, và `endpointUrl` đi qua đúng URL policy.
 *   3. `run` chỉ chạy khi app đồng thời `active` VÀ `hosted` VÀ đã có binding — mọi trường
 *      hợp khác trả 404 giống hệt nhau, không phân biệt được từ ngoài.
 *   4. Mỗi lượt chạy để lại một dòng audit, KỂ CẢ khi nhà cung cấp lỗi.
 *
 * Nhà cung cấp là một HTTP server THẬT dựng bằng `node:http`, không mock `fetch` — cùng
 * cách `oidc-verifier.test.ts` làm với JWKS.
 */
describe('/v1/catalog/applications/:key/run + hosted-binding', () => {
  let container: StartedPostgreSqlContainer;
  let client: DatabaseClient;
  let app: NestFastifyApplication;
  let provider: Server;
  let providerPort: number;
  let providerHits = 0;

  beforeAll(async () => {
    provider = createServer((req, res) => {
      providerHits += 1;
      if (req.url === '/fail') {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('bi mat noi bo khong duoc lo ra ngoai');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([{ generated_text: 'ket qua tu nha cung cap' }]));
    });
    await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
    providerPort = (provider.address() as AddressInfo).port;

    container = await startPostgres();
    client = createDatabaseClient(container.getConnectionUri());
    await applyAllMigrations(client.sql);

    process.env.DATABASE_URL = container.getConnectionUri();
    // `development` để URL policy chấp nhận `http://127.0.0.1` của server giả lập nhà cung
    // cấp. Ngoại lệ này CHỈ áp cho loopback — xem `checkUrlSyntax`.
    process.env.NODE_ENV = 'development';
    // `!internal` là BẮT BUỘC ở đây, và đó chính là điểm đáng chú ý: server giả lập nhà
    // cung cấp chạy trên loopback, mà `isPrivateAddress` chặn đúng dải đó. Cờ `!internal`
    // là cơ chế đã thiết kế sẵn cho "hạ tầng của chính dự án nằm trên địa chỉ nội bộ" —
    // trước DEC-T27 nó VÔ TÁC DỤNG vì không ai gọi `checkResolvedAddresses`. Việc test này
    // buộc phải khai cờ đó mới chạy được là bằng chứng mối nối đã có thật.
    process.env.CATALOG_ALLOWED_HOSTS = 'app.example.com, 127.0.0.1!internal';
    process.env.HUGGINGFACE_API_TOKEN = 'hf-test-token';
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
    await new Promise<void>((resolve) => provider.close(() => resolve()));
    resetEnvCache();
  });

  beforeEach(async () => {
    providerHits = 0;
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

  const endpointUrl = () => `http://127.0.0.1:${providerPort}/run`;

  async function createHostedApp(headers: Record<string, string>, key: string) {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/catalog/applications',
      headers,
      payload: { key, kind: 'hosted', displayName: `App ${key}`, reason: 'test' },
    });
    return created;
  }

  async function setBinding(headers: Record<string, string>, id: string, extra = {}) {
    return app.inject({
      method: 'PUT',
      url: `/v1/admin/catalog/applications/${id}/hosted-binding`,
      headers,
      payload: {
        provider: 'huggingface',
        endpointUrl: endpointUrl(),
        reason: 'test',
        ...extra,
      },
    });
  }

  async function publish(headers: Record<string, string>, id: string) {
    return app.inject({
      method: 'POST',
      url: `/v1/admin/catalog/applications/${id}/status`,
      headers,
      payload: { status: 'active', reason: 'test' },
    });
  }

  describe('lược đồ: kind và launchUrl phải nhất quán', () => {
    it('app `hosted` tạo được KHÔNG kèm launchUrl', async () => {
      const admin = await createUser('k1', FULL);
      const res = await createHostedApp(admin.headers, 'hosted-ok');

      expect(res.statusCode).toBe(201);

      const row = await client.sql`
        SELECT kind, launch_url FROM control_plane.applications WHERE key = 'hosted-ok'
      `;
      expect(row[0]).toMatchObject({ kind: 'hosted', launch_url: null });
    });

    it('TỪ CHỐI app `hosted` kèm launchUrl — hai trường mâu thuẫn thì báo, không bỏ qua im lặng', async () => {
      const admin = await createUser('k2', FULL);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/catalog/applications',
        headers: admin.headers,
        payload: {
          key: 'hosted-bad',
          kind: 'hosted',
          displayName: 'X',
          launchUrl: 'https://app.example.com/x',
          reason: 'test',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('TỪ CHỐI app `external_link` thiếu launchUrl', async () => {
      const admin = await createUser('k3', FULL);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/catalog/applications',
        headers: admin.headers,
        payload: { key: 'ext-bad', kind: 'external_link', displayName: 'X', reason: 'test' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('mặc định là `external_link` khi không khai `kind` — caller cũ không vỡ', async () => {
      const admin = await createUser('k4', FULL);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/catalog/applications',
        headers: admin.headers,
        payload: {
          key: 'ext-default',
          displayName: 'X',
          launchUrl: 'https://app.example.com/x',
          reason: 'test',
        },
      });

      expect(res.statusCode).toBe(201);
      const row = await client.sql`
        SELECT kind FROM control_plane.applications WHERE key = 'ext-default'
      `;
      expect(row[0]?.kind).toBe('external_link');
    });

    it('database CHẶN `kind` lạ ở tầng CHECK, không chỉ ở tầng code', async () => {
      await expect(
        client.sql`
          INSERT INTO control_plane.applications (id, key, kind, display_name, launch_url, status)
          VALUES (${crypto.randomUUID()}, 'x', 'khong-ton-tai', 'X', NULL, 'draft')
        `,
      ).rejects.toThrow();
    });
  });

  describe('binding', () => {
    it('đặt được cho app `hosted` và trả về dạng chuẩn hoá', async () => {
      const admin = await createUser('b1', FULL);
      const { id } = (await createHostedApp(admin.headers, 'b-app')).json();

      const res = await setBinding(admin.headers, id);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        applicationId: id,
        provider: 'huggingface',
        timeoutMs: 60000,
      });
    });

    it('KHÔNG có trường nào chứa secret trong phản hồi', async () => {
      const admin = await createUser('b2', FULL);
      const { id } = (await createHostedApp(admin.headers, 'b-secret')).json();
      await setBinding(admin.headers, id);

      const res = await app.inject({
        method: 'GET',
        url: `/v1/admin/catalog/applications/${id}/hosted-binding`,
        headers: admin.headers,
      });

      const body = JSON.stringify(res.json());
      expect(body).not.toContain('hf-test-token');
      expect(Object.keys(res.json())).not.toContain('apiToken');
    });

    it('TỪ CHỐI binding trên app `external_link`', async () => {
      const admin = await createUser('b3', FULL);
      const created = await app.inject({
        method: 'POST',
        url: '/v1/admin/catalog/applications',
        headers: admin.headers,
        payload: {
          key: 'b-ext',
          displayName: 'X',
          launchUrl: 'https://app.example.com/x',
          reason: 'test',
        },
      });

      const res = await setBinding(admin.headers, created.json().id);
      expect(res.statusCode).toBe(400);
    });

    it('TỪ CHỐI endpointUrl ngoài allowlist — cùng chính sách với launchUrl', async () => {
      const admin = await createUser('b4', FULL);
      const { id } = (await createHostedApp(admin.headers, 'b-host')).json();

      const res = await setBinding(admin.headers, id, {
        endpointUrl: 'https://evil.com/run',
      });

      expect(res.statusCode).toBe(400);
    });

    it('TỪ CHỐI nhà cung cấp ngoài danh mục được duyệt', async () => {
      const admin = await createUser('b5', FULL);
      const { id } = (await createHostedApp(admin.headers, 'b-prov')).json();

      const res = await setBinding(admin.headers, id, { provider: 'nha-cung-cap-la' });
      expect(res.statusCode).toBe(400);
    });

    it('`catalog:read` một mình KHÔNG đặt được binding', async () => {
      const admin = await createUser('b6', FULL);
      const { id } = (await createHostedApp(admin.headers, 'b-perm')).json();

      const reader = await createUser('b6-reader', ['catalog:read']);
      const res = await setBinding(reader.headers, id);

      expect(res.statusCode).toBe(403);
    });

    it('gọi PUT hai lần là idempotent, không tạo hàng thứ hai', async () => {
      const admin = await createUser('b7', FULL);
      const { id } = (await createHostedApp(admin.headers, 'b-idem')).json();

      await setBinding(admin.headers, id);
      const second = await setBinding(admin.headers, id, { timeoutMs: 5000 });

      expect(second.statusCode).toBe(200);
      expect(second.json().timeoutMs).toBe(5000);

      const rows = await client.sql`
        SELECT count(*)::int AS n FROM control_plane.application_hosted_bindings
        WHERE application_id = ${id}
      `;
      expect(rows[0]?.n).toBe(1);
    });
  });

  describe('run', () => {
    async function readyApp(subject: string, key: string) {
      const admin = await createUser(subject, FULL);
      const { id } = (await createHostedApp(admin.headers, key)).json();
      await setBinding(admin.headers, id);
      await publish(admin.headers, id);
      return { admin, id };
    }

    it('chạy được và trả kết quả từ nhà cung cấp', async () => {
      const { admin } = await readyApp('r1', 'run-ok');

      const res = await app.inject({
        method: 'POST',
        url: '/v1/catalog/applications/run-ok/run',
        headers: admin.headers,
        payload: { input: 'xin chao' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().output).toContain('ket qua tu nha cung cap');
      expect(providerHits).toBe(1);
    });

    it('ghi MỘT dòng audit cho lượt chạy thành công, không ghi nội dung đầu vào', async () => {
      const { admin, id } = await readyApp('r2', 'run-audit');

      await app.inject({
        method: 'POST',
        url: '/v1/catalog/applications/run-audit/run',
        headers: admin.headers,
        payload: { input: 'du lieu rieng tu cua nguoi dung' },
      });

      const rows = await client.sql`
        SELECT action, target_id, details::text AS details
        FROM control_plane.audit_events
        WHERE action = 'application.hosted_run'
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]?.target_id).toBe(id);
      // Đầu vào của người dùng KHÔNG được vào bảng không xoá được.
      expect(rows[0]?.details).not.toContain('du lieu rieng tu');
    });

    it('app `draft` trả 404 GIỐNG HỆT app không tồn tại', async () => {
      const admin = await createUser('r3', FULL);
      const { id } = (await createHostedApp(admin.headers, 'run-draft')).json();
      await setBinding(admin.headers, id);
      // Cố ý KHÔNG publish.

      const draft = await app.inject({
        method: 'POST',
        url: '/v1/catalog/applications/run-draft/run',
        headers: admin.headers,
        payload: { input: 'x' },
      });
      const missing = await app.inject({
        method: 'POST',
        url: '/v1/catalog/applications/khong-ton-tai/run',
        headers: admin.headers,
        payload: { input: 'x' },
      });

      expect(draft.statusCode).toBe(404);
      expect(missing.statusCode).toBe(404);
      expect(providerHits).toBe(0);
    });

    it('app `external_link` KHÔNG chạy được qua endpoint này', async () => {
      const admin = await createUser('r4', FULL);
      const created = await app.inject({
        method: 'POST',
        url: '/v1/admin/catalog/applications',
        headers: admin.headers,
        payload: {
          key: 'run-ext',
          displayName: 'X',
          launchUrl: 'https://app.example.com/x',
          reason: 'test',
        },
      });
      await publish(admin.headers, created.json().id);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/catalog/applications/run-ext/run',
        headers: admin.headers,
        payload: { input: 'x' },
      });

      expect(res.statusCode).toBe(404);
      expect(providerHits).toBe(0);
    });

    it('app `hosted` đã publish nhưng CHƯA có binding trả 404', async () => {
      const admin = await createUser('r5', FULL);
      const { id } = (await createHostedApp(admin.headers, 'run-nobind')).json();
      await publish(admin.headers, id);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/catalog/applications/run-nobind/run',
        headers: admin.headers,
        payload: { input: 'x' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('KHÔNG cho chạy khi chưa đăng nhập', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/catalog/applications/run-ok/run',
        payload: { input: 'x' },
      });

      expect(res.statusCode).toBe(401);
      expect(providerHits).toBe(0);
    });

    it('TỪ CHỐI input rỗng hoặc sai kiểu trước khi chạm nhà cung cấp', async () => {
      const { admin } = await readyApp('r6', 'run-input');

      const empty = await app.inject({
        method: 'POST',
        url: '/v1/catalog/applications/run-input/run',
        headers: admin.headers,
        payload: { input: '   ' },
      });
      const wrongType = await app.inject({
        method: 'POST',
        url: '/v1/catalog/applications/run-input/run',
        headers: admin.headers,
        payload: { input: 123 },
      });

      expect(empty.statusCode).toBe(400);
      expect(wrongType.statusCode).toBe(400);
      expect(providerHits).toBe(0);
    });

    it('lỗi nhà cung cấp trả 502 và KHÔNG vọng nguyên văn thân lỗi ra ngoài', async () => {
      const admin = await createUser('r7', FULL);
      const { id } = (await createHostedApp(admin.headers, 'run-fail')).json();
      await setBinding(admin.headers, id, {
        endpointUrl: `http://127.0.0.1:${providerPort}/fail`,
      });
      await publish(admin.headers, id);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/catalog/applications/run-fail/run',
        headers: admin.headers,
        payload: { input: 'x' },
      });

      expect(res.statusCode).toBe(502);
      expect(JSON.stringify(res.json())).not.toContain('bi mat noi bo');
    });

    it('lượt chạy THẤT BẠI vẫn để lại audit — nhật ký không được kể nửa câu chuyện', async () => {
      const admin = await createUser('r8', FULL);
      const { id } = (await createHostedApp(admin.headers, 'run-fail-audit')).json();
      await setBinding(admin.headers, id, {
        endpointUrl: `http://127.0.0.1:${providerPort}/fail`,
      });
      await publish(admin.headers, id);

      await app.inject({
        method: 'POST',
        url: '/v1/catalog/applications/run-fail-audit/run',
        headers: admin.headers,
        payload: { input: 'x' },
      });

      const rows = await client.sql`
        SELECT details::text AS details FROM control_plane.audit_events
        WHERE action = 'application.hosted_run' AND target_id = ${id}
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]?.details).toContain('failed');
    });
  });

  describe('quyền của runtime role trên bảng mới', () => {
    it('runtime KHÔNG có quyền tạo/sửa cấu trúc bảng binding', async () => {
      await expect(
        client.sql`
          SET ROLE talosmine_runtime;
          ALTER TABLE control_plane.application_hosted_bindings ADD COLUMN x text;
        `,
      ).rejects.toThrow();
      await client.sql`RESET ROLE`;
    });
  });
});
