-- P3 migration — `service_identities` + hoàn tất audit service actor.
--
-- Đây là phần DỌN NỢ CÓ CHỦ ĐÍCH từ P2. Migration 0004 tạo cột
-- `audit_events.actor_service_identity_id` nhưng CỐ Ý chưa thêm FK, vì bảng đích chưa tồn
-- tại (nó phụ thuộc `applications`, mà `applications` thuộc P3).
--
-- Cách làm đó tránh được một migration phá vỡ: nếu P2 không tạo sẵn cột, P3 sẽ phải
-- ALTER TABLE thêm cột vào một bảng append-only đã có dữ liệu production.
--
-- Thứ tự trong file này quan trọng: tạo bảng TRƯỚC, rồi mới thêm FK và mở actor check.

--> statement-breakpoint
CREATE TABLE control_plane.service_identities (
  id uuid PRIMARY KEY,

  application_id uuid NOT NULL
    REFERENCES control_plane.applications (id) ON DELETE RESTRICT,

  -- Issuer của IdP phát token M2M. Tên cột trung tính, không gắn nhà cung cấp — sau
  -- DEC-T22 thì đây là Logto, nhưng cột không cần biết điều đó.
  issuer text NOT NULL,

  -- Client ID là định danh CÔNG KHAI, không phải secret.
  --
  -- TUYỆT ĐỐI KHÔNG lưu client secret, access token hay refresh token ở bảng này
  -- (database-schema mục 8.1). Control Plane xác minh token M2M bằng CHỮ KÝ qua JWKS —
  -- nó không cần biết secret, nên lưu secret chỉ tạo thêm thứ để mất.
  client_id text NOT NULL,

  display_name text NOT NULL,
  status text NOT NULL,

  last_seen_at timestamptz,

  -- Thu hồi = ghi hai cột này, KHÔNG xoá row. Giữ lịch sử "danh tính nào từng gọi, bị thu
  -- hồi lúc nào, vì sao".
  revoked_at timestamptz,
  revocation_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT service_identities_status_check CHECK (status IN ('active', 'revoked')),
  CONSTRAINT service_identities_issuer_check CHECK (length(btrim(issuer)) > 0),
  CONSTRAINT service_identities_client_id_check CHECK (length(btrim(client_id)) > 0),
  CONSTRAINT service_identities_display_name_check CHECK (length(btrim(display_name)) > 0),

  -- Trạng thái và dữ liệu thu hồi phải NHẤT QUÁN hai chiều: `revoked` thì bắt buộc có thời
  -- điểm và lý do; `active` thì bắt buộc không có. Chặn trạng thái "đã thu hồi nhưng vẫn
  -- active" và "active nhưng có revoked_at".
  CONSTRAINT service_identities_revocation_check CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL
       AND length(btrim(coalesce(revocation_reason, ''))) > 0)
    OR (status = 'active' AND revoked_at IS NULL AND revocation_reason IS NULL)
  )
);

--> statement-breakpoint
-- Một cặp (issuer, client_id) chỉ thuộc đúng một service identity — cùng nguyên tắc với
-- (issuer, subject) của người dùng.
CREATE UNIQUE INDEX service_identities_issuer_client_key
  ON control_plane.service_identities (issuer, client_id);

--> statement-breakpoint
-- Đích cho composite FK của `service_identity_scopes` ở phase sau.
CREATE UNIQUE INDEX service_identities_id_application_key
  ON control_plane.service_identities (id, application_id);

--> statement-breakpoint
CREATE INDEX service_identities_application_status_idx
  ON control_plane.service_identities (application_id, status);

--> statement-breakpoint
-- Giờ mới thêm được FK cho cột đã tạo sẵn từ P2.
ALTER TABLE control_plane.audit_events
  ADD CONSTRAINT audit_events_actor_service_identity_fk
  FOREIGN KEY (actor_service_identity_id)
  REFERENCES control_plane.service_identities (id) ON DELETE RESTRICT;

--> statement-breakpoint
-- Mở actor check cho loại actor thứ ba.
--
-- P2 khoá cứng `actor_service_identity_id IS NULL` để không ai ghi audit với service actor
-- khi bảng đích chưa tồn tại. Giờ thay bằng shape đầy đủ: đúng MỘT trong ba loại actor, và
-- mỗi loại phải có đúng cột định danh của nó.
ALTER TABLE control_plane.audit_events
  DROP CONSTRAINT audit_events_actor_check;

--> statement-breakpoint
ALTER TABLE control_plane.audit_events
  ADD CONSTRAINT audit_events_actor_check CHECK (
    (actor_type = 'account'
       AND actor_account_id IS NOT NULL AND actor_service_identity_id IS NULL)
    OR (actor_type = 'service'
       AND actor_service_identity_id IS NOT NULL AND actor_account_id IS NULL)
    OR (actor_type = 'system'
       AND actor_account_id IS NULL AND actor_service_identity_id IS NULL)
  );

--> statement-breakpoint
-- Runtime cần UPDATE trên `service_identities` để ghi `last_seen_at` và thu hồi.
-- `applications`, `features`, `usage_metrics` cần UPDATE cho việc đổi status/metadata.
--
-- KHÔNG cấp DELETE ở đâu cả: catalog đổi `status` thay vì xoá (database-schema mục 1), và
-- audit vẫn giữ nguyên lệnh cấm mutation từ migration 0004.
GRANT UPDATE ON control_plane.applications TO talosmine_runtime;
GRANT UPDATE ON control_plane.features TO talosmine_runtime;
GRANT UPDATE ON control_plane.usage_metrics TO talosmine_runtime;
GRANT UPDATE ON control_plane.service_identities TO talosmine_runtime;

--> statement-breakpoint
-- `application_redirect_uris` là allowlist: sửa một URI tại chỗ sẽ làm mất dấu vết URI cũ.
-- Thay đổi = xoá dòng cũ, thêm dòng mới, và cả hai đều đi qua command có audit.
GRANT DELETE ON control_plane.application_redirect_uris TO talosmine_runtime;
