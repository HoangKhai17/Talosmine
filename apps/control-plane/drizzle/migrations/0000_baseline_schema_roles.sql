-- Baseline migration P1 — database-schema.md mục 17.1 bước 1.
-- Phạm vi: schema `control_plane`, migration/runtime role và grant nền tối thiểu.
-- KHÔNG tạo domain table nào. 25 bảng canonical được tạo dần từ P2 trở đi.
--
-- HAI RANH GIỚI CỐ Ý — đừng gộp lại:
--
-- 1. File này KHÔNG chứa password. Role tạo ở đây là NOLOGIN — chỉ mang quyền.
--    Việc cấp LOGIN + password do infra làm (`infra/compose/volumes/db/talosmine-roles.sql`),
--    đọc từ env. Lý do: migration nằm trong git; secret thì không.
--
-- 2. File này KHÔNG đụng tới schema `public`. Mọi thay đổi quyền trên public nằm ở
--    infra script nói trên. Lý do là thẩm quyền, không phải sở thích: `public` thuộc
--    `pg_database_owner`, còn migration chạy bằng `talosmine_migration` — role đó
--    không revoke được quyền của PUBLIC. Đặt statement đó ở đây chỉ tạo ra một trong
--    hai kết quả tệ: `WARNING: no privileges could be revoked` (no-op im lặng, người
--    đọc tưởng đã thu hồi), hoặc `ERROR: permission denied for schema public` làm
--    chết cả migration sau khi infra đã thu hồi USAGE. Cả hai đều đã gặp thật.

--> statement-breakpoint
-- Role migration: sở hữu schema, có quyền DDL. Chỉ drizzle-kit dùng.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'talosmine_migration') THEN
    CREATE ROLE talosmine_migration NOLOGIN;
  END IF;
END
$$;

--> statement-breakpoint
-- Role runtime: API và worker dùng. KHÔNG có CREATE/ALTER/DROP.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'talosmine_runtime') THEN
    CREATE ROLE talosmine_runtime NOLOGIN;
  END IF;
END
$$;

--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS control_plane AUTHORIZATION talosmine_migration;

--> statement-breakpoint
-- Runtime chỉ được DÙNG schema, không được tạo gì trong đó.
GRANT USAGE ON SCHEMA control_plane TO talosmine_runtime;

--> statement-breakpoint
REVOKE CREATE ON SCHEMA control_plane FROM talosmine_runtime;

--> statement-breakpoint
REVOKE CREATE ON SCHEMA control_plane FROM PUBLIC;

--> statement-breakpoint
-- Default privileges: bảng do talosmine_migration tạo sau này sẽ tự động cấp
-- SELECT/INSERT cho runtime. KHÔNG cấp UPDATE/DELETE/TRUNCATE mặc định —
-- các bảng cần UPDATE (ví dụ `accounts`) phải cấp TƯỜNG MINH ở migration của phase đó.
--
-- Vì sao mặc định hẹp: `audit_events` và `usage_events` là append-only
-- (docs/modular.md mục 1.2 luật 7). Nếu mặc định là ALL rồi đi thu hồi từng bảng,
-- chỉ cần quên một lần là mất tính bất biến của ledger. Mặc định hẹp thì lỗi
-- nghiêng về phía an toàn: thiếu quyền gây lỗi ồn ào, không âm thầm.
ALTER DEFAULT PRIVILEGES FOR ROLE talosmine_migration IN SCHEMA control_plane
  GRANT SELECT, INSERT ON TABLES TO talosmine_runtime;

--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE talosmine_migration IN SCHEMA control_plane
  GRANT USAGE, SELECT ON SEQUENCES TO talosmine_runtime;

-- Ghi chú: KHÔNG có statement nào về schema `public` trong file này — xem ranh giới 2
-- ở đầu file. Việc thu hồi quyền trên public nằm ở
-- `infra/compose/volumes/db/talosmine-roles.sql`, chạy bằng `supabase_admin`.
