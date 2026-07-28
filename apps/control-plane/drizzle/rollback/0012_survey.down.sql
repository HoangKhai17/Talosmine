-- Gỡ migration 0012 — bỏ khảo sát onboarding và thu hẹp permission về bộ 12.
--
-- HAI CHỖ THỨ TỰ QUAN TRỌNG:
--   1. Xoá các dòng permission `survey_response:read` TRƯỚC khi thu hẹp CHECK. Ngược lại thì
--      `ADD CONSTRAINT` bị chính dữ liệu đang có từ chối — cùng bẫy đã ghi ở 0009 và 0010.
--   2. Bỏ bảng đi NGƯỢC chiều khoá ngoại: answers → responses → option_translations →
--      options → question_translations → questions.
--
-- MẤT DỮ LIỆU: toàn bộ câu trả lời khảo sát biến mất. Xem `README.md` mục "KHI NÀO ĐƯỢC DÙNG"
-- — sau khi có người dùng thật thì đây KHÔNG phải đường đi đúng, hãy forward fix.

--> statement-breakpoint
DELETE FROM control_plane.admin_role_permissions
WHERE permission = 'survey_response:read';

--> statement-breakpoint
ALTER TABLE control_plane.admin_role_permissions
  DROP CONSTRAINT admin_role_permissions_permission_check;

--> statement-breakpoint
-- Bộ permission ở trạng thái sau migration 0010.
ALTER TABLE control_plane.admin_role_permissions
  ADD CONSTRAINT admin_role_permissions_permission_check CHECK (
    permission IN (
      'account:read',
      'account:disable',
      'account:enable',
      'session:revoke',
      'admin_role:manage',
      'audit:read',
      'catalog:read',
      'catalog:manage',
      'catalog:publish',
      'content:read',
      'content:manage',
      'content:publish'
    )
  );

--> statement-breakpoint
DROP TABLE control_plane.survey_answers;

--> statement-breakpoint
DROP TABLE control_plane.survey_responses;

--> statement-breakpoint
DROP TABLE control_plane.survey_option_translations;

--> statement-breakpoint
DROP TABLE control_plane.survey_options;

--> statement-breakpoint
DROP TABLE control_plane.survey_question_translations;

--> statement-breakpoint
DROP TABLE control_plane.survey_questions;
