-- Gỡ migration 0008 — bỏ danh tính service và phục hồi ràng buộc actor của P2.
--
-- ĐÂY LÀ BƯỚC NHẠY CẢM NHẤT CỦA CẢ BÀI ROLLBACK, và thứ tự bên dưới là bắt buộc:
--
--   1. Phục hồi ràng buộc actor về dạng P2 (chỉ `account` và `system`)
--   2. Bỏ khoá ngoại trỏ tới `service_identities`
--   3. Mới được bỏ bảng
--
-- Làm (3) trước (2) thì PostgreSQL từ chối vì còn khoá ngoại tham chiếu.
--
-- Bước (1) sẽ THẤT BẠI nếu `audit_events` đang có dòng nào với `actor_type = 'service'`.
-- Đó là hành vi ĐÚNG, không phải trục trặc: nhật ký kiểm toán là append-only, và ta không
-- xoá dòng audit để một lần rollback đi qua được. Gặp lỗi đó nghĩa là hệ thống đã dùng
-- service actor thật — lúc ấy dùng forward fix, không dùng file này.

--> statement-breakpoint
ALTER TABLE control_plane.audit_events
  DROP CONSTRAINT audit_events_actor_check;

--> statement-breakpoint
-- Nguyên văn ràng buộc của migration 0004: khoá cứng `actor_service_identity_id IS NULL`
-- để không ai ghi audit với service actor khi bảng đích không còn tồn tại.
ALTER TABLE control_plane.audit_events
  ADD CONSTRAINT audit_events_actor_check CHECK (
    actor_service_identity_id IS NULL
    AND (
      (actor_type = 'account' AND actor_account_id IS NOT NULL)
      OR (actor_type = 'system' AND actor_account_id IS NULL)
    )
  );

--> statement-breakpoint
ALTER TABLE control_plane.audit_events
  DROP CONSTRAINT audit_events_actor_service_identity_fk;

--> statement-breakpoint
-- Quyền cấp thêm ở 0008. `REVOKE` không lỗi khi quyền đã không còn, nên bước này an toàn
-- kể cả khi chạy lại.
REVOKE UPDATE ON control_plane.applications FROM talosmine_runtime;

--> statement-breakpoint
REVOKE UPDATE ON control_plane.features FROM talosmine_runtime;

--> statement-breakpoint
REVOKE UPDATE ON control_plane.usage_metrics FROM talosmine_runtime;

--> statement-breakpoint
REVOKE DELETE ON control_plane.application_redirect_uris FROM talosmine_runtime;

--> statement-breakpoint
-- Giờ mới bỏ được bảng: không còn khoá ngoại nào trỏ tới nó.
--
-- KHÔNG dùng `CASCADE`. Nếu còn thứ gì tham chiếu tới bảng này mà file rollback chưa biết,
-- ta MUỐN lệnh này lỗi để biết mà xử lý — `CASCADE` sẽ âm thầm kéo theo thứ khác.
DROP TABLE control_plane.service_identities;
