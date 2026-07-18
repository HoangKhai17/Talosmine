-- P2 migration — `audit_events` staging (database-schema.md mục 10.4, thứ tự 17.1 bước 3).
--
-- Đây là LEDGER APPEND-ONLY: mọi mutation nhạy cảm (disable account, revoke session, gán
-- role...) ghi một event vào đây TRONG CÙNG transaction với mutation. Nếu ghi audit thất
-- bại, cả mutation rollback (modular.md mục 1.2 luật 5). Audit không được sửa/xóa — sửa sai
-- bằng event mới, không update lịch sử.
--
-- ĐÂY LÀ SHAPE P2 (staging), KHÔNG phải canonical cuối:
--   • actor_service_identity_id đã tồn tại (nullable) nhưng CHƯA có FK — vì bảng
--     service_identities chưa được tạo (thuộc P3).
--   • Actor check P2 chỉ chấp nhận 'account' và 'system', và bắt actor_service_identity_id
--     LUÔN NULL. P3 sẽ thay check này bằng canonical (thêm 'service' + FK).
--   • Cột/nullability/shape cuối cùng KHÔNG đổi ở P3 — chỉ actor check và FK được nâng cấp.

--> statement-breakpoint
CREATE TABLE control_plane.audit_events (
  id uuid PRIMARY KEY,

  -- operation_id + sequence định danh idempotent một chuỗi event của cùng một
  -- logical operation. Retry cùng operation ghi cùng (operation_id, sequence) → replay,
  -- không nhân đôi (modular.md mục 11.4).
  operation_id uuid NOT NULL,
  sequence integer NOT NULL,

  actor_type text NOT NULL,
  actor_account_id uuid REFERENCES control_plane.accounts (id) ON DELETE RESTRICT,
  -- Chưa FK ở P2 (service_identities chưa tồn tại). P3 thêm FK tới service_identities.
  actor_service_identity_id uuid,

  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  target_key text,
  reason text,
  correlation_id uuid,

  -- Chi tiết audit tối thiểu. KHÔNG chứa secret/token/password.
  details jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT audit_events_sequence_check CHECK (sequence >= 0),

  -- Actor check P2: chỉ 'account' hoặc 'system'; service actor bị cấm ở staging.
  --   account -> phải có actor_account_id; system -> không có actor nào.
  --   actor_service_identity_id LUÔN NULL ở P2 (dù cột đã tồn tại cho P3).
  CONSTRAINT audit_events_actor_check CHECK (
    actor_service_identity_id IS NULL
    AND (
      (actor_type = 'account' AND actor_account_id IS NOT NULL)
      OR (actor_type = 'system' AND actor_account_id IS NULL)
    )
  ),

  CONSTRAINT audit_events_action_check CHECK (length(btrim(action)) > 0),
  CONSTRAINT audit_events_target_type_check CHECK (length(btrim(target_type)) > 0),

  -- details, nếu có, phải là JSON object (không phải array/scalar) và <= 64 KiB.
  CONSTRAINT audit_events_details_shape_check
    CHECK (details IS NULL OR jsonb_typeof(details) = 'object'),
  CONSTRAINT audit_events_details_size_check
    CHECK (details IS NULL OR octet_length(details::text) <= 65536)
);

--> statement-breakpoint
-- Cho phép append idempotent nhiều event của cùng operation, và chặn trùng sequence.
CREATE UNIQUE INDEX audit_events_operation_sequence_key
  ON control_plane.audit_events (operation_id, sequence);

--> statement-breakpoint
CREATE INDEX audit_events_target_idx
  ON control_plane.audit_events (target_type, target_id, created_at);

--> statement-breakpoint
CREATE INDEX audit_events_actor_account_idx
  ON control_plane.audit_events (actor_account_id)
  WHERE actor_account_id IS NOT NULL;

--> statement-breakpoint
CREATE INDEX audit_events_correlation_idx
  ON control_plane.audit_events (correlation_id)
  WHERE correlation_id IS NOT NULL;

--> statement-breakpoint
-- Trigger append-only. Đây là lớp bảo vệ ở tầng ENGINE: kể cả khi ai đó vô tình cấp
-- UPDATE/DELETE cho một role, trigger vẫn chặn. "Retention đặc quyền" (nếu có sau này)
-- phải là quy trình riêng của superuser disable trigger có kiểm soát — không phải đường
-- mà code nghiệp vụ đi qua.
CREATE FUNCTION control_plane.audit_events_block_mutation()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events là append-only: % bị chặn', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON control_plane.audit_events
  FOR EACH ROW EXECUTE FUNCTION control_plane.audit_events_block_mutation();

--> statement-breakpoint
-- Runtime có SELECT + INSERT qua default privileges (append + đọc để idempotency check).
-- CỐ Ý KHÔNG cấp UPDATE/DELETE — append-only. Trigger ở trên là lớp thứ hai; việc không
-- cấp quyền là lớp thứ nhất. Hai lớp độc lập.
