-- Gỡ migration 0015 — bỏ bảng tài sản site.
--
-- MẤT DỮ LIỆU: file logo đã tải lên biến mất; web rơi về `site_settings.logo.url` (nếu đặt)
-- rồi về logo chữ. Xem `README.md` mục "KHI NÀO ĐƯỢC DÙNG".

--> statement-breakpoint
DROP TABLE control_plane.site_assets;
