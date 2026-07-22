-- Gỡ migration 0007 — bỏ bốn bảng catalog theo thứ tự ngược phụ thuộc khoá ngoại.
--
-- `usage_metrics` trỏ tới `features` và `applications`; `features` và
-- `application_redirect_uris` trỏ tới `applications`. Nên bảng lá bỏ trước, gốc bỏ sau.
--
-- KHÔNG dùng `CASCADE` ở bất kỳ dòng nào. Nếu một bảng chưa biết tới đang tham chiếu vào
-- đây, ta MUỐN lệnh lỗi để biết — `CASCADE` sẽ âm thầm kéo theo thứ khác đi cùng.
--
-- Index và ràng buộc biến mất cùng bảng, không cần bỏ riêng.

--> statement-breakpoint
DROP TABLE control_plane.usage_metrics;

--> statement-breakpoint
DROP TABLE control_plane.features;

--> statement-breakpoint
DROP TABLE control_plane.application_redirect_uris;

--> statement-breakpoint
DROP TABLE control_plane.applications;
