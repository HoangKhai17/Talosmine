-- Gỡ migration 0009 — thu hẹp permission catalog về bộ 6 của P2.
--
-- Thứ tự trong file này quan trọng: PHẢI xoá các dòng permission catalog TRƯỚC khi thu hẹp
-- ràng buộc CHECK. Làm ngược lại thì `ADD CONSTRAINT` bị chính dữ liệu đang có từ chối.

--> statement-breakpoint
DELETE FROM control_plane.admin_role_permissions
WHERE permission IN ('catalog:read', 'catalog:manage', 'catalog:publish');

--> statement-breakpoint
ALTER TABLE control_plane.admin_role_permissions
  DROP CONSTRAINT admin_role_permissions_permission_check;

--> statement-breakpoint
-- Bộ permission nguyên bản của migration 0005.
ALTER TABLE control_plane.admin_role_permissions
  ADD CONSTRAINT admin_role_permissions_permission_check CHECK (
    permission IN (
      'account:read',
      'account:disable',
      'account:enable',
      'session:revoke',
      'admin_role:manage',
      'audit:read'
    )
  );
