-- Cho phép người dùng tự xoá câu trả lời khảo sát của chính mình — DEC-B11 câu 2
-- (chủ dự án chốt 2026-07-30): "có, làm sớm".
--
-- Migration 0012 CỐ Ý không cấp DELETE trên `survey_responses`/`survey_answers`, với lý do
-- "câu trả lời đã nộp là dữ liệu lịch sử, không có đường sửa/xoá từ ứng dụng". DEC-B11 câu 2
-- đảo ngược đúng MỘT PHẦN của lý do đó: giờ CÓ một đường xoá hợp lệ, do CHÍNH CHỦ yêu cầu
-- (`DELETE /v1/me/onboarding/response`), không phải một chỗ hở để ứng dụng tự ý sửa dữ liệu
-- người khác.
--
-- CHỈ cấp DELETE trên `survey_responses`, KHÔNG cấp trên `survey_answers`: đã kiểm chứng
-- thật (docker container riêng, role bị giới hạn) rằng `ON DELETE CASCADE` của PostgreSQL
-- KHÔNG đòi hỏi role đang xoá phải có quyền DELETE trên bảng con — ràng buộc khoá ngoại tự
-- xử lý việc dọn `survey_answers` mà không cần cấp thêm quyền nào ở đó. Giữ nguyên bất biến
-- "ứng dụng không có đường DELETE trực tiếp vào survey_answers" — xoá answers CHỈ xảy ra như
-- hệ quả của xoá đúng MỘT response, không bao giờ xoá lẻ từng câu trả lời.

--> statement-breakpoint
GRANT DELETE ON control_plane.survey_responses TO talosmine_runtime;
