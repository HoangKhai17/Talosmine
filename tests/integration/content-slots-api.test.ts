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
 * Khe nội dung (`/v1/site/content` + `/v1/admin/site/content`).
 *
 * TRỌNG TÂM BỐN THỨ — mỗi thứ là một chỗ hỏng lặng lẽ:
 *   1. Đường công khai KHÔNG cần phiên và chỉ trả khoá ĐÃ ĐẶT — "chưa đặt" là vắng mặt,
 *      không phải chuỗi rỗng (chuỗi rỗng sẽ đè mất chữ dự phòng của web).
 *   2. Xoá override = quay về mặc định: `null` và `''` phải cùng cho ra "không còn hàng".
 *   3. Khoá ngoài danh mục bị chặn bằng 400, không lặng lẽ ghi rác.
 *   4. Quyền runtime có UPDATE/DELETE tường minh — bug đã xảy ra ở migration 0010.
 */
describe('/v1/site/content + /v1/admin/site/content', () => {
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
    await client.sql`TRUNCATE control_plane.content_slots`;
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
      headers: {
        'x-session-token': session.sessionToken,
        'x-csrf-token': session.csrfToken,
      },
    };
  }

  function setSlot(headers: Record<string, string>, key: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url: `/v1/admin/site/content/${encodeURIComponent(key)}`,
      headers,
      payload: { reason: 'test', ...payload },
    });
  }

  async function publicValues(locale = 'vi'): Promise<Record<string, string>> {
    const res = await app.inject({ method: 'GET', url: `/v1/site/content?locale=${locale}` });
    expect(res.statusCode).toBe(200);
    return (res.json() as { values: Record<string, string> }).values;
  }

  describe('đường công khai', () => {
    it('không cần phiên, bảng rỗng trả map rỗng', async () => {
      expect(await publicValues()).toEqual({});
    });

    it('TỪ CHỐI locale ngoài danh mục', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/site/content?locale=fr' });
      expect(res.statusCode).toBe(400);
    });

    it('chỉ trả đúng ngôn ngữ được hỏi', async () => {
      const admin = await createUser('per-locale', ['content:manage']);
      await setSlot(admin.headers, 'home.heroTitle', {
        values: { vi: 'Tiêu đề mới', en: 'New title' },
      });

      expect(await publicValues('vi')).toEqual({ 'home.heroTitle': 'Tiêu đề mới' });
      expect(await publicValues('en')).toEqual({ 'home.heroTitle': 'New title' });
    });
  });

  describe('đặt và xoá giá trị', () => {
    it('đặt một ngôn ngữ KHÔNG đụng ngôn ngữ kia', async () => {
      const admin = await createUser('one-locale', ['content:manage']);
      await setSlot(admin.headers, 'home.heroTitle', { values: { vi: 'Bản Việt', en: 'Old' } });
      await setSlot(admin.headers, 'home.heroTitle', { values: { vi: 'Bản Việt mới' } });

      expect(await publicValues('vi')).toEqual({ 'home.heroTitle': 'Bản Việt mới' });
      expect(await publicValues('en')).toEqual({ 'home.heroTitle': 'Old' });
    });

    /**
     * "Chưa đặt" phải là VẮNG MẶT. Nếu xoá mà để lại hàng rỗng thì web sẽ merge chuỗi rỗng
     * đè lên chữ dự phòng — ra một khoảng trắng trên production không ai truy được nguồn.
     */
    it('`null` VÀ chuỗi rỗng đều xoá hàng — không tồn tại hàng rỗng', async () => {
      const admin = await createUser('clearing', ['content:manage']);
      await setSlot(admin.headers, 'home.heroTitle', { values: { vi: 'Sắp xoá', en: 'Sắp xoá' } });

      expect(
        (await setSlot(admin.headers, 'home.heroTitle', { values: { vi: null } })).statusCode,
      ).toBe(204);
      expect(
        (await setSlot(admin.headers, 'home.heroTitle', { values: { en: '   ' } })).statusCode,
      ).toBe(204);

      expect(await publicValues('vi')).toEqual({});
      expect(await publicValues('en')).toEqual({});
      const rows = await client.sql`SELECT 1 FROM control_plane.content_slots`;
      expect(rows).toHaveLength(0);
    });

    it('TỪ CHỐI khoá ngoài danh mục — không ghi rác', async () => {
      const admin = await createUser('bad-key', ['content:manage']);
      const res = await setSlot(admin.headers, 'home.khongCoThat', { values: { vi: 'x' } });
      expect(res.statusCode).toBe(400);
    });

    it('TỪ CHỐI `values` rỗng — PATCH không đổi gì là lệnh vô nghĩa', async () => {
      const admin = await createUser('empty-values', ['content:manage']);
      expect((await setSlot(admin.headers, 'home.heroTitle', { values: {} })).statusCode).toBe(400);
    });

    it('thiếu `reason` → 400', async () => {
      const admin = await createUser('no-reason', ['content:manage']);
      const res = await app.inject({
        method: 'PATCH',
        url: '/v1/admin/site/content/home.heroTitle',
        headers: admin.headers,
        payload: { values: { vi: 'x' } },
      });
      expect(res.statusCode).toBe(400);
    });

    it('mọi thay đổi để lại dấu vết audit kèm lý do', async () => {
      const admin = await createUser('auditor', ['content:manage']);
      await setSlot(admin.headers, 'footer.tagline', {
        values: { vi: 'Câu mới' },
        reason: 'đổi câu giới thiệu theo yêu cầu marketing',
      });

      const rows = await client.sql<{ action: string; reason: string; target_key: string }[]>`
        SELECT action, reason, target_key FROM control_plane.audit_events
        WHERE target_type = 'content_slot'
      `;
      expect(rows[0]?.action).toBe('content_slot.updated');
      expect(rows[0]?.target_key).toBe('footer.tagline');
      expect(rows[0]?.reason).toBe('đổi câu giới thiệu theo yêu cầu marketing');
    });
  });

  describe('phân quyền', () => {
    it('đường quản trị cần phiên', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/admin/site/content' });
      expect(res.statusCode).toBe(401);
    });

    it('`content:read` xem được nhưng KHÔNG sửa được', async () => {
      const reader = await createUser('reader', ['content:read']);

      const list = await app.inject({
        method: 'GET',
        url: '/v1/admin/site/content',
        headers: reader.headers,
      });
      expect(list.statusCode).toBe(200);

      expect(
        (await setSlot(reader.headers, 'home.heroTitle', { values: { vi: 'x' } })).statusCode,
      ).toBe(403);
    });

    it('view quản trị trả hai ngôn ngữ cạnh nhau', async () => {
      const admin = await createUser('both', ['content:read', 'content:manage']);
      await setSlot(admin.headers, 'newsletter.title', {
        values: { vi: 'Bản tin', en: 'Updates' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/site/content',
        headers: admin.headers,
      });
      const slots = res.json() as { key: string; values: { vi?: string; en?: string } }[];

      expect(slots).toHaveLength(1);
      expect(slots[0]?.key).toBe('newsletter.title');
      expect(slots[0]?.values).toEqual({ vi: 'Bản tin', en: 'Updates' });
    });
  });

  /**
   * Quyền của role runtime — chỉ kiểm GRANT tường minh (UPDATE/DELETE): ở container test
   * migration chạy bằng superuser nên default privileges không áp dụng. Xem
   * `docs/coding-conventions.md` mục 6.
   */
  it('role runtime có UPDATE và DELETE tường minh trên content_slots', async () => {
    for (const privilege of ['UPDATE', 'DELETE']) {
      const rows = await client.sql<{ ok: boolean }[]>`
        SELECT has_table_privilege('talosmine_runtime', 'control_plane.content_slots', ${privilege}) AS ok
      `;
      expect(rows[0]?.ok, `cần ${privilege}`).toBe(true);
    }
  });
});
