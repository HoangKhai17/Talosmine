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

-- Gỡ USAGE mà pseudo-role PUBLIC có trên schema public.
--
-- VÌ SAO Ở ĐÂY chứ không phải trong migration của Drizzle:
-- schema `public` thuộc sở hữu của `pg_database_owner`. Migration chạy bằng
-- `talosmine_migration`, và role đó KHÔNG có thẩm quyền revoke quyền của PUBLIC —
-- PostgreSQL chỉ trả `WARNING: no privileges could be revoked` rồi đi tiếp.
-- Tức là đặt statement này trong migration sẽ tạo một no-op IM LẶNG: log có chữ
-- REVOKE, người đọc tin là đã thu hồi, nhưng ACL không đổi.
-- Script này chạy bằng `supabase_admin` nên nó có thẩm quyền thật.
--
-- VÌ SAO AN TOÀN: chỉ entry `=U/` (PUBLIC) bị gỡ. Bốn role của Supabase
-- (postgres, anon, authenticated, service_role) có grant TƯỜNG MINH riêng nên
-- giữ nguyên quyền — đã kiểm chứng bằng ACL thật trước và sau khi chạy.
--
-- Hệ quả: `talosmine_runtime` mất USAGE trên public. Nó chỉ được dùng schema
-- `control_plane`, đúng như baseline migration tuyên bố.
--
-- LƯU Ý cho người sửa sau: sau khi USAGE bị thu hồi, `talosmine_migration` cũng
-- không còn tham chiếu được schema public. Vì vậy migration KHÔNG được chứa bất kỳ
-- statement nào đụng tới public — nó sẽ chết với `permission denied for schema public`.
-- Đây là lý do file baseline 0000 cố ý không có statement nào về public.
REVOKE USAGE ON SCHEMA public FROM PUBLIC;

-- CREATE trên public: PostgreSQL 15+ mặc định đã không cấp cho PUBLIC nữa
-- (ACL đo được chỉ có `=U/`, không có `C`). Statement này là phòng thủ chiều sâu
-- phòng khi image đổi mặc định, và nó vô hại khi không có gì để thu hồi.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- CREATE trên database chỉ cấp cho role migration — đây là quyền tạo schema.
-- Cấp ở đây (chạy bằng supabase_admin) vì bản thân migration baseline không thể
-- tự cấp quyền cho chính nó.
-- talosmine_runtime CỐ Ý không có quyền này: nó không được tạo schema, và đó là
-- một nửa của việc tách role (nửa còn lại là REVOKE CREATE trên schema, nằm trong
-- migration baseline).
GRANT CREATE ON DATABASE postgres TO talosmine_migration;
