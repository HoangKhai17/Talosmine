-- P3 migration — mở rộng danh mục permission cho Catalog.
--
-- Danh mục permission là DANH SÁCH ĐÓNG khoá bằng CHECK (migration 0005). Đó là chủ đích:
-- thêm quyền mới phải là một thay đổi có migration, không phải việc code tự làm được. Vì
-- vậy file này tồn tại.
--
-- BA MỨC (chủ dự án chốt 2026-07-21, phương án A):
--
--   catalog:read     xem danh mục ở góc quản trị — gồm cả app `draft` mà người dùng
--                    không thấy
--   catalog:manage   tạo và sửa app, redirect URI, feature, metric — nhưng CHỈ ở trạng
--                    thái nháp
--   catalog:publish  đổi trạng thái sang `active`/`inactive`
--
-- VÌ SAO TÁCH `publish` RA RIÊNG: đổi app sang `active` là đưa nó ra trước người dùng và
-- mở một `launch_url` cho họ bấm vào. Đó là hành động có hệ quả bên ngoài, khác hẳn việc
-- sửa mô tả. Người sửa nội dung và người quyết định phát hành không nhất thiết là một.
--
-- Chọn ba mức gộp thay vì tách riêng redirect/feature/metric: đội nhỏ, phân quyền quá mịn
-- chỉ tạo gánh nặng vận hành mà không thêm an toàn thật.

--> statement-breakpoint
-- Bỏ CHECK cũ trước khi thay — không thể sửa CHECK tại chỗ trong PostgreSQL.
ALTER TABLE control_plane.admin_role_permissions
  DROP CONSTRAINT admin_role_permissions_permission_check;

--> statement-breakpoint
ALTER TABLE control_plane.admin_role_permissions
  ADD CONSTRAINT admin_role_permissions_permission_check CHECK (
    permission IN (
      -- P2 — identity, account, phiên, phân quyền, audit
      'account:read',
      'account:disable',
      'account:enable',
      'session:revoke',
      'admin_role:manage',
      'audit:read',
      -- P3 — catalog
      'catalog:read',
      'catalog:manage',
      'catalog:publish'
    )
  );

--> statement-breakpoint
-- Bổ sung ba quyền mới cho role `platform_admin` nếu nó đã tồn tại.
--
-- VÌ SAO CẦN: role này được tạo bởi script bootstrap TRƯỚC khi có catalog. Không có bước
-- này, admin đầu tiên sẽ thiếu đúng ba quyền vừa thêm và không ai cấp được cho họ — chốt
-- chặn leo thang đặc quyền yêu cầu người cấp phải TỰ CÓ quyền đó.
--
-- `WHERE NOT EXISTS` để chạy lại migration không tạo dòng trùng (unique constraint sẽ chặn,
-- nhưng fail migration thì tệ hơn là không làm gì).
INSERT INTO control_plane.admin_role_permissions (id, admin_role_id, permission)
SELECT gen_random_uuid(), r.id, p.permission
FROM control_plane.admin_roles r
CROSS JOIN (VALUES ('catalog:read'), ('catalog:manage'), ('catalog:publish')) AS p(permission)
WHERE r.key = 'platform_admin'
  AND NOT EXISTS (
    SELECT 1 FROM control_plane.admin_role_permissions existing
    WHERE existing.admin_role_id = r.id AND existing.permission = p.permission
  );
