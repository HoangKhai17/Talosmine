-- Gỡ migration 0016 — thu hồi quyền DELETE trên `survey_responses`.
--
-- KHÔNG MẤT DỮ LIỆU: chỉ thu hồi một GRANT, không đụng bảng/hàng nào. Sau khi gỡ, đường
-- `DELETE /v1/me/onboarding/response` sẽ báo lỗi quyền ở tầng database nếu còn được gọi —
-- đưa hệ thống về đúng bất biến P2 "câu trả lời khảo sát không có đường xoá từ ứng dụng".

--> statement-breakpoint
REVOKE DELETE ON control_plane.survey_responses FROM talosmine_runtime;
