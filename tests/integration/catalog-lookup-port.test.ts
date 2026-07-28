import 'reflect-metadata';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CatalogLookupService } from '../../apps/control-plane/src/modules/application-catalog/catalog-lookup.service';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../../apps/control-plane/src/shared/database';
import { resetEnvCache } from '../../apps/control-plane/src/shared/env';
import { applyAllMigrations, startPostgres } from '../support/postgres';

/**
 * `CatalogLookupPort` — cổng tra cứu mà P4 sẽ dùng thay vì đọc thẳng bảng của Catalog.
 *
 * TRỌNG TÂM: **cách ly giữa các ứng dụng**. `key` của feature và metric chỉ duy nhất TRONG
 * một ứng dụng — hai ứng dụng khác nhau được phép trùng key. Nếu cổng này tra sai phạm vi,
 * P4 sẽ gán quyền của app A lên feature của app B mà không ai nhận ra: cả hai đều tồn tại,
 * cả hai đều trả về dữ liệu trông hợp lệ.
 *
 * Vì vậy mỗi phép tra ở đây đều được thử với một cặp key TRÙNG NHAU ở hai app khác nhau.
 *
 * Test dựng service TRỰC TIẾP, không qua Nest: cổng này không có guard, không có
 * controller, không có audit. Bọc thêm một app Nest chỉ làm chậm và che mất thứ đang kiểm.
 */
describe('CatalogLookupPort', () => {
  let container: StartedPostgreSqlContainer;
  let client: DatabaseClient;
  let lookup: CatalogLookupService;

  let appA: string;
  let appB: string;

  beforeAll(async () => {
    container = await startPostgres();
    client = createDatabaseClient(container.getConnectionUri());
    await applyAllMigrations(client.sql);

    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.NODE_ENV = 'test';
    // Cần cho `isAllowedRedirectUri`: URI phải qua chính sách trước khi đem đi so khớp.
    process.env.CATALOG_ALLOWED_HOSTS = 'a.example.com,b.example.com';
    resetEnvCache();

    lookup = new CatalogLookupService(client);
  }, 120_000);

  afterAll(async () => {
    await client?.sql.end();
    await container?.stop();
    resetEnvCache();
  });

  /**
   * Dựng hai ứng dụng có feature và metric TRÙNG KEY.
   *
   * Trùng key là hợp lệ theo thiết kế (unique trong phạm vi app), và cũng chính là tình
   * huống làm lộ ra một phép tra thiếu ràng buộc phạm vi.
   */
  beforeEach(async () => {
    await client.sql`TRUNCATE control_plane.applications CASCADE`;

    appA = await seedApplication('app-a', 'a.example.com');
    appB = await seedApplication('app-b', 'b.example.com');
  });

  async function seedApplication(key: string, host: string): Promise<string> {
    const [app] = await client.sql<{ id: string }[]>`
      INSERT INTO control_plane.applications (id, key, display_name, launch_url, status)
      VALUES (gen_random_uuid(), ${key}, ${key}, ${`https://${host}/`}, 'active')
      RETURNING id
    `;
    const applicationId = app?.id as string;

    // `key` trùng nhau ở cả hai app — xem ghi chú của `beforeEach`.
    const [feature] = await client.sql<{ id: string }[]>`
      INSERT INTO control_plane.features (id, application_id, key, display_name, status)
      VALUES (gen_random_uuid(), ${applicationId}, 'bao-cao', 'Báo cáo', 'draft')
      RETURNING id
    `;
    const featureId = feature?.id as string;

    // `unit` ở đây là fixture của test trong container tạm, KHÔNG phải seed dữ liệu sản
    // phẩm — DEC-B05 chặn việc tạo metric thật khi đơn vị chưa được duyệt, không chặn test
    // tự dựng dữ liệu của mình.
    await client.sql`
      INSERT INTO control_plane.usage_metrics
        (id, application_id, feature_id, key, display_name, unit, status)
      VALUES (
        gen_random_uuid(), ${applicationId}, ${featureId}, 'so-luot', 'Số lượt',
        'test-unit', 'draft'
      )
    `;

    await client.sql`
      INSERT INTO control_plane.application_redirect_uris (id, application_id, purpose, uri)
      VALUES (
        gen_random_uuid(), ${applicationId}, 'login', ${`https://${host}/auth/callback`}
      )
    `;

    return applicationId;
  }

  describe('tra ứng dụng', () => {
    it('tìm được theo key', async () => {
      const result = await lookup.findApplicationByKey('app-a');
      expect(result?.id).toBe(appA);
      expect(result?.status).toBe('active');
    });

    it('key không tồn tại trả null, không ném lỗi', async () => {
      expect(await lookup.findApplicationByKey('khong-co')).toBeNull();
    });

    it('chuẩn hoá key: hoa/thường và khoảng trắng thừa vẫn tra ra', async () => {
      // Người gọi không nên phải nhớ luật viết thường của Catalog.
      expect((await lookup.findApplicationByKey('  APP-A '))?.id).toBe(appA);
    });

    it('TRẢ VỀ CẢ app chưa phát hành, kèm status', async () => {
      // Cổng không tự lọc: gán quyền cho một app còn `draft` là hợp lệ (chuẩn bị gói trước
      // khi phát hành). Người gọi đọc `status` rồi tự quyết định.
      await client.sql`UPDATE control_plane.applications SET status = 'draft' WHERE id = ${appA}`;

      const result = await lookup.findApplicationByKey('app-a');
      expect(result).not.toBeNull();
      expect(result?.status).toBe('draft');
    });
  });

  describe('tra feature', () => {
    it('tìm được theo cặp (app, feature) và kèm ứng dụng sở hữu', async () => {
      const result = await lookup.findFeature('app-a', 'bao-cao');
      expect(result?.applicationId).toBe(appA);
      expect(result?.applicationKey).toBe('app-a');
    });

    it('CÙNG key feature ở hai app trả về HAI feature khác nhau', async () => {
      // Đây là phép kiểm cách ly quan trọng nhất của cả file. Nếu truy vấn thiếu ràng buộc
      // theo app, hai lời gọi này sẽ trả về cùng một dòng.
      const a = await lookup.findFeature('app-a', 'bao-cao');
      const b = await lookup.findFeature('app-b', 'bao-cao');

      expect(a?.id).toBeDefined();
      expect(b?.id).toBeDefined();
      expect(a?.id).not.toBe(b?.id);
      expect(a?.applicationId).toBe(appA);
      expect(b?.applicationId).toBe(appB);
    });

    it('app không tồn tại trả null dù feature key có thật', async () => {
      expect(await lookup.findFeature('app-khong-co', 'bao-cao')).toBeNull();
    });
  });

  describe('tra chỉ số sử dụng', () => {
    it('tìm được và trả về đơn vị', async () => {
      const result = await lookup.findUsageMetric('app-a', 'so-luot');
      expect(result?.applicationId).toBe(appA);
      expect(result?.unit).toBe('test-unit');
    });

    it('CÙNG key metric ở hai app trả về hai metric khác nhau', async () => {
      const a = await lookup.findUsageMetric('app-a', 'so-luot');
      const b = await lookup.findUsageMetric('app-b', 'so-luot');
      expect(a?.id).not.toBe(b?.id);
    });
  });

  describe('kiểm quyền sở hữu feature', () => {
    it('feature của app A thuộc app A', async () => {
      const feature = await lookup.findFeature('app-a', 'bao-cao');
      expect(await lookup.featureBelongsToApplication(feature?.id as string, appA)).toBe(true);
    });

    it('feature của app A KHÔNG thuộc app B', async () => {
      // Nếu phép này trả `true`, P4 sẽ gắn được entitlement của app B lên feature app A.
      const feature = await lookup.findFeature('app-a', 'bao-cao');
      expect(await lookup.featureBelongsToApplication(feature?.id as string, appB)).toBe(false);
    });
  });

  describe('so khớp allowlist redirect', () => {
    it('URI đúng y nguyên thì khớp', async () => {
      expect(
        await lookup.isAllowedRedirectUri('app-a', 'login', 'https://a.example.com/auth/callback'),
      ).toBe(true);
    });

    it('CHUẨN HOÁ TRƯỚC KHI SO — cổng mặc định 443 và fragment không làm trượt', async () => {
      // Nếu bỏ bước chuẩn hoá, chuỗi này khác từng ký tự với chuỗi trong bảng dù trỏ CÙNG
      // một nơi. Trượt ở đây sẽ khiến ai đó "sửa" bằng cách nới lỏng phép so — và đó là lúc
      // lỗ hổng ra đời.
      expect(
        await lookup.isAllowedRedirectUri(
          'app-a',
          'login',
          'HTTPS://A.Example.com:443/auth/callback#x',
        ),
      ).toBe(true);
    });

    it('sai purpose thì không khớp', async () => {
      expect(
        await lookup.isAllowedRedirectUri('app-a', 'logout', 'https://a.example.com/auth/callback'),
      ).toBe(false);
    });

    it('URI của app KHÁC không khớp', async () => {
      expect(
        await lookup.isAllowedRedirectUri('app-a', 'login', 'https://b.example.com/auth/callback'),
      ).toBe(false);
    });

    it('sai đường dẫn dù cùng host thì không khớp — không có so khớp theo tiền tố', async () => {
      expect(
        await lookup.isAllowedRedirectUri(
          'app-a',
          'login',
          'https://a.example.com/auth/callback/evil',
        ),
      ).toBe(false);
    });

    it('URI rác trả false chứ không ném lỗi', async () => {
      expect(await lookup.isAllowedRedirectUri('app-a', 'login', 'khong-phai-url')).toBe(false);
    });

    it('URI không đạt chính sách (host ngoài allowlist) trả false', async () => {
      expect(await lookup.isAllowedRedirectUri('app-a', 'login', 'https://evil.com/cb')).toBe(
        false,
      );
    });
  });
});
