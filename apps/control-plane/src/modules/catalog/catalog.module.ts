import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { CatalogAdminController } from './catalog-admin.controller.js';

/**
 * Module Catalog (P3) — sở hữu `applications`, `application_redirect_uris`, `features`,
 * `usage_metrics` và `service_identities`.
 *
 * Import IdentityModule để dùng `WebSessionGuard`, AdminModule để dùng
 * `AdminPermissionGuard` — cả hai là capability của module khác, Catalog chỉ tiêu thụ
 * chứ không khai lại provider (modular.md: ranh giới module).
 *
 * Hai controller tách biệt vì hai đối tượng khác nhau:
 *   - `CatalogController`      người dùng cuối, chỉ app `active`
 *   - `CatalogAdminController` quản trị, mọi trạng thái, cần permission
 */
@Module({
  imports: [IdentityModule, AdminModule],
  controllers: [CatalogController, CatalogAdminController],
  providers: [CatalogService],
  // Export để P4 (entitlement) dùng lại mà không phải đụng vào bảng của Catalog.
  exports: [CatalogService],
})
export class CatalogModule {}
