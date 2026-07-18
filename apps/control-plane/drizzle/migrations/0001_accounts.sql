-- P2 migration — bảng `accounts` (database-schema.md mục 4.1, thứ tự 17.1 bước 2).
--
-- accounts là aggregate gốc cho một cá nhân trong MVP. Đây là bảng domain ĐẦU TIÊN
-- của cả dự án — P1 chỉ tạo schema+role, không bảng nào.
--
-- Vì sao accounts trước external_identities và web_sessions: cả hai bảng kia đều FK
-- trỏ tới accounts(id), nên accounts phải tồn tại trước.

--> statement-breakpoint
CREATE TABLE control_plane.accounts (
  -- id do APPLICATION sinh (UUIDv7 — DEC-T06), KHÔNG có DB default.
  -- Không dùng gen_random_uuid() vì design chốt sinh ID ở application layer để kiểm
  -- soát thứ tự/thời điểm; repository luôn cung cấp id khi insert.
  id uuid PRIMARY KEY,

  status text NOT NULL,

  -- Hồ sơ typed, KHÔNG dùng JSONB tùy ý (database-schema.md mục 2).
  -- email và display_name CỐ Ý không unique: account được liên kết bằng
  -- (issuer, subject) ở external_identities, KHÔNG bằng email.
  display_name text,
  email text,
  email_verified boolean NOT NULL DEFAULT false,
  locale text,
  timezone text,

  disabled_at timestamptz,

  -- DB clock là nguồn thời gian (không tin client). now() = thời điểm commit.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- status chỉ có đúng 3 giá trị. Enum bằng CHECK (không dùng type enum của PG để
  -- migration về sau linh hoạt hơn khi thêm/bớt giá trị).
  CONSTRAINT accounts_status_check
    CHECK (status IN ('pending', 'active', 'disabled')),

  -- disabled_at có mặt KHI VÀ CHỈ KHI status = 'disabled'. Ràng buộc hai chiều này
  -- chặn hai trạng thái vô nghĩa: "disabled mà không có mốc thời gian" và "có mốc
  -- disable nhưng status lại active".
  CONSTRAINT accounts_disabled_state_check
    CHECK ((disabled_at IS NOT NULL) = (status = 'disabled')),

  -- email_verified = true chỉ hợp lệ khi có email. "Đã xác minh một email không tồn
  -- tại" là vô nghĩa và là mầm của lỗi logic phía trên.
  CONSTRAINT accounts_email_verified_check
    CHECK (email IS NOT NULL OR email_verified = false),

  -- locale/timezone: nếu có giá trị thì không được là chuỗi rỗng. NULL vẫn hợp lệ
  -- (chúng là tùy chọn). Chuỗi rỗng là "có mà như không" — chặn để dữ liệu sạch.
  CONSTRAINT accounts_locale_check
    CHECK (locale IS NULL OR length(btrim(locale)) > 0),
  CONSTRAINT accounts_timezone_check
    CHECK (timezone IS NULL OR length(btrim(timezone)) > 0)
);

--> statement-breakpoint
-- Index phục vụ vận hành (ví dụ đếm account theo trạng thái). KHÔNG unique trên
-- email/display_name — đã nói ở trên, chúng cố ý không unique.
CREATE INDEX accounts_status_idx ON control_plane.accounts (status);

--> statement-breakpoint
-- Runtime role tự động có SELECT + INSERT nhờ default privileges đặt ở migration 0000.
-- accounts cần thêm UPDATE (đổi hồ sơ, activate, disable/enable) nên cấp TƯỜNG MINH.
-- KHÔNG cấp DELETE: account không bao giờ bị hard-delete (database-schema mục 4,
-- vô hiệu hóa bằng status='disabled' để giữ quan hệ lịch sử và audit).
GRANT UPDATE ON control_plane.accounts TO talosmine_runtime;
