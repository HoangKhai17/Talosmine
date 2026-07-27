-- Gỡ migration 0010 — bỏ điều hướng site và thu hẹp permission về bộ 9 của P3.
--
-- THỨ TỰ TRONG FILE NÀY QUAN TRỌNG, hai chỗ:
--
--   1. Xoá các dòng permission `content:*` TRƯỚC khi thu hẹp CHECK. Làm ngược lại thì
--      `ADD CONSTRAINT` bị chính dữ liệu đang có từ chối — cùng bẫy đã ghi ở 0009.
--   2. Bỏ `nav_item_translations` TRƯỚC `nav_items`, và `nav_items` trước `nav_menus`.
--      Đi ngược chiều khoá ngoại thì PostgreSQL từ chối, và đó là điều tốt.

--> statement-breakpoint
DELETE FROM control_plane.admin_role_permissions
WHERE permission IN ('content:read', 'content:manage', 'content:publish');

--> statement-breakpoint
ALTER TABLE control_plane.admin_role_permissions
  DROP CONSTRAINT admin_role_permissions_permission_check;

--> statement-breakpoint
-- Bộ permission ở trạng thái cuối P3 (migration 0009).
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
      'catalog:publish'
    )
  );

--> statement-breakpoint
DROP TABLE control_plane.nav_item_translations;

--> statement-breakpoint
DROP TABLE control_plane.nav_items;

--> statement-breakpoint
DROP TABLE control_plane.nav_menus;
