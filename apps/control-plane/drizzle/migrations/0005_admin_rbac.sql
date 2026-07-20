-- P2 migration — Admin RBAC (database-schema.md mục 10.1–10.3, modular.md mục 11).
--
-- Ba bảng: role → permission của role → assignment role cho account.
-- Nguyên tắc: DENY-BY-DEFAULT. Không có super-admin mặc định, không có role ngầm.
-- Muốn làm gì cũng phải có assignment còn hiệu lực trỏ tới role có permission tương ứng.

--> statement-breakpoint
CREATE TABLE control_plane.admin_roles (
  id uuid PRIMARY KEY,
  -- `key` là machine key ổn định (ví dụ 'support', 'security'). Code tham chiếu key,
  -- KHÔNG tham chiếu display_name (đổi tên hiển thị không được làm vỡ phân quyền).
  key text NOT NULL,
  display_name text NOT NULL,
  description text,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_roles_key_check CHECK (length(btrim(key)) > 0),
  CONSTRAINT admin_roles_display_name_check CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT admin_roles_status_check CHECK (status IN ('active', 'inactive'))
);

--> statement-breakpoint
CREATE UNIQUE INDEX admin_roles_key_key ON control_plane.admin_roles (key);

--> statement-breakpoint
CREATE INDEX admin_roles_status_idx ON control_plane.admin_roles (status);

--> statement-breakpoint
CREATE TABLE control_plane.admin_role_permissions (
  id uuid PRIMARY KEY,
  admin_role_id uuid NOT NULL
    REFERENCES control_plane.admin_roles (id) ON DELETE RESTRICT,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- PERMISSION CATALOG — khóa cứng ở DB (database-schema mục 10.2 yêu cầu named check).
  --
  -- Vì sao khóa ở DB chứ không chỉ ở code: một permission gõ sai ('acount:read') hoặc một
  -- permission bịa ra sẽ được lưu im lặng rồi không bao giờ khớp khi kiểm quyền — tạo ra
  -- role trông như có quyền nhưng thực tế không. CHECK biến lỗi đó thành lỗi ngay lúc ghi.
  --
  -- Thêm permission mới = một migration mới có chủ đích, KHÔNG phải sửa hằng số trong code.
  -- Danh sách này dẫn xuất từ modular.md mục 11.3 (command) và phạm vi admin của P2:
  --   account:read      -- tìm và xem account
  --   account:disable   -- vô hiệu hóa account
  --   account:enable    -- kích hoạt lại (disabled -> active, hành động nhạy cảm)
  --   session:revoke    -- thu hồi phiên của user
  --   admin_role:manage -- tạo role, cấp permission, gán/thu hồi assignment
  --   audit:read        -- tra cứu audit (modular.md 11.4 yêu cầu permission riêng)
  CONSTRAINT admin_role_permissions_permission_check CHECK (
    permission IN (
      'account:read',
      'account:disable',
      'account:enable',
      'session:revoke',
      'admin_role:manage',
      'audit:read'
    )
  )
);

--> statement-breakpoint
-- Unique bắt đầu bằng admin_role_id: vừa chặn cấp trùng permission, vừa phục vụ FK lookup.
-- Không tạo thêm index riêng cho admin_role_id (sẽ trùng lặp).
CREATE UNIQUE INDEX admin_role_permissions_role_permission_key
  ON control_plane.admin_role_permissions (admin_role_id, permission);

--> statement-breakpoint
CREATE TABLE control_plane.admin_role_assignments (
  id uuid PRIMARY KEY,
  admin_role_id uuid NOT NULL
    REFERENCES control_plane.admin_roles (id) ON DELETE RESTRICT,
  account_id uuid NOT NULL
    REFERENCES control_plane.accounts (id) ON DELETE RESTRICT,

  -- Khoảng hiệu lực [valid_from, valid_until). valid_until NULL = không hạn.
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,

  -- Reason BẮT BUỘC: mọi mutation quản trị phải giải thích được vì sao (modular.md 11.4).
  reason text NOT NULL,
  assigned_by_account_id uuid NOT NULL
    REFERENCES control_plane.accounts (id) ON DELETE RESTRICT,

  -- Thu hồi = ba cột này, KHÔNG xóa row (giữ lịch sử ai cấp quyền cho ai, khi nào).
  revoked_at timestamptz,
  revoked_by_account_id uuid REFERENCES control_plane.accounts (id) ON DELETE RESTRICT,
  revocation_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_role_assignments_reason_check CHECK (length(btrim(reason)) > 0),

  CONSTRAINT admin_role_assignments_validity_check
    CHECK (valid_until IS NULL OR valid_until > valid_from),

  -- Revoke triple: ba cột cùng NULL (chưa thu hồi) hoặc cùng có giá trị (đã thu hồi, biết
  -- ai thu hồi và vì sao). Chặn trạng thái "đã thu hồi nhưng không biết ai/vì sao".
  CONSTRAINT admin_role_assignments_revocation_check CHECK (
    (revoked_at IS NULL AND revoked_by_account_id IS NULL AND revocation_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by_account_id IS NOT NULL
        AND length(btrim(coalesce(revocation_reason, ''))) > 0)
  )
);

--> statement-breakpoint
-- Truy vấn nóng nhất: "account này đang có quyền gì" — lọc assignment còn hiệu lực.
CREATE INDEX admin_role_assignments_lookup_idx
  ON control_plane.admin_role_assignments (account_id, valid_from, valid_until)
  WHERE revoked_at IS NULL;

--> statement-breakpoint
CREATE INDEX admin_role_assignments_role_idx
  ON control_plane.admin_role_assignments (admin_role_id);

--> statement-breakpoint
-- Runtime có SELECT/INSERT qua default privileges. Thêm UPDATE cho:
--   • admin_roles: đổi status active/inactive, sửa mô tả
--   • admin_role_assignments: thu hồi (set revoke triple)
-- KHÔNG cấp UPDATE cho admin_role_permissions: cấp/gỡ permission là INSERT/DELETE về ngữ
-- nghĩa, không phải sửa tại chỗ — và cũng KHÔNG cấp DELETE, nên P2 chỉ cấp thêm permission.
-- Gỡ permission (nếu cần) sẽ là quyết định riêng có migration và audit.
GRANT UPDATE ON control_plane.admin_roles TO talosmine_runtime;

--> statement-breakpoint
GRANT UPDATE ON control_plane.admin_role_assignments TO talosmine_runtime;
