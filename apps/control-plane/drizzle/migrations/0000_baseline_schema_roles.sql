-- Baseline migration P1 — database-schema.md mục 17.1 bước 1.
-- Phạm vi: schema `control_plane`, migration/runtime role và grant nền tối thiểu.
-- KHÔNG tạo domain table nào. 25 bảng canonical được tạo dần từ P2 trở đi.
--
-- Ranh giới cố ý: file này KHÔNG chứa password.
-- Role được tạo ở đây là NOLOGIN — chỉ mang quyền, không đăng nhập được.
-- Việc cấp LOGIN + password do infra làm (infra/compose/init/), đọc từ env.
-- Lý do: migration nằm trong git; secret thì không.

--> statement-breakpoint
-- Chặn mọi role khác tạo object trong database. PUBLIC mặc định có CREATE trên
-- schema public — đó là một đường vòng cần bịt.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

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

--> statement-breakpoint
-- Runtime không được đụng schema public.
REVOKE ALL ON SCHEMA public FROM talosmine_runtime;
