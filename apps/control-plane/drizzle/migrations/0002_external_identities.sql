-- P2 migration — bảng `external_identities` (database-schema.md mục 4.2).
--
-- Đây là bảng liên kết account nội bộ với danh tính Auth0. Khóa liên kết DUY NHẤT là
-- cặp (issuer, subject) — KHÔNG BAO GIỜ là email. Đây là quyết định bảo mật cốt lõi:
-- email có thể đổi, có thể trùng, có thể bị chiếm; (issuer, subject) thì ổn định và do
-- nguồn danh tính tin cậy phát ra.

--> statement-breakpoint
CREATE TABLE control_plane.external_identities (
  id uuid PRIMARY KEY,

  -- ON DELETE RESTRICT: không cho xóa account khi còn identity trỏ tới nó. Kết hợp với
  -- việc account không hard-delete, đây là hàng rào chống mất liên kết danh tính.
  account_id uuid NOT NULL
    REFERENCES control_plane.accounts (id) ON DELETE RESTRICT,

  -- Baseline chỉ hỗ trợ 'auth0'. Google login KHÔNG tạo provider mới — Auth0 vẫn là
  -- issuer, chỉ là upstream connection khác (database-schema mục 4.2).
  provider text NOT NULL,

  issuer text NOT NULL,
  subject text NOT NULL,

  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT external_identities_provider_check CHECK (provider = 'auth0'),
  CONSTRAINT external_identities_issuer_check CHECK (length(btrim(issuer)) > 0),
  CONSTRAINT external_identities_subject_check CHECK (length(btrim(subject)) > 0)
);

--> statement-breakpoint
-- Đây là ràng buộc chống trùng danh tính: một (issuer, subject) chỉ map tới đúng một
-- account. Race hai callback đồng thời cùng (issuer, subject) sẽ bị unique này chặn,
-- buộc transaction thua rollback (database-schema mục 4.2). KHÔNG có unique nào theo email.
CREATE UNIQUE INDEX external_identities_issuer_subject_key
  ON control_plane.external_identities (issuer, subject);

--> statement-breakpoint
CREATE INDEX external_identities_account_idx
  ON control_plane.external_identities (account_id);

--> statement-breakpoint
-- SELECT/INSERT có sẵn qua default privileges. Thêm UPDATE cho last_seen_at (cập nhật
-- mỗi lần login). KHÔNG DELETE: gỡ liên kết danh tính là thao tác nhạy cảm, không phải
-- việc runtime tự làm.
GRANT UPDATE ON control_plane.external_identities TO talosmine_runtime;
