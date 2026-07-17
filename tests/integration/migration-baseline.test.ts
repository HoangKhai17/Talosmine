import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyBaseline, connect, type Sql, startPostgres } from '../support/postgres';

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

    it('GAP ĐÃ BIẾT: runtime VẪN có USAGE trên schema public dù baseline có REVOKE', async () => {
      // CHARACTERIZATION TEST — ghi lại hành vi THẬT, không phải hành vi mong muốn.
      //
      // Baseline dòng 65-66 ghi ý định "Runtime không được đụng schema public" rồi chạy
      //   REVOKE ALL ON SCHEMA public FROM talosmine_runtime;
      // Statement đó là NO-OP cho mục đích của nó: USAGE trên public không hề được cấp
      // TRỰC TIẾP cho talosmine_runtime — nó đến từ pseudo-role PUBLIC. ACL thật đo được:
      //   {pg_database_owner=UC/pg_database_owner,=U/pg_database_owner}
      // Entry `=U/` là "PUBLIC có USAGE". REVOKE FROM <role> không đụng tới entry đó;
      // muốn bỏ thật phải `REVOKE USAGE ON SCHEMA public FROM PUBLIC`.
      //
      // Mức độ: phòng thủ theo chiều sâu, KHÔNG phải lỗ hổng đang mở — PUBLIC đã bị thu hồi
      // CREATE nên runtime không tạo được gì trong public, và P1 chưa có object nào ở đó.
      // Đã báo owner `backend`; tester không tự sửa product code và cũng không tự dựng
      // contract mới (phase-1 chỉ freeze "runtime không CREATE/ALTER/DROP").
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
