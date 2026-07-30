import { readFile } from 'node:fs/promises';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';

/**
 * Image PostgreSQL cho integration/concurrency test.
 *
 * Engine phải khớp MAJOR với DB thật (DEC-T10 pin `supabase/postgres:17.6.1.136` → PG 17):
 * row lock, isolation và wait event là hành vi của engine, nên test trên major khác thì
 * kết luận không chuyển sang production được.
 *
 * KHÔNG dùng chính `supabase/postgres` ở đây: image đó chạy một init chain (migrate.sh)
 * phụ thuộc `POSTGRES_USER=supabase_admin`, trong khi PostgreSqlContainer luôn set
 * POSTGRES_USER — tổ hợp này làm init chết im lặng (xem evidence-p1.md, bẫy #2).
 * Test cần một PostgreSQL trần để chứng minh baseline apply được từ DB RỖNG.
 *
 * Tag pin cứng, không dùng `latest` (testcontainers mặc định là tag trôi).
 */
export const POSTGRES_IMAGE = 'postgres:17.6-alpine';

const MIGRATIONS_DIR = new URL('../../apps/control-plane/drizzle/migrations/', import.meta.url);

interface JournalEntry {
  idx: number;
  tag: string;
}

/**
 * Đọc thứ tự migration từ `meta/_journal.json` — chính nguồn mà drizzle-kit dùng.
 *
 * KHÔNG hardcode tên file: baseline không còn là một file duy nhất (0001 sửa một no-op
 * của 0000, và P2+ sẽ thêm tiếp). Hardcode `0000` sẽ khiến test âm thầm bỏ qua migration
 * mới và "chứng minh" một schema không phải cái production chạy.
 */
async function readJournal(): Promise<JournalEntry[]> {
  const raw = await readFile(new URL('meta/_journal.json', MIGRATIONS_DIR), 'utf8');
  const journal = JSON.parse(raw) as { entries: JournalEntry[] };

  return [...journal.entries].sort((a, b) => a.idx - b.idx);
}

/**
 * Drizzle phân tách statement bằng marker `--> statement-breakpoint`, KHÔNG bằng dấu `;`.
 * Tách theo `;` sẽ cắt nát các khối `DO $$ ... END $$;` trong migration.
 */
function splitStatements(raw: string): string[] {
  return raw
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0 && !isCommentOnly(chunk));
}

/**
 * CHỈ migration baseline (0000). Dùng cho các test khẳng định thuộc về RIÊNG baseline:
 * "P1 không tạo domain table" và "baseline idempotent khi rerun".
 *
 * Vì sao tách khỏi full chain: baseline được viết idempotent (`IF NOT EXISTS`, `DO $$`)
 * nên rerun được. Migration domain từ P2 (`CREATE TABLE`) là forward-only — rerun sẽ
 * lỗi "already exists", và đó là ĐÚNG (drizzle track journal nên không bao giờ rerun).
 * Trộn hai loại vào một hàm sẽ làm test baseline hiểu sai bản chất.
 */
export async function loadBaselineStatements(): Promise<string[]> {
  const raw = await readFile(new URL('0000_baseline_schema_roles.sql', MIGRATIONS_DIR), 'utf8');
  return splitStatements(raw);
}

/**
 * TOÀN BỘ chain theo thứ tự journal (0000 + mọi migration domain). Dùng cho test chứng
 * minh cả chain apply được từ DB rỗng — đọc journal nên tự cập nhật khi P2+ thêm bảng,
 * không hardcode tên file.
 */
export async function loadAllMigrationStatements(): Promise<string[]> {
  const entries = await readJournal();
  const statements: string[] = [];

  for (const entry of entries) {
    const raw = await readFile(new URL(`${entry.tag}.sql`, MIGRATIONS_DIR), 'utf8');
    statements.push(...splitStatements(raw));
  }

  return statements;
}

function isCommentOnly(chunk: string): boolean {
  return chunk.split('\n').every((line) => line.trim() === '' || line.trim().startsWith('--'));
}

export async function startPostgres(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer(POSTGRES_IMAGE).start();
}

export type Sql = ReturnType<typeof postgres>;

export function connect(container: StartedPostgreSqlContainer, max = 1): Sql {
  return postgres(container.getConnectionUri(), {
    max,
    // DEC-T09 đặt `prepare: false` vì RUNTIME đi qua Supavisor ở transaction pooling mode —
    // connection bị trả về pool giữa các statement nên prepared statement có tên sẽ vỡ.
    // Testcontainers nối THẲNG PostgreSQL nên về kỹ thuật không bắt buộc. Vẫn đặt ở đây để
    // test chạy trên cùng cấu hình driver với production; nếu một hành vi chỉ đúng khi
    // `prepare: true`, ta muốn biết ở test chứ không phải ở runtime sau pooler.
    prepare: false,
    onnotice: () => {},
  });
}

/** Apply RIÊNG baseline (0000) từ DB rỗng. */
export async function applyBaseline(sql: Sql): Promise<number> {
  const statements = await loadBaselineStatements();
  for (const statement of statements) {
    await sql.unsafe(statement);
  }
  return statements.length;
}

/** Apply TOÀN BỘ chain (0000 + mọi migration domain) từ DB rỗng, theo thứ tự journal. */
export async function applyAllMigrations(sql: Sql): Promise<number> {
  const statements = await loadAllMigrationStatements();
  for (const statement of statements) {
    await sql.unsafe(statement);
  }
  return statements.length;
}

const ROLLBACK_DIR = new URL('../../apps/control-plane/drizzle/rollback/', import.meta.url);

/**
 * Thứ tự gỡ mọi migration sau P2, NGƯỢC với thứ tự tạo.
 *
 * Danh sách này cố ý viết tay chứ không suy ra từ journal: rollback không phải là "đảo
 * ngược journal" một cách máy móc. Nó là một quy trình có chủ đích, và thứ tự của nó là
 * điều cần được đọc và review — xem `apps/control-plane/drizzle/rollback/README.md`.
 *
 * THÊM MIGRATION MỚI THÌ THÊM VÀO ĐẦU DANH SÁCH NÀY. Bỏ sót không làm test đỏ ngay — bài
 * diễn tập vẫn chạy qua — nhưng nó lặng lẽ ngừng kiểm file `.down.sql` mới, và đó chính là
 * cách những file đó mục nát cho tới đêm sự cố.
 */
const ROLLBACK_ORDER = [
  '0016_survey_response_self_delete.down.sql',
  '0015_site_logo_upload.down.sql',
  '0014_legal_slots.down.sql',
  '0013_content_slots.down.sql',
  '0012_survey.down.sql',
  '0011_site_settings.down.sql',
  '0010_site_nav.down.sql',
  '0009_catalog_permissions.down.sql',
  '0008_service_identities.down.sql',
  '0007_catalog.down.sql',
] as const;

/**
 * Chạy bài gỡ theo đúng thứ tự ngược, đưa schema về trạng thái cuối P2.
 *
 * Trả về số statement đã chạy. Ném lỗi ngay tại statement đầu tiên thất bại — không nuốt
 * lỗi, vì một bước rollback lỗi mà vẫn chạy tiếp sẽ để lại schema nửa vời, thứ tệ hơn cả
 * không rollback.
 */
export async function applyRollbackToP2(sql: Sql): Promise<number> {
  let count = 0;

  for (const file of ROLLBACK_ORDER) {
    const raw = await readFile(new URL(file, ROLLBACK_DIR), 'utf8');
    for (const statement of splitStatements(raw)) {
      await sql.unsafe(statement);
      count += 1;
    }
  }

  return count;
}
