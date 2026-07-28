-- Gỡ migration 0011 — bỏ bảng cài đặt site.
--
-- Không có ràng buộc nào trỏ tới bảng này và không permission nào được thêm ở 0011, nên gỡ
-- chỉ là một câu `DROP TABLE`. Quyền cấp trên bảng biến mất theo bảng.
--
-- MẤT DỮ LIỆU: URL logo đang dùng sẽ mất. Web rơi về logo chữ — không sập, nhưng phải nhập
-- lại. Xem `README.md` mục "KHI NÀO ĐƯỢC DÙNG".

--> statement-breakpoint
DROP TABLE control_plane.site_settings;
