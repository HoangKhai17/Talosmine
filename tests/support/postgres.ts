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

const BASELINE_MIGRATION_URL = new URL(
  '../../apps/control-plane/drizzle/migrations/0000_baseline_schema_roles.sql',
  import.meta.url,
);

/**
 * Drizzle phân tách statement bằng marker `--> statement-breakpoint`, KHÔNG bằng dấu `;`.
 * Tách theo `;` sẽ cắt nát các khối `DO $$ ... END $$;` trong baseline.
 */
export async function loadBaselineStatements(): Promise<string[]> {
  const raw = await readFile(BASELINE_MIGRATION_URL, 'utf8');

  return raw
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0 && !isCommentOnly(chunk));
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

/** Apply baseline từ DB rỗng, theo đúng thứ tự statement của file migration. */
export async function applyBaseline(sql: Sql): Promise<number> {
  const statements = await loadBaselineStatements();

  for (const statement of statements) {
    await sql.unsafe(statement);
  }

  return statements.length;
}
