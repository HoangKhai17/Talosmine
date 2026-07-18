-- P2 migration — bảng `web_sessions` (database-schema.md mục 4.3).
--
-- Phiên đăng nhập phía server do BFF (apps/web) quản. Nguyên tắc bảo mật cốt lõi:
-- CHỈ lưu HASH của token, không bao giờ lưu token thô. Nếu DB bị lộ, kẻ tấn công có
-- hash cũng không dựng lại được token để mạo danh phiên.

--> statement-breakpoint
CREATE TABLE control_plane.web_sessions (
  id uuid PRIMARY KEY,

  account_id uuid NOT NULL
    REFERENCES control_plane.accounts (id) ON DELETE RESTRICT,

  -- bytea = hash nhị phân. Cột tên có hậu tố `_hash` để không ai nhầm là token thô.
  session_token_hash bytea NOT NULL,
  csrf_token_hash bytea NOT NULL,

  -- Session id từ Auth0 (nếu có) — dùng để propagate logout từ phía Auth0.
  auth0_sid text,

  last_seen_at timestamptz NOT NULL DEFAULT now(),

  -- Hạn tuyệt đối. Phiên KHÔNG được sống vô hạn (modular.md mục 3.4).
  expires_at timestamptz NOT NULL,

  -- Revoke = set hai cột này, KHÔNG xóa row. Giữ lại để audit "phiên bị thu hồi lúc
  -- nào, vì lý do gì".
  revoked_at timestamptz,
  revocation_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Hạn phải sau lúc tạo. Một phiên "hết hạn trước khi sinh ra" là lỗi logic.
  CONSTRAINT web_sessions_expiry_check CHECK (expires_at > created_at),

  -- revoked_at và revocation_reason đi thành cặp: cùng NULL (chưa revoke) hoặc cùng
  -- có giá trị (đã revoke, biết lý do). Chặn "revoke mà không ghi lý do".
  CONSTRAINT web_sessions_revocation_check
    CHECK ((revoked_at IS NULL) = (revocation_reason IS NULL))
);

--> statement-breakpoint
-- session_token_hash là khóa tra cứu phiên, phải unique. Hai phiên không thể chung hash.
CREATE UNIQUE INDEX web_sessions_token_hash_key
  ON control_plane.web_sessions (session_token_hash);

--> statement-breakpoint
-- Partial index cho truy vấn nóng nhất: "các phiên CÒN HIỆU LỰC của một account".
-- WHERE revoked_at IS NULL loại phiên đã thu hồi khỏi index, giữ index nhỏ và nhanh.
CREATE INDEX web_sessions_account_active_idx
  ON control_plane.web_sessions (account_id, expires_at)
  WHERE revoked_at IS NULL;

--> statement-breakpoint
-- Tra ngược từ Auth0 session id khi nhận tín hiệu logout từ Auth0. Chỉ index row có sid.
CREATE INDEX web_sessions_auth0_sid_idx
  ON control_plane.web_sessions (auth0_sid)
  WHERE auth0_sid IS NOT NULL;

--> statement-breakpoint
-- SELECT/INSERT có sẵn. Thêm UPDATE cho last_seen_at (rotate) và revoke.
-- KHÔNG cấp DELETE ở đây: revoke là UPDATE (giữ row để audit). Việc dọn phiên hết hạn
-- (nếu cần xóa vật lý) là housekeeping của worker — cấp quyền riêng khi có nhu cầu rõ,
-- theo least-privilege, thay vì mở sẵn DELETE cho runtime.
GRANT UPDATE ON control_plane.web_sessions TO talosmine_runtime;
