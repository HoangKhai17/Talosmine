import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyAllMigrations,
  applyRollbackFile,
  applyRollbackToP2,
  connect,
  type Sql,
  startPostgres,
} from '../support/postgres';

/**
 * Diễn tập rollback P3 — yêu cầu bắt buộc của exit gate (phase-3 §8, §17).
 *
 * VÌ SAO CẦN BÀI NÀY: file rollback là loại code không ai chạy cho tới lúc hoảng loạn. Viết
 * xong rồi để đó thì nó mục nát lặng lẽ — một cột thêm vào ở migration sau, một khoá ngoại
 * mới, và bài gỡ không còn chạy được nữa. Không ai biết cho tới đêm sự cố.
 *
 * Bài này dựng schema ĐẦY ĐỦ trên PostgreSQL thật, gỡ ngược lại, rồi kiểm chứng schema quay
 * đúng về trạng thái cuối P2. Chạy mỗi lần CI chạy.
 *
 * TRỌNG TÂM KHÔNG PHẢI "bảng đã biến mất". Trọng tâm là **ràng buộc actor của audit đã quay
 * về dạng P2** — vì đó là chỗ duy nhất mà rollback chạm vào một bảng có dữ liệu lịch sử.
 * Bỏ sót bước đó sẽ để lại một `audit_events` cho phép `actor_type = 'service'` trong khi
 * bảng `service_identities` không còn tồn tại: một khoảng trống ghi được dữ liệu vô nghĩa.
 */
describe('diễn tập rollback về trạng thái cuối P2', () => {
  let container: StartedPostgreSqlContainer;
  let sql: Sql;

  beforeAll(async () => {
    container = await startPostgres();
    sql = connect(container);
    await applyAllMigrations(sql);
  }, 120_000);

  afterAll(async () => {
    await sql?.end();
    await container?.stop();
  });

  async function tableExists(name: string): Promise<boolean> {
    const rows = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'control_plane' AND table_name = ${name}
      ) AS exists
    `;
    return rows[0]?.exists === true;
  }

  async function constraintSource(name: string): Promise<string | null> {
    const rows = await sql<{ src: string }[]>`
      SELECT pg_get_constraintdef(oid) AS src
      FROM pg_constraint
      WHERE conname = ${name}
    `;
    return rows[0]?.src ?? null;
  }

  it('trước khi gỡ: schema đang ở trạng thái đầy đủ nhất', async () => {
    // Chốt điểm xuất phát. Không có bước này thì một bài "rollback thành công" có thể chỉ
    // đang chứng minh rằng những bảng đó chưa từng được tạo.
    for (const table of [
      'applications',
      'application_redirect_uris',
      // Migration 0017 — ứng dụng `hosted` (DEC-B17). Có mặt ở đây để bài diễn tập không
      // lặng lẽ bỏ qua file `.down.sql` mới nhất.
      'application_hosted_bindings',
      'features',
      'usage_metrics',
      'service_identities',
      'site_settings',
      'site_assets',
      'survey_answers',
      'survey_option_translations',
      'survey_options',
      'survey_question_translations',
      'survey_questions',
      'survey_responses',
      'content_slots',
      'nav_menus',
      'nav_items',
      'nav_item_translations',
    ]) {
      expect(await tableExists(table), `bảng ${table} phải tồn tại sau khi migrate`).toBe(true);
    }

    const kindBefore = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'control_plane' AND table_name = 'applications' AND column_name = 'kind'
    `;
    expect(kindBefore[0]?.n, 'cột `kind` của migration 0017 phải có mặt').toBe(1);

    const actorCheck = await constraintSource('audit_events_actor_check');
    expect(actorCheck).toContain('service');
  });

  it('gỡ được toàn bộ theo thứ tự ngược mà không lỗi', async () => {
    // Nếu thứ tự sai, PostgreSQL sẽ từ chối ngay tại `DROP TABLE` đầu tiên còn khoá ngoại
    // trỏ tới. Bài này pass nghĩa là thứ tự trong `applyRollbackToP2` đúng.
    const statements = await applyRollbackToP2(sql);
    expect(statements).toBeGreaterThan(0);
  });

  it('bảng của catalog, service identity và site content đã biến mất', async () => {
    for (const table of [
      'applications',
      'application_redirect_uris',
      'application_hosted_bindings',
      'features',
      'usage_metrics',
      'service_identities',
      'site_settings',
      'site_assets',
      'survey_answers',
      'survey_option_translations',
      'survey_options',
      'survey_question_translations',
      'survey_questions',
      'survey_responses',
      'content_slots',
      'nav_menus',
      'nav_items',
      'nav_item_translations',
    ]) {
      expect(await tableExists(table), `bảng ${table} phải bị gỡ`).toBe(false);
    }
  });

  it('bảng của P2 còn nguyên — rollback KHÔNG chạm vào chúng', async () => {
    for (const table of [
      'accounts',
      'external_identities',
      'web_sessions',
      'audit_events',
      'admin_roles',
      'admin_role_permissions',
      'admin_role_assignments',
    ]) {
      expect(await tableExists(table), `bảng ${table} của P2 phải còn`).toBe(true);
    }
  });

  /**
   * PHÉP KIỂM QUAN TRỌNG NHẤT CỦA CẢ FILE.
   *
   * Sau khi gỡ, ràng buộc actor phải quay về dạng P2: khoá cứng
   * `actor_service_identity_id IS NULL`. Nếu nó vẫn còn nhánh `service`, database sẽ chấp
   * nhận một loại actor mà bảng đích của nó không còn tồn tại.
   */
  it('ràng buộc actor của audit đã quay về dạng P2 (chỉ account và system)', async () => {
    const src = await constraintSource('audit_events_actor_check');
    expect(src).not.toBeNull();
    expect(src).toContain('actor_service_identity_id IS NULL');
    expect(src).not.toContain("'service'");
  });

  it('khoá ngoại service của audit đã bị gỡ', async () => {
    const src = await constraintSource('audit_events_actor_service_identity_fk');
    expect(src).toBeNull();
  });

  it('audit vẫn KHÔNG ghi được với actor service', async () => {
    // Đọc ràng buộc là một chuyện; chứng minh nó chặn thật là chuyện khác. Bài này ghi thử
    // một dòng và đòi database từ chối.
    await expect(
      sql`
        INSERT INTO control_plane.audit_events
          (id, operation_id, sequence, action, actor_type, actor_service_identity_id, target_type)
        VALUES (
          gen_random_uuid(), gen_random_uuid(), 1,
          'test.rollback', 'service', gen_random_uuid(), 'test'
        )
      `,
    ).rejects.toThrow();
  });

  it('audit vẫn ghi được với actor system — rollback không làm hỏng đường đang dùng', async () => {
    await sql`
      INSERT INTO control_plane.audit_events
        (id, operation_id, sequence, action, actor_type, target_type)
      VALUES (gen_random_uuid(), gen_random_uuid(), 1, 'test.rollback.system', 'system', 'test')
    `;

    const rows = await sql<{ count: string }[]>`
      SELECT count(*) AS count FROM control_plane.audit_events
      WHERE action = 'test.rollback.system'
    `;
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it('trigger append-only của audit vẫn còn — rollback không được đụng vào nó', async () => {
    // Tên trigger là `audit_events_append_only`, KHÔNG có hậu tố `_trg` — phase-3 §15 gọi
    // nhầm tên. Đây là tên thật trong migration 0004.
    const rows = await sql<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger
      WHERE tgname = 'audit_events_append_only' AND NOT tgisinternal
    `;
    expect(rows).toHaveLength(1);

    // Và nó vẫn chặn thật, không chỉ tồn tại trên giấy.
    await expect(
      sql`UPDATE control_plane.audit_events SET action = 'sua-trom' WHERE action = 'test.rollback.system'`,
    ).rejects.toThrow();
  });

  it('permission catalog đã bị thu hồi khỏi ràng buộc', async () => {
    const src = await constraintSource('admin_role_permissions_permission_check');
    expect(src).not.toBeNull();
    expect(src).not.toContain('catalog:read');
    expect(src).toContain('audit:read');
  });

  it('không còn dòng permission catalog nào sót lại', async () => {
    const rows = await sql<{ count: string }[]>`
      SELECT count(*) AS count FROM control_plane.admin_role_permissions
      WHERE permission LIKE 'catalog:%'
    `;
    expect(Number(rows[0]?.count)).toBe(0);
  });
});

/**
 * Gỡ RIÊNG migration 0017 — kịch bản thật hơn bài gỡ toàn bộ ở trên.
 *
 * Khi một bản phát hành gây sự cố, việc người ta làm là gỡ ĐÚNG migration vừa lên, không
 * phải xoá sạch về P2. Hai bài kiểm hai thứ khác nhau: gỡ toàn bộ chứng minh THỨ TỰ đúng,
 * còn bài này chứng minh file `0017.down.sql` tự nó đưa schema về đúng trạng thái ngay
 * trước nó.
 *
 * 0017 là migration ĐẦU TIÊN của dự án SỬA một ràng buộc đã có (`launch_url` từ NOT NULL
 * thành nullable) thay vì chỉ thêm bảng mới. Gỡ mà quên khôi phục ràng buộc đó sẽ để lại
 * một schema "gần đúng" — loại hỏng khó thấy nhất, vì mọi bảng đều ở đúng chỗ và mọi truy
 * vấn vẫn chạy, chỉ có một bất biến âm thầm biến mất.
 */
describe('gỡ riêng migration 0017 (hosted apps)', () => {
  let container: StartedPostgreSqlContainer;
  let sql: Sql;

  beforeAll(async () => {
    container = await startPostgres();
    sql = connect(container);
    await applyAllMigrations(sql);
  }, 120_000);

  afterAll(async () => {
    await sql?.end();
    await container?.stop();
  });

  it('app `external_link` đã có SỐNG SÓT qua bài gỡ', async () => {
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO control_plane.applications (id, key, kind, display_name, launch_url, status)
      VALUES (${id}, 'app-cu', 'external_link', 'App cũ', 'https://a.example.com/x', 'active')
    `;
    // App `hosted` CỐ Ý được tạo để bài gỡ phải thật sự xử lý nó — file `.down.sql` xoá
    // chúng, và đó là mất dữ liệu có chủ đích đã ghi trong chính file đó.
    await sql`
      INSERT INTO control_plane.applications (id, key, kind, display_name, launch_url, status)
      VALUES (${crypto.randomUUID()}, 'app-hosted', 'hosted', 'App hosted', NULL, 'draft')
    `;

    await applyRollbackFile(sql, '0017_hosted_apps.down.sql');

    const rows = await sql<{ key: string }[]>`
      SELECT key FROM control_plane.applications ORDER BY key
    `;
    expect(rows.map((r) => r.key)).toEqual(['app-cu']);
  });

  it('schema quay về đúng trạng thái sau 0016', async () => {
    const kind = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'control_plane' AND table_name = 'applications' AND column_name = 'kind'
    `;
    expect(kind[0]?.n, 'cột `kind` phải bị gỡ').toBe(0);

    const launchUrl = await sql<{ is_nullable: string }[]>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'control_plane' AND table_name = 'applications'
        AND column_name = 'launch_url'
    `;
    expect(launchUrl[0]?.is_nullable, '`launch_url` phải trở lại NOT NULL').toBe('NO');

    const binding = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'control_plane' AND table_name = 'application_hosted_bindings'
      ) AS exists
    `;
    expect(binding[0]?.exists, 'bảng binding phải bị gỡ').toBe(false);

    const constraints = await sql<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'control_plane.applications'::regclass AND contype = 'c'
      ORDER BY conname
    `;
    const names = constraints.map((c) => c.conname);
    expect(names).not.toContain('applications_kind_check');
    expect(names).not.toContain('applications_launch_url_required_for_external_check');
    // CHECK cũ phải được KHÔI PHỤC, không chỉ là bị xoá — 0017 đã thay nó bằng bản nới lỏng.
    expect(names).toContain('applications_launch_url_check');
  });

  it('ràng buộc NOT NULL đã khôi phục có HIỆU LỰC THẬT, không chỉ có tên', async () => {
    await expect(
      sql`
        INSERT INTO control_plane.applications (id, key, display_name, launch_url, status)
        VALUES (${crypto.randomUUID()}, 'khong-co-url', 'X', NULL, 'draft')
      `,
    ).rejects.toThrow();
  });
});
