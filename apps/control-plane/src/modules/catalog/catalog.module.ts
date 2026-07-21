import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { CatalogAdminController } from './catalog-admin.controller.js';
import { CatalogSubresourceController } from './catalog-subresource.controller.js';
import { FeatureService } from './feature.service.js';
import { RedirectUriService } from './redirect-uri.service.js';

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
  // Thứ tự QUAN TRỌNG: `CatalogAdminController` khai `:applicationId` ở gốc, còn
  // `CatalogSubresourceController` khai các route con dưới nó. Fastify khớp theo thứ tự
  // đăng ký, nên controller cụ thể hơn phải đứng sau — nếu không `/features` sẽ bị khớp
  // thành một `applicationId`.
  controllers: [CatalogController, CatalogAdminController, CatalogSubresourceController],
  providers: [CatalogService, RedirectUriService, FeatureService],
  // Export để P4 (entitlement) dùng lại mà không phải đụng vào bảng của Catalog.
  exports: [CatalogService, FeatureService],
})
export class CatalogModule {}
