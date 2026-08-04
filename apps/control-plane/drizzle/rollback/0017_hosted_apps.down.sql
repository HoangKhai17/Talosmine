-- Gỡ migration 0017 — bỏ khái niệm ứng dụng `hosted`, đưa `applications` về đúng trạng thái
-- sau migration 0016.
--
-- MẤT DỮ LIỆU CÓ CHỦ ĐÍCH: bảng `application_hosted_bindings` bị xoá cùng toàn bộ cấu hình
-- nhà cung cấp trong đó. Đó là hệ quả không tránh được của việc gỡ chính khái niệm này —
-- ghi ra đây để người chạy rollback biết trước, không phát hiện sau.
--
-- THỨ TỰ QUAN TRỌNG: phải xoá bảng binding TRƯỚC khi đụng tới `applications.kind`, và phải
-- xoá mọi app `hosted` TRƯỚC khi khôi phục `launch_url NOT NULL` — app hosted có
-- `launch_url` NULL nên khôi phục ràng buộc khi chúng còn tồn tại sẽ thất bại giữa chừng.

--> statement-breakpoint
DROP TABLE IF EXISTS control_plane.application_hosted_bindings;

--> statement-breakpoint
-- App `hosted` không còn chỗ đứng trong lược đồ cũ. Xoá hẳn thay vì đổi chúng thành
-- `external_link` với một launch_url bịa ra: một URL bịa sẽ là link hỏng trước mặt người
-- dùng, tệ hơn là không có app.
--
-- ON DELETE RESTRICT ở features/usage_metrics/redirect_uris/service_identities sẽ CHẶN lệnh
-- này nếu app hosted có dữ liệu con. Đó là hành vi đúng: rollback phải dừng và báo, không
-- được âm thầm kéo theo dữ liệu của bảng khác.
DELETE FROM control_plane.applications WHERE kind = 'hosted';

--> statement-breakpoint
ALTER TABLE control_plane.applications
  DROP CONSTRAINT applications_launch_url_required_for_external_check;

--> statement-breakpoint
ALTER TABLE control_plane.applications
  DROP CONSTRAINT applications_launch_url_check;

--> statement-breakpoint
ALTER TABLE control_plane.applications
  ADD CONSTRAINT applications_launch_url_check
    CHECK (length(btrim(launch_url)) > 0);

--> statement-breakpoint
ALTER TABLE control_plane.applications
  ALTER COLUMN launch_url SET NOT NULL;

--> statement-breakpoint
ALTER TABLE control_plane.applications
  DROP CONSTRAINT applications_kind_check;

--> statement-breakpoint
ALTER TABLE control_plane.applications
  DROP COLUMN kind;
