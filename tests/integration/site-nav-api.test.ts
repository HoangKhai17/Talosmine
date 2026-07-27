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
 * Điều hướng site (`/v1/site/nav` + `/v1/admin/site/nav`).
 *
 * TRỌNG TÂM BỐN THỨ — mỗi thứ là một chỗ có thể hỏng lặng lẽ:
 *
 *   1. Đường CÔNG KHAI không cần phiên, và chỉ trả mục `active`.
 *   2. `content:manage` KHÔNG phát hành được — đó là `content:publish`.
 *   3. Sắp xếp lại chạy được nhờ unique DEFERRABLE. Đây là ca quan trọng nhất: nếu ai đó
 *      "dọn dẹp" migration bằng cách đổi sang `CREATE UNIQUE INDEX`, mọi thứ khác vẫn xanh
 *      và chỉ nút đổi thứ tự chết.
 *   4. Mục thiếu bản dịch bị BỎ QUA ở ngôn ngữ đó, không rơi về ngôn ngữ khác.
 */
describe('/v1/site/nav + /v1/admin/site/nav', () => {
  let container: StartedPostgreSqlContainer;
  let client: DatabaseClient;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await startPostgres();
    client = createDatabaseClient(container.getConnectionUri());
    await applyAllMigrations(client.sql);

    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.NODE_ENV = 'test'; // tắt ngoại lệ loopback của URL policy
    // `evil.com` CỐ Ý vắng mặt — đó là điểm của ca kiểm href ngoài.
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

  beforeEach(async () => {
    // `nav_menus` KHÔNG truncate: bốn vị trí menu là danh mục do migration seed, không phải
    // dữ liệu test tạo ra.
    await client.sql`TRUNCATE control_plane.nav_items CASCADE`;
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

  const FULL = ['content:read', 'content:manage', 'content:publish'];

  async function addItem(
    headers: Record<string, string>,
    labels: { vi?: string | null; en?: string | null },
    extra: Record<string, unknown> = {},
  ) {
    return app.inject({
      method: 'POST',
      url: '/v1/admin/site/nav',
      headers,
      payload: {
        menuKey: 'header.primary',
        href: '/tools',
        labels,
        reason: 'test',
        ...extra,
      },
    });
  }

  async function publish(headers: Record<string, string>, id: string) {
    return app.inject({
      method: 'POST',
      url: `/v1/admin/site/nav/${id}/status`,
      headers,
      payload: { status: 'active', reason: 'test' },
    });
  }

  /**
   * QUYỀN CỦA ROLE RUNTIME — nhóm test này tồn tại vì một bug thật.
   *
   * `ALTER DEFAULT PRIVILEGES` ở migration 0000 chỉ cấp SELECT + INSERT cho
   * `talosmine_runtime`. Bảng mới thừa hưởng đúng chừng đó, nên bản đầu của migration 0010
   * thiếu UPDATE/DELETE: mọi đường ghi vẫn XANH ở đây (testcontainers nối bằng superuser)
   * nhưng chết ở dev và production với `permission denied`.
   *
   * Vì thế phải kiểm quyền TƯỜNG MINH thay vì tin rằng "test ghi chạy được nghĩa là quyền
   * đúng" — kết nối của test không phải kết nối của ứng dụng.
   */
  describe('quyền của role runtime', () => {
    async function can(table: string, privilege: string): Promise<boolean> {
      const rows = await client.sql<{ ok: boolean }[]>`
        SELECT has_table_privilege(
          'talosmine_runtime',
          ${`control_plane.${table}`},
          ${privilege}
        ) AS ok
      `;
      return rows[0]?.ok === true;
    }

    /**
     * CHỈ kiểm UPDATE và DELETE, cố ý bỏ qua SELECT/INSERT.
     *
     * Lý do: ở container test, migration chạy bằng SUPERUSER, nên
     * `ALTER DEFAULT PRIVILEGES FOR ROLE talosmine_migration` (migration 0000) không áp dụng
     * — bảng không do `talosmine_migration` tạo ra. SELECT/INSERT vì thế luôn `false` ở đây
     * bất kể migration viết gì, và một assertion trên chúng sẽ đo môi trường test chứ không
     * đo migration.
     *
     * UPDATE/DELETE thì khác: chúng đến từ câu `GRANT` TƯỜNG MINH trong migration 0010, chạy
     * y hệt nhau ở mọi môi trường. Đó chính là dòng đã thiếu và gây `permission denied` ở dev.
     */
    it('có GRANT tường minh UPDATE/DELETE cho nav_items và nav_item_translations', async () => {
      for (const table of ['nav_items', 'nav_item_translations']) {
        for (const privilege of ['UPDATE', 'DELETE']) {
          expect(await can(table, privilege), `${table} cần ${privilege}`).toBe(true);
        }
      }
    });

    it('KHÔNG cấp UPDATE/DELETE trên nav_menus — bốn vị trí menu là danh mục cố định', async () => {
      for (const privilege of ['UPDATE', 'DELETE']) {
        expect(await can('nav_menus', privilege), `nav_menus KHÔNG được có ${privilege}`).toBe(
          false,
        );
      }
    });
  });

  describe('đường công khai', () => {
    it('KHÔNG cần phiên đăng nhập', async () => {
      // Header/footer render cho cả khách vãng lai. Bắt buộc phiên ở đây làm trang chủ
      // không dựng nổi menu.
      const res = await app.inject({ method: 'GET', url: '/v1/site/nav?locale=vi' });
      expect(res.statusCode).toBe(200);
    });

    it('trả đủ bốn menu kể cả khi rỗng', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/site/nav?locale=vi' });
      const body = res.json();

      expect(body.locale).toBe('vi');
      expect(body.menus.map((m: { key: string }) => m.key)).toEqual([
        'header.primary',
        'footer.explore',
        'footer.about',
        'footer.resources',
      ]);
    });

    it('TỪ CHỐI locale ngoài danh mục', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/site/nav?locale=fr' });
      expect(res.statusCode).toBe(400);
    });

    it('KHÔNG trả mục draft — người ngoài không dò được menu đang soạn', async () => {
      const admin = await createUser('pub-draft', FULL);
      await addItem(admin.headers, { vi: 'Công cụ' });

      const res = await app.inject({ method: 'GET', url: '/v1/site/nav?locale=vi' });
      const header = res.json().menus.find((m: { key: string }) => m.key === 'header.primary');
      expect(header.items).toEqual([]);
    });

    it('trả mục sau khi phát hành', async () => {
      const admin = await createUser('pub-active', FULL);
      const created = await addItem(admin.headers, { vi: 'Công cụ', en: 'Tools' });
      await publish(admin.headers, created.json().id);

      const res = await app.inject({ method: 'GET', url: '/v1/site/nav?locale=vi' });
      const header = res.json().menus.find((m: { key: string }) => m.key === 'header.primary');
      expect(header.items).toHaveLength(1);
      expect(header.items[0]).toMatchObject({ label: 'Công cụ', href: '/tools' });
    });

    /**
     * Mục chỉ có nhãn tiếng Việt KHÔNG được hiện ở trang tiếng Anh dưới bất kỳ dạng nào —
     * không fallback, không nhãn rỗng. Một mục tiếng Việt giữa header tiếng Anh trông như
     * lỗi hiển thị; thiếu hẳn một mục thì ít gây hiểu nhầm hơn.
     */
    it('BỎ QUA mục thiếu bản dịch, không rơi về ngôn ngữ khác', async () => {
      const admin = await createUser('pub-missing', FULL);
      const created = await addItem(admin.headers, { vi: 'Chỉ tiếng Việt' });
      await publish(admin.headers, created.json().id);

      const vi = await app.inject({ method: 'GET', url: '/v1/site/nav?locale=vi' });
      const en = await app.inject({ method: 'GET', url: '/v1/site/nav?locale=en' });

      const pick = (res: typeof vi) =>
        res.json().menus.find((m: { key: string }) => m.key === 'header.primary').items;

      expect(pick(vi)).toHaveLength(1);
      expect(pick(en)).toHaveLength(0);
    });
  });

  describe('phân quyền', () => {
    it('thiếu phiên → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/admin/site/nav' });
      expect(res.statusCode).toBe(401);
    });

    it('có phiên nhưng không có permission → 403', async () => {
      const user = await createUser('no-perm');
      const res = await app.inject({
        method: 'GET',
        url: '/v1/admin/site/nav',
        headers: user.headers,
      });
      expect(res.statusCode).toBe(403);
    });

    /**
     * CHỐT CHẶN QUAN TRỌNG NHẤT của nhóm này: sửa nội dung và phát hành là hai quyền khác
     * nhau. Gộp chúng nghĩa là ai sửa được nhãn cũng tự đưa được nội dung lên mọi trang.
     */
    it('`content:manage` KHÔNG phát hành được', async () => {
      const editor = await createUser('editor', ['content:read', 'content:manage']);
      const created = await addItem(editor.headers, { vi: 'Công cụ' });
      expect(created.statusCode).toBe(201);

      const res = await publish(editor.headers, created.json().id);
      expect(res.statusCode).toBe(403);
    });

    it('`content:publish` phát hành được', async () => {
      const publisher = await createUser('publisher', FULL);
      const created = await addItem(publisher.headers, { vi: 'Công cụ' });
      expect((await publish(publisher.headers, created.json().id)).statusCode).toBe(204);
    });
  });

  describe('kiểm href ở đường ghi', () => {
    it('TỪ CHỐI `//` — protocol-relative là URL ra ngoài', async () => {
      const admin = await createUser('href-pr', FULL);
      const res = await addItem(admin.headers, { vi: 'X' }, { href: '//evil.com' });
      expect(res.statusCode).toBe(400);
    });

    it('TỪ CHỐI host ngoài allowlist', async () => {
      const admin = await createUser('href-host', FULL);
      const res = await addItem(admin.headers, { vi: 'X' }, { href: 'https://evil.com/x' });
      expect(res.statusCode).toBe(400);
    });

    it('TỪ CHỐI scheme javascript', async () => {
      const admin = await createUser('href-js', FULL);
      const res = await addItem(admin.headers, { vi: 'X' }, { href: 'javascript:alert(1)' });
      expect(res.statusCode).toBe(400);
    });

    it('chấp nhận https trong allowlist và lưu dạng chuẩn hoá', async () => {
      const admin = await createUser('href-ok', FULL);
      const created = await addItem(
        admin.headers,
        { vi: 'X' },
        { href: 'HTTPS://App.Example.COM:443/x#frag' },
      );
      expect(created.statusCode).toBe(201);

      const list = await app.inject({
        method: 'GET',
        url: '/v1/admin/site/nav',
        headers: admin.headers,
      });
      expect(list.json()[0].href).toBe('https://app.example.com/x');
    });
  });

  describe('sắp xếp lại', () => {
    async function threeItems(headers: Record<string, string>) {
      const ids: string[] = [];
      for (const label of ['A', 'B', 'C']) {
        const res = await addItem(headers, { vi: label });
        ids.push(res.json().id);
      }
      return ids;
    }

    /**
     * CA QUAN TRỌNG NHẤT CỦA FILE.
     *
     * Đảo ngược ba mục nghĩa là ba câu UPDATE trong một transaction, và ở giữa chúng sẽ có
     * hai hàng cùng `sort_order`. Ràng buộc `nav_items_menu_sort_key` khai
     * `DEFERRABLE INITIALLY DEFERRED` ở migration 0010 nên phép kiểm dời tới lúc COMMIT.
     *
     * Nếu ai đó đổi nó thành `CREATE UNIQUE INDEX` cho "nhất quán với migration 0007", mọi
     * bài khác vẫn xanh và chỉ đúng bài này đỏ.
     */
    it('đảo ngược thứ tự trong một transaction (cần unique DEFERRABLE)', async () => {
      const admin = await createUser('reorder', FULL);
      const ids = await threeItems(admin.headers);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/site/nav/reorder',
        headers: admin.headers,
        payload: { menuKey: 'header.primary', itemIds: [...ids].reverse(), reason: 'test' },
      });
      expect(res.statusCode).toBe(204);

      const list = await app.inject({
        method: 'GET',
        url: '/v1/admin/site/nav',
        headers: admin.headers,
      });
      expect(list.json().map((i: { id: string }) => i.id)).toEqual([...ids].reverse());
    });

    it('TỪ CHỐI danh sách thiếu mục', async () => {
      const admin = await createUser('reorder-partial', FULL);
      const ids = await threeItems(admin.headers);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/site/nav/reorder',
        headers: admin.headers,
        payload: { menuKey: 'header.primary', itemIds: ids.slice(0, 2), reason: 'test' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('TỪ CHỐI id trùng lặp', async () => {
      const admin = await createUser('reorder-dup', FULL);
      const ids = await threeItems(admin.headers);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/site/nav/reorder',
        headers: admin.headers,
        payload: {
          menuKey: 'header.primary',
          itemIds: [ids[0], ids[0], ids[1]],
          reason: 'test',
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('vòng đời và audit', () => {
    it('mục mới luôn ở `draft`', async () => {
      const admin = await createUser('lifecycle-draft', FULL);
      const created = await addItem(admin.headers, { vi: 'X' });

      const list = await app.inject({
        method: 'GET',
        url: '/v1/admin/site/nav',
        headers: admin.headers,
      });
      expect(list.json().find((i: { id: string }) => i.id === created.json().id).status).toBe(
        'draft',
      );
    });

    it('KHÔNG quay lại `draft` được', async () => {
      const admin = await createUser('lifecycle-back', FULL);
      const created = await addItem(admin.headers, { vi: 'X' });
      await publish(admin.headers, created.json().id);

      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/site/nav/${created.json().id}/status`,
        headers: admin.headers,
        payload: { status: 'draft', reason: 'test' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('mọi mutation BẮT BUỘC kèm lý do', async () => {
      const admin = await createUser('audit-reason', FULL);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/site/nav',
        headers: admin.headers,
        payload: { menuKey: 'header.primary', href: '/x', labels: { vi: 'X' } },
      });
      expect(res.statusCode).toBe(400);
    });

    it('ghi audit kèm actor và lý do', async () => {
      const admin = await createUser('audit-write', FULL);
      const created = await addItem(admin.headers, { vi: 'X' }, { reason: 'lý do cụ thể' });

      const rows = await client.sql<{ action: string; reason: string; actor_account_id: string }[]>`
        SELECT action, reason, actor_account_id
        FROM control_plane.audit_events
        WHERE target_id = ${created.json().id}
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('nav_item.created');
      expect(rows[0]?.reason).toBe('lý do cụ thể');
      expect(rows[0]?.actor_account_id).toBe(admin.accountId);
    });

    it('xoá mục thì bản dịch đi theo (CASCADE)', async () => {
      const admin = await createUser('delete-cascade', FULL);
      const created = await addItem(admin.headers, { vi: 'X', en: 'X' });
      const id = created.json().id;

      const before = await client.sql`
        SELECT 1 FROM control_plane.nav_item_translations WHERE nav_item_id = ${id}
      `;
      expect(before).toHaveLength(2);

      const res = await app.inject({
        method: 'DELETE',
        url: `/v1/admin/site/nav/${id}`,
        headers: admin.headers,
        payload: { reason: 'test' },
      });
      expect(res.statusCode).toBe(204);

      const after = await client.sql`
        SELECT 1 FROM control_plane.nav_item_translations WHERE nav_item_id = ${id}
      `;
      expect(after).toHaveLength(0);
    });

    it('PATCH với nhãn rỗng thì XOÁ bản dịch đó', async () => {
      const admin = await createUser('patch-clear', FULL);
      const created = await addItem(admin.headers, { vi: 'X', en: 'X' });
      const id = created.json().id;

      await app.inject({
        method: 'PATCH',
        url: `/v1/admin/site/nav/${id}`,
        headers: admin.headers,
        payload: { labels: { en: null }, reason: 'gỡ bản tiếng Anh' },
      });

      const list = await app.inject({
        method: 'GET',
        url: '/v1/admin/site/nav',
        headers: admin.headers,
      });
      const item = list.json().find((i: { id: string }) => i.id === id);
      expect(item.labels.vi).toBe('X');
      expect(item.labels.en ?? null).toBeNull();
    });
  });
});
