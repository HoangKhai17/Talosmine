import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyAllMigrations,
  applyBaseline,
  connect,
  type Sql,
  startPostgres,
} from '../support/postgres';

/**
 * DEC-T05: phần DB chạy trên PostgreSQL THẬT qua testcontainers, KHÔNG mock.
 * Grant, default privilege và ownership là hành vi của engine — mock chỉ chứng minh
 * cái mock được viết đúng, không chứng minh migration đúng.
 *
 * Contract: phase-1 mục 8 và 14 — baseline apply được từ DB SẠCH, tạo schema
 * `control_plane`, tách role migration/runtime, runtime KHÔNG có CREATE/ALTER/DROP,
 * và KHÔNG tạo 25 domain table.
 *
 * Vì sao mỗi suite một container: role trong PostgreSQL là đối tượng CẤP CLUSTER, không
 * thuộc database. Tạo database rỗng mới trong cùng container KHÔNG xoá `talosmine_*` của
 * lần apply trước, nên "DB rỗng" sẽ là lời nói dối. Chỉ container mới cho cluster mới.
 */
describe('migration baseline 0000_baseline_schema_roles.sql', () => {
  let container: StartedPostgreSqlContainer;
  let sql: Sql;
  let statementCount: number;

  beforeAll(async () => {
    container = await startPostgres();
    sql = connect(container);

    // Chứng minh điểm xuất phát là DB RỖNG. Nếu schema/role đã tồn tại từ trước thì mọi
    // assertion phía dưới là vô nghĩa — chúng sẽ pass mà không cần migration chạy.
    const schemaBefore = await sql`
      SELECT nspname FROM pg_namespace WHERE nspname = 'control_plane'
    `;
    expect(schemaBefore).toHaveLength(0);

    const rolesBefore = await sql`
      SELECT rolname FROM pg_roles WHERE rolname LIKE 'talosmine%'
    `;
    expect(rolesBefore).toHaveLength(0);

    statementCount = await applyBaseline(sql);
  }, 240_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await container?.stop();
  }, 60_000);

  describe('schema và role', () => {
    it('apply được từ DB rỗng và chạy nhiều hơn một statement', () => {
      expect(statementCount).toBeGreaterThan(1);
    });

    it('tạo schema control_plane', async () => {
      const rows = await sql<{ nspname: string }[]>`
        SELECT nspname FROM pg_namespace WHERE nspname = 'control_plane'
      `;

      expect(rows).toHaveLength(1);
    });

    it('schema control_plane thuộc sở hữu của talosmine_migration', async () => {
      const rows = await sql<{ owner: string }[]>`
        SELECT pg_get_userbyid(nspowner) AS owner
        FROM pg_namespace
        WHERE nspname = 'control_plane'
      `;

      expect(rows[0]?.owner).toBe('talosmine_migration');
    });

    it('tạo đúng hai role tách biệt, cả hai NOLOGIN và không có quyền cao', async () => {
      const rows = await sql<
        {
          rolname: string;
          rolsuper: boolean;
          rolcreaterole: boolean;
          rolcreatedb: boolean;
          rolcanlogin: boolean;
        }[]
      >`
        SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin
        FROM pg_roles
        WHERE rolname LIKE 'talosmine%'
        ORDER BY rolname
      `;

      expect(rows.map((r) => r.rolname)).toEqual(['talosmine_migration', 'talosmine_runtime']);

      for (const role of rows) {
        // Baseline nằm trong git nên KHÔNG chứa password: role được tạo NOLOGIN, chỉ mang
        // quyền. Việc cấp LOGIN + password do infra làm, đọc từ env.
        expect(role.rolcanlogin).toBe(false);
        expect(role.rolsuper).toBe(false);
        expect(role.rolcreaterole).toBe(false);
        expect(role.rolcreatedb).toBe(false);
      }
    });

    it('runtime KHÔNG kế thừa quyền của migration — hai role phải rời nhau', async () => {
      const rows = await sql<{ member: string }[]>`
        SELECT m.rolname AS member
        FROM pg_auth_members am
        JOIN pg_roles m ON m.oid = am.member
        JOIN pg_roles r ON r.oid = am.roleid
        WHERE r.rolname = 'talosmine_migration' AND m.rolname = 'talosmine_runtime'
      `;

      expect(rows).toHaveLength(0);
    });
  });

  describe('grant nền — đọc catalog', () => {
    it('runtime CÓ USAGE trên control_plane', async () => {
      const rows = await sql<{ ok: boolean }[]>`
        SELECT has_schema_privilege('talosmine_runtime', 'control_plane', 'USAGE') AS ok
      `;

      expect(rows[0]?.ok).toBe(true);
    });

    it('runtime KHÔNG có CREATE trên control_plane', async () => {
      const rows = await sql<{ ok: boolean }[]>`
        SELECT has_schema_privilege('talosmine_runtime', 'control_plane', 'CREATE') AS ok
      `;

      expect(rows[0]?.ok).toBe(false);
    });

    it('migration CÓ CREATE trên control_plane', async () => {
      const rows = await sql<{ ok: boolean }[]>`
        SELECT has_schema_privilege('talosmine_migration', 'control_plane', 'CREATE') AS ok
      `;

      expect(rows[0]?.ok).toBe(true);
    });

    it('runtime KHÔNG có CREATE trên schema public', async () => {
      // Đây là phần thuộc contract đã freeze (phase-1 mục 8/14: runtime không CREATE/ALTER/DROP).
      const rows = await sql<{ has_create: boolean }[]>`
        SELECT has_schema_privilege('talosmine_runtime', 'public', 'CREATE') AS has_create
      `;

      expect(rows[0]?.has_create).toBe(false);
    });

    it('MIGRATION MỘT MÌNH không thu hồi được USAGE trên public — việc đó thuộc infra', async () => {
      // Đây KHÔNG phải bug chưa sửa. Nó ghi lại một ranh giới thẩm quyền có thật.
      //
      // Migration 0000 chạy `REVOKE ALL ON SCHEMA public FROM talosmine_runtime` — no-op,
      // vì USAGE của runtime đến từ pseudo-role PUBLIC (`=U/` trong ACL), mà
      // `REVOKE ... FROM <role>` không chạm tới grant của PUBLIC.
      //
      // Và statement đúng (`REVOKE USAGE ON SCHEMA public FROM PUBLIC`) cũng KHÔNG thể
      // đặt trong migration: schema public thuộc `pg_database_owner`, còn migration chạy
      // bằng `talosmine_migration` — role đó không có thẩm quyền, PostgreSQL chỉ trả
      // `WARNING: no privileges could be revoked` rồi đi tiếp. Đo được thật:
      //     talosmine_migration -> WARNING, ACL không đổi
      //     supabase_admin      -> REVOKE thành công, `=U/` biến mất
      //
      // Nên việc thu hồi nằm ở `infra/compose/volumes/db/talosmine-roles.sql`, chạy bằng
      // supabase_admin lúc init container. Test này chỉ apply migration nên đúng là USAGE
      // vẫn còn — và điều đó ĐÚNG với thực tế của migration.
      //
      // CẢNH BÁO QUAN TRỌNG: test này chạy bằng superuser của testcontainers, vốn CÓ
      // thẩm quyền revoke. Nếu ai đó thêm `REVOKE ... FROM PUBLIC` vào migration, test này
      // sẽ chuyển XANH trong khi production vẫn hỏng — vì ở đó migration chạy bằng
      // talosmine_migration. Đừng tin màu xanh ở đây cho câu hỏi quyền của PUBLIC.
      // Bằng chứng thật cho chuỗi init đầy đủ nằm ở docs/build-plan/evidence-p1.md.
      const rows = await sql<{ has_usage: boolean }[]>`
        SELECT has_schema_privilege('talosmine_runtime', 'public', 'USAGE') AS has_usage
      `;

      expect(rows[0]?.has_usage).toBe(true);
    });

    it('PUBLIC không còn CREATE trên schema public — bịt đường vòng mặc định của PostgreSQL', async () => {
      const rows = await sql<{ ok: boolean }[]>`
        SELECT has_schema_privilege('public', 'public', 'CREATE') AS ok
      `;

      expect(rows[0]?.ok).toBe(false);
    });

    it('KHÔNG tạo domain table nào — P1 chỉ dựng schema/role/grant nền', async () => {
      const rows = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM information_schema.tables
        WHERE table_schema = 'control_plane'
      `;

      expect(rows[0]?.count).toBe('0');
    });
  });

  describe('grant nền — kiểm chứng bằng hành vi thật, không chỉ đọc catalog', () => {
    // `has_schema_privilege` đọc catalog. Ở đây ta THỬ THẬT: role là NOLOGIN nên dùng
    // SET LOCAL ROLE trong transaction để mượn danh tính, rồi kiểm engine có từ chối không.
    async function asRole<T>(role: string, run: (tx: Sql) => Promise<T>): Promise<T> {
      return sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL ROLE ${role}`);
        return run(tx as unknown as Sql);
      }) as Promise<T>;
    }

    it('runtime KHÔNG CREATE TABLE được trong control_plane', async () => {
      await expect(
        asRole('talosmine_runtime', (tx) =>
          tx.unsafe('CREATE TABLE control_plane.forbidden (id int)'),
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it('runtime KHÔNG CREATE SCHEMA được', async () => {
      await expect(
        asRole('talosmine_runtime', (tx) => tx.unsafe('CREATE SCHEMA sneaky')),
      ).rejects.toThrow(/permission denied/i);
    });

    it('runtime KHÔNG DROP được schema control_plane', async () => {
      await expect(
        asRole('talosmine_runtime', (tx) => tx.unsafe('DROP SCHEMA control_plane CASCADE')),
      ).rejects.toThrow(/must be owner|permission denied/i);
    });

    it('migration CREATE/DROP TABLE được', async () => {
      await expect(
        asRole('talosmine_migration', async (tx) => {
          await tx.unsafe('CREATE TABLE control_plane.smoke (id int)');
          await tx.unsafe('DROP TABLE control_plane.smoke');
          return 'ok';
        }),
      ).resolves.toBe('ok');
    });
  });

  describe('default privileges áp cho bảng do migration tạo sau này', () => {
    beforeAll(async () => {
      await sql.begin(async (tx) => {
        await tx.unsafe('SET LOCAL ROLE talosmine_migration');
        await tx.unsafe('CREATE TABLE control_plane.future_table (id int)');
      });
    });

    it('runtime tự động có SELECT và INSERT', async () => {
      const rows = await sql<{ can_select: boolean; can_insert: boolean }[]>`
        SELECT has_table_privilege('talosmine_runtime', 'control_plane.future_table', 'SELECT') AS can_select,
               has_table_privilege('talosmine_runtime', 'control_plane.future_table', 'INSERT') AS can_insert
      `;

      expect(rows[0]).toEqual({ can_select: true, can_insert: true });
    });

    it('runtime KHÔNG tự động có UPDATE/DELETE/TRUNCATE', async () => {
      // Mặc định hẹp là có chủ đích: `audit_events`/`usage_events` là append-only
      // (docs/modular.md mục 1.2 luật 7). Bảng cần UPDATE phải cấp TƯỜNG MINH ở migration
      // của phase đó. Nếu mặc định là ALL rồi đi thu hồi từng bảng, quên một lần là mất
      // tính bất biến của ledger.
      const rows = await sql<{ can_update: boolean; can_delete: boolean; can_truncate: boolean }[]>`
        SELECT has_table_privilege('talosmine_runtime', 'control_plane.future_table', 'UPDATE')   AS can_update,
               has_table_privilege('talosmine_runtime', 'control_plane.future_table', 'DELETE')   AS can_delete,
               has_table_privilege('talosmine_runtime', 'control_plane.future_table', 'TRUNCATE') AS can_truncate
      `;

      expect(rows[0]).toEqual({ can_update: false, can_delete: false, can_truncate: false });
    });
  });
});

describe('rerun baseline — không để state mơ hồ', () => {
  // Container riêng: rerun phải bắt đầu từ cluster sạch mới chứng minh được điều nó nói.
  let container: StartedPostgreSqlContainer;
  let sql: Sql;

  beforeAll(async () => {
    container = await startPostgres();
    sql = connect(container);
  }, 240_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await container?.stop();
  }, 60_000);

  it('apply hai lần liên tiếp không lỗi và cho cùng kết quả', async () => {
    await applyBaseline(sql);
    await expect(applyBaseline(sql)).resolves.toBeGreaterThan(1);

    const roles = await sql<{ rolname: string }[]>`
      SELECT rolname FROM pg_roles WHERE rolname LIKE 'talosmine%' ORDER BY rolname
    `;
    expect(roles.map((r) => r.rolname)).toEqual(['talosmine_migration', 'talosmine_runtime']);

    const schemas = await sql<{ nspname: string }[]>`
      SELECT nspname FROM pg_namespace WHERE nspname = 'control_plane'
    `;
    expect(schemas).toHaveLength(1);

    const canCreate = await sql<{ ok: boolean }[]>`
      SELECT has_schema_privilege('talosmine_runtime', 'control_plane', 'CREATE') AS ok
    `;
    expect(canCreate[0]?.ok).toBe(false);
  }, 120_000);
});

// Chain đầy đủ (0000 + migration domain P2). Container riêng vì role là đối tượng
// cấp cluster — DB rỗng mới thật sự rỗng phải là container mới.
describe('toàn bộ chain migration (baseline + P2 identity) từ DB rỗng', () => {
  let container: StartedPostgreSqlContainer;
  let sql: Sql;

  beforeAll(async () => {
    container = await startPostgres();
    sql = connect(container);
  }, 120_000);

  afterAll(async () => {
    await sql?.end();
    await container?.stop();
  });

  it('apply được và tạo đúng tập bảng hiện tại (P2 + P3 + site content)', async () => {
    await applyAllMigrations(sql);

    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'control_plane'
      ORDER BY table_name
    `;
    // Danh sách CHÍNH XÁC — không thừa không thiếu. Cập nhật ở đây mỗi khi thêm bảng là
    // CÓ CHỦ ĐÍCH: test này bắt "bảng lọt vào ngoài ý muốn".
    //
    // P2:           identity (3) + audit (1) + admin RBAC (3) = 7
    // P3:           catalog (4) + service identity (1)        = 5
    // Site content: nav menus/items/translations + settings   = 4
    // Survey:       questions/options + 2 bảng dịch + responses/answers = 6
    expect(tables.map((t) => t.table_name)).toEqual([
      'accounts',
      'admin_role_assignments',
      'admin_role_permissions',
      'admin_roles',
      'application_redirect_uris',
      'applications',
      'audit_events',
      'external_identities',
      'features',
      'nav_item_translations',
      'nav_items',
      'nav_menus',
      'service_identities',
      'site_settings',
      'survey_answers',
      'survey_option_translations',
      'survey_options',
      'survey_question_translations',
      'survey_questions',
      'survey_responses',
      'usage_metrics',
      'web_sessions',
    ]);
  }, 120_000);

  it('audit_events là append-only: UPDATE/DELETE bị trigger chặn kể cả superuser', async () => {
    // testcontainers kết nối bằng superuser. Trigger chặn cả superuser — đó là điểm mấu
    // chốt: append-only không dựa vào quyền (quyền có thể cấp nhầm), mà vào trigger engine.
    await sql`
      INSERT INTO control_plane.audit_events
        (id, operation_id, sequence, actor_type, action, target_type)
      VALUES (gen_random_uuid(), gen_random_uuid(), 0, 'system', 'test.append', 'account')
    `;

    await expect(sql`UPDATE control_plane.audit_events SET action = 'tampered'`).rejects.toThrow(
      /append-only/,
    );

    await expect(sql`DELETE FROM control_plane.audit_events`).rejects.toThrow(/append-only/);
  }, 120_000);

  it('audit_events: service actor phải trỏ tới service identity CÓ THẬT', async () => {
    // P2 khoá cứng `actor_service_identity_id IS NULL` vì bảng đích chưa tồn tại. P3
    // (migration 0008) tạo `service_identities` rồi mở actor check kèm FK.
    //
    // Sau nâng cấp, service actor KHÔNG còn bị cấm tuyệt đối — nhưng vẫn không thể trỏ
    // tới một id bịa ra. Chi tiết ở tests/integration/catalog-schema.test.ts.
    await expect(
      sql`
        INSERT INTO control_plane.audit_events
          (id, operation_id, sequence, actor_type, actor_service_identity_id, action, target_type)
        VALUES (gen_random_uuid(), gen_random_uuid(), 0, 'service', gen_random_uuid(), 'x', 'y')
      `,
    ).rejects.toThrow(/audit_events_actor_service_identity_fk/);
  }, 120_000);

  it('unique (issuer, subject) chặn trùng danh tính', async () => {
    // Đây là ràng buộc bảo mật cốt lõi: một (issuer, subject) chỉ map một account.
    const seeded = await sql<{ id: string }[]>`
      INSERT INTO control_plane.accounts (id, status)
      VALUES (gen_random_uuid(), 'active') RETURNING id
    `;
    const accountId = seeded[0]?.id;
    if (!accountId) throw new Error('seed account thất bại');

    await sql`
      INSERT INTO control_plane.external_identities (id, account_id, provider, issuer, subject)
      VALUES (gen_random_uuid(), ${accountId}, 'logto', 'http://localhost:3001/oidc', 'dup')
    `;

    await expect(
      sql`
        INSERT INTO control_plane.external_identities (id, account_id, provider, issuer, subject)
        VALUES (gen_random_uuid(), ${accountId}, 'logto', 'http://localhost:3001/oidc', 'dup')
      `,
    ).rejects.toThrow(/external_identities_issuer_subject_key/);
  }, 120_000);

  it('FK ON DELETE RESTRICT: không xóa được account còn identity', async () => {
    const seeded = await sql<{ id: string }[]>`
      INSERT INTO control_plane.accounts (id, status)
      VALUES (gen_random_uuid(), 'active') RETURNING id
    `;
    const accountId = seeded[0]?.id;
    if (!accountId) throw new Error('seed account thất bại');

    await sql`
      INSERT INTO control_plane.external_identities (id, account_id, provider, issuer, subject)
      VALUES (gen_random_uuid(), ${accountId}, 'logto', 'http://localhost:3001/oidc', 'restrict')
    `;

    await expect(sql`DELETE FROM control_plane.accounts WHERE id = ${accountId}`).rejects.toThrow(
      /foreign key constraint/,
    );
  }, 120_000);
});
