-- Gỡ migration 0013 — bỏ bảng khe nội dung.
--
-- MẤT DỮ LIỆU: mọi chữ đã sửa trong `/admin/content/pages` biến mất; web quay về chữ mặc
-- định trong message catalog (trang KHÔNG vỡ — đó chính là thiết kế fallback). Xem
-- `README.md` mục "KHI NÀO ĐƯỢC DÙNG".
--
-- Không đụng permission: 0013 không thêm permission nào (dùng lại `content:*`).

--> statement-breakpoint
DROP TABLE control_plane.content_slots;
