-- Tạo hai role LOGIN của Talosmine, đọc password từ biến môi trường.
--
-- Vì sao là .sql chứ không phải .sh: `migrate.sh` của image supabase/postgres CHỈ
-- xử lý `*.sql` trong init-scripts/ và migrations/. File .sh bị lờ đi không báo lỗi —
-- một cái bẫy im lặng. Pattern `\set ... echo "$ENV"` dưới đây chính là cách
-- Supabase tự làm trong roles.sql và _supabase.sql.
--
-- Vì sao nằm ở migrations/ chứ không init-scripts/: migrate.sh chạy init-scripts/ bằng
-- user `postgres` (đã bị demote ở post-setup), còn migrations/ chạy bằng `supabase_admin`
-- vốn còn quyền tạo role.
--
-- Ranh giới: file này CHỈ cấp credential. Cấu trúc và quyền trên schema `control_plane`
-- do migration baseline của Drizzle lo (0000_baseline_schema_roles.sql). Tách bạch vì
-- migration nằm trong git, còn secret thì không.
--
-- Script chỉ chạy khi data directory còn rỗng (init lần đầu).

\set migration_pw `echo "$TALOSMINE_MIGRATION_PASSWORD"`
\set runtime_pw `echo "$TALOSMINE_RUNTIME_PASSWORD"`

-- Role migration: drizzle-kit dùng, có quyền DDL trên control_plane.
-- Nối TRỰC TIẾP db, không qua Supavisor.
CREATE ROLE talosmine_migration LOGIN PASSWORD :'migration_pw'
  NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- Role runtime: API và worker dùng, đi QUA Supavisor.
-- KHÔNG có CREATE/ALTER/DROP. Các thuộc tính dưới đây ghi tường minh thay vì
-- dựa vào mặc định của PostgreSQL — quyền là thứ phải đọc được, không phải đoán.
CREATE ROLE talosmine_runtime LOGIN PASSWORD :'runtime_pw'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

GRANT CONNECT ON DATABASE postgres TO talosmine_migration;
GRANT CONNECT ON DATABASE postgres TO talosmine_runtime;

-- CREATE trên database chỉ cấp cho role migration — đây là quyền tạo schema.
-- Cấp ở đây (chạy bằng supabase_admin) vì bản thân migration baseline không thể
-- tự cấp quyền cho chính nó.
-- talosmine_runtime CỐ Ý không có quyền này: nó không được tạo schema, và đó là
-- một nửa của việc tách role (nửa còn lại là REVOKE CREATE trên schema, nằm trong
-- migration baseline).
GRANT CREATE ON DATABASE postgres TO talosmine_migration;
