import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../../apps/control-plane/src/shared/database';
import { applyAllMigrations, startPostgres } from '../support/postgres';

/**
 * Schema Catalog (P3) — migration 0007 và 0008.
 *
 * Chạy trên PostgreSQL THẬT (DEC-T05) vì thứ cần chứng minh là hành vi của engine:
 * composite FK, CHECK constraint, và việc trigger append-only của P2 SỐNG SÓT qua đợt
 * nâng cấp schema của P3.
 *
 * Điều cuối là yêu cầu tường minh của phase-2 §17 — trước đây chỉ "mô phỏng" được, giờ
 * kiểm bằng chính migration thật.
 */
describe('schema catalog', () => {
  let container: StartedPostgreSqlContainer;
  let client: DatabaseClient;
  let sql: DatabaseClient['sql'];

  const APP_A = '00000000-0000-0000-0000-00000000aaa1';
  const APP_B = '00000000-0000-0000-0000-00000000bbb1';
  const FEAT_A = '00000000-0000-0000-0000-00000000fff1';

  beforeAll(async () => {
    container = await startPostgres();
    client = createDatabaseClient(container.getConnectionUri());
    sql = client.sql;
    await applyAllMigrations(sql);
  }, 120_000);

  afterAll(async () => {
    await client?.sql.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await sql`TRUNCATE control_plane.applications CASCADE`;

    await sql`
      INSERT INTO control_plane.applications (id, key, display_name, launch_url, status)
      VALUES (${APP_A}, 'app-a', 'App A', 'https://a.example.com', 'draft'),
             (${APP_B}, 'app-b', 'App B', 'https://b.example.com', 'draft')
    `;
    await sql`
      INSERT INTO control_plane.features (id, application_id, key, display_name, status)
      VALUES (${FEAT_A}, ${APP_A}, 'feat-a', 'Feature A', 'draft')
    `;
  });

  /** Chạy SQL và trả về tên constraint bị vi phạm, hoặc null nếu thành công. */
  async function violates(run: () => Promise<unknown>): Promise<string | null> {
    try {
      await run();
      return null;
    } catch (error) {
      const constraint = (error as { constraint_name?: string }).constraint_name;
      return constraint ?? (error as Error).message;
    }
  }

  describe('applications', () => {
    it('chặn status ngoài danh mục', async () => {
      const constraint = await violates(
        () => sql`
          INSERT INTO control_plane.applications (id, key, display_name, launch_url, status)
          VALUES (gen_random_uuid(), 'x', 'X', 'https://x.example', 'bogus')
        `,
      );
      expect(constraint).toBe('applications_status_check');
    });

    it('chặn key trùng — key không tái sử dụng được', async () => {
      const constraint = await violates(
        () => sql`
          INSERT INTO control_plane.applications (id, key, display_name, launch_url, status)
          VALUES (gen_random_uuid(), 'app-a', 'Trùng', 'https://y.example', 'draft')
        `,
      );
      expect(constraint).toBe('applications_key_key');
    });

    it('image_url: NULL hợp lệ, chuỗi rỗng KHÔNG', async () => {
      // NULL = chưa có ảnh. Chuỗi rỗng sẽ tạo ra cách biểu diễn thứ hai cho cùng ý nghĩa.
      const nullOk = await violates(
        () => sql`
          INSERT INTO control_plane.applications (id, key, display_name, launch_url, status, image_url)
          VALUES (gen_random_uuid(), 'no-img', 'No Image', 'https://n.example', 'draft', NULL)
        `,
      );
      expect(nullOk).toBeNull();

      const emptyRejected = await violates(
        () => sql`
          INSERT INTO control_plane.applications (id, key, display_name, launch_url, status, image_url)
          VALUES (gen_random_uuid(), 'empty-img', 'Empty', 'https://e.example', 'draft', '')
        `,
      );
      expect(emptyRejected).toBe('applications_image_url_check');
    });

    it('KHÔNG kiểm scheme URL ở tầng DB — đó là việc của application layer', async () => {
      // Ghi lại chủ đích: `http://` và cả chuỗi vô nghĩa đều lọt qua DB. Việc bắt buộc
      // HTTPS, allowlist host và chống SSRF cần DNS resolution + danh sách cấu hình, hai
      // thứ CHECK constraint không làm được (modular.md mục 5.4).
      const constraint = await violates(
        () => sql`
          INSERT INTO control_plane.applications (id, key, display_name, launch_url, status)
          VALUES (gen_random_uuid(), 'insecure', 'Insecure', 'http://127.0.0.1/admin', 'draft')
        `,
      );
      expect(constraint).toBeNull();
    });
  });

  describe('application_redirect_uris', () => {
    it('chặn purpose ngoài login/logout', async () => {
      const constraint = await violates(
        () => sql`
          INSERT INTO control_plane.application_redirect_uris (id, application_id, purpose, uri)
          VALUES (gen_random_uuid(), ${APP_A}, 'any', 'https://a.example/cb')
        `,
      );
      expect(constraint).toBe('application_redirect_uris_purpose_check');
    });

    it('chặn trùng (application, purpose, uri)', async () => {
      const values = sql`
        INSERT INTO control_plane.application_redirect_uris (id, application_id, purpose, uri)
        VALUES (gen_random_uuid(), ${APP_A}, 'login', 'https://a.example/cb')
      `;
      expect(await violates(() => values)).toBeNull();

      const duplicate = await violates(
        () => sql`
          INSERT INTO control_plane.application_redirect_uris (id, application_id, purpose, uri)
          VALUES (gen_random_uuid(), ${APP_A}, 'login', 'https://a.example/cb')
        `,
      );
      expect(duplicate).toBe('application_redirect_uris_exact_key');
    });
  });

  describe('usage_metrics — composite FK', () => {
    it('CHẶN metric trỏ tới feature của application KHÁC', async () => {
      // Đây là ràng buộc quan trọng nhất của migration 0007.
      //
      // Với FK đơn `feature_id -> features(id)`, dòng dưới sẽ được chấp nhận. Lúc tính
      // quota, hệ thống đếm lượt dùng của app B vào hạn mức của app A — sai lệch tiền bạc
      // mà không có lỗi nào xuất hiện ở đâu.
      const constraint = await violates(
        () => sql`
          INSERT INTO control_plane.usage_metrics
            (id, application_id, feature_id, key, display_name, unit, status)
          VALUES (gen_random_uuid(), ${APP_B}, ${FEAT_A}, 'm', 'M', 'lần', 'draft')
        `,
      );
      expect(constraint).toBe('usage_metrics_feature_application_fk');
    });

    it('chấp nhận metric cùng application với feature', async () => {
      const constraint = await violates(
        () => sql`
          INSERT INTO control_plane.usage_metrics
            (id, application_id, feature_id, key, display_name, unit, status)
          VALUES (gen_random_uuid(), ${APP_A}, ${FEAT_A}, 'm', 'M', 'lần', 'draft')
        `,
      );
      expect(constraint).toBeNull();
    });

    it('counting_point và failure_treatment để NULL được — chờ quyết định P5', async () => {
      const rows = await sql`
        INSERT INTO control_plane.usage_metrics
          (id, application_id, feature_id, key, display_name, unit, status)
        VALUES (gen_random_uuid(), ${APP_A}, ${FEAT_A}, 'pending', 'Pending', 'lần', 'draft')
        RETURNING counting_point, failure_treatment
      `;
      expect(rows[0]?.counting_point).toBeNull();
      expect(rows[0]?.failure_treatment).toBeNull();
    });

    it('nhưng giá trị ngoài danh mục thì bị chặn', async () => {
      const constraint = await violates(
        () => sql`
          INSERT INTO control_plane.usage_metrics
            (id, application_id, feature_id, key, display_name, unit, status, counting_point)
          VALUES (gen_random_uuid(), ${APP_A}, ${FEAT_A}, 'bad', 'Bad', 'lần', 'draft', 'bogus')
        `,
      );
      expect(constraint).toBe('usage_metrics_counting_point_check');
    });
  });

  describe('service_identities', () => {
    it('KHÔNG có cột nào cho secret hay token', async () => {
      // Ràng buộc thiết kế, kiểm bằng cách soi schema: nếu ai đó thêm cột secret ở
      // migration sau, test này đỏ ngay.
      const columns = await sql<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'control_plane' AND table_name = 'service_identities'
      `;
      const names = columns.map((c) => c.column_name).join(' ');
      for (const forbidden of ['secret', 'token', 'password']) {
        expect(names).not.toContain(forbidden);
      }
    });

    it('trạng thái revoked bắt buộc có thời điểm và lý do', async () => {
      const constraint = await violates(
        () => sql`
          INSERT INTO control_plane.service_identities
            (id, application_id, issuer, client_id, display_name, status, revoked_at)
          VALUES (gen_random_uuid(), ${APP_A}, 'https://idp.example', 'cid', 'SI', 'revoked', now())
        `,
      );
      expect(constraint).toBe('service_identities_revocation_check');
    });

    it('trạng thái active KHÔNG được có dữ liệu thu hồi', async () => {
      const constraint = await violates(
        () => sql`
          INSERT INTO control_plane.service_identities
            (id, application_id, issuer, client_id, display_name, status, revoked_at, revocation_reason)
          VALUES (gen_random_uuid(), ${APP_A}, 'https://idp.example', 'cid2', 'SI', 'active', now(), 'lý do')
        `,
      );
      expect(constraint).toBe('service_identities_revocation_check');
    });
  });

  describe('audit — nâng cấp actor của P3', () => {
    it('service actor phải trỏ tới service identity CÓ THẬT', async () => {
      const constraint = await violates(
        () => sql`
          INSERT INTO control_plane.audit_events
            (id, operation_id, sequence, actor_type, actor_service_identity_id, action, target_type)
          VALUES (gen_random_uuid(), gen_random_uuid(), 0, 'service', gen_random_uuid(), 'x.y', 'application')
        `,
      );
      expect(constraint).toBe('audit_events_actor_service_identity_fk');
    });

    it('service actor hợp lệ được chấp nhận — P2 từng chặn tuyệt đối', async () => {
      const serviceId = crypto.randomUUID();
      await sql`
        INSERT INTO control_plane.service_identities
          (id, application_id, issuer, client_id, display_name, status)
        VALUES (${serviceId}, ${APP_A}, 'https://idp.example', 'cid-ok', 'SI', 'active')
      `;

      const constraint = await violates(
        () => sql`
          INSERT INTO control_plane.audit_events
            (id, operation_id, sequence, actor_type, actor_service_identity_id, action, target_type)
          VALUES (gen_random_uuid(), gen_random_uuid(), 0, 'service', ${serviceId}, 'app.launched', 'application')
        `,
      );
      expect(constraint).toBeNull();
    });

    it('actor_type phải khớp đúng cột định danh của nó', async () => {
      // `service` mà lại điền account id là trạng thái vô nghĩa — audit sẽ nói dối về
      // việc ai đã hành động.
      const constraint = await violates(
        () => sql`
          INSERT INTO control_plane.audit_events
            (id, operation_id, sequence, actor_type, actor_account_id, action, target_type)
          VALUES (gen_random_uuid(), gen_random_uuid(), 0, 'service', gen_random_uuid(), 'x.y', 'application')
        `,
      );
      expect(constraint).toBe('audit_events_actor_check');
    });

    it('APPEND-ONLY VẪN CÒN sau khi P3 đổi FK và CHECK', async () => {
      // Yêu cầu tường minh của phase-2 §17. Trước đây chỉ mô phỏng được; giờ đây là
      // migration P3 thật đã chạy.
      await sql`
        INSERT INTO control_plane.audit_events
          (id, operation_id, sequence, actor_type, action, target_type)
        VALUES (gen_random_uuid(), gen_random_uuid(), 0, 'system', 'test.event', 'application')
      `;

      const updateBlocked = await violates(
        () => sql`UPDATE control_plane.audit_events SET reason = 'sửa trộm'`,
      );
      expect(updateBlocked).toContain('append-only');

      const deleteBlocked = await violates(() => sql`DELETE FROM control_plane.audit_events`);
      expect(deleteBlocked).toContain('append-only');
    });
  });
});
