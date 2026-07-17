import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config (DEC-T09).
 *
 * Lưu ý quan trọng: migration nối TRỰC TIẾP PostgreSQL, KHÔNG qua Supavisor.
 * Lý do: DDL cần session ổn định, trong khi Supavisor chạy transaction pooling và
 * trả connection về pool giữa các statement. Nó cũng dùng role migration riêng có
 * quyền DDL — role runtime KHÔNG được có CREATE/ALTER/DROP.
 *
 * Vì vậy config này đọc MIGRATION_DATABASE_URL chứ không phải DATABASE_URL.
 */
const migrationUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    'Thiếu MIGRATION_DATABASE_URL. Migration phải dùng role migration riêng và nối ' +
      'trực tiếp PostgreSQL (không qua Supavisor). Xem .env.example.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/**/schema.ts',
  out: './drizzle/migrations',
  dbCredentials: { url: migrationUrl },
  schemaFilter: ['control_plane'],
  strict: true,
  verbose: true,
});
