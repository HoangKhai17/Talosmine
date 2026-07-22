import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { CatalogAdminController } from './catalog-admin.controller.js';
import { CATALOG_LOOKUP_PORT } from './catalog-lookup.port.js';
import { CatalogLookupService } from './catalog-lookup.service.js';
import { CatalogSubresourceController } from './catalog-subresource.controller.js';
import { FeatureService } from './feature.service.js';
import { RedirectUriService } from './redirect-uri.service.js';

/**
 * Module Application Catalog (P3) — sở hữu `applications`, `application_redirect_uris`,
 * `features` và `usage_metrics`.
 *
 * `service_identities` KHÔNG còn thuộc module này: nó có module riêng
 * (`modules/service-identity`) vì P4 sẽ mở rộng chính nó. Ràng buộc khoá ngoại vẫn trỏ tới
 * `applications`, nên phụ thuộc là MỘT CHIỀU — service-identity biết Catalog, không ngược lại.
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
  providers: [
    CatalogService,
    RedirectUriService,
    FeatureService,
    // Cổng khai bằng TOKEN, không phải bằng class: consumer phụ thuộc vào hợp đồng
    // (`CatalogLookupPort`), không phụ thuộc vào cách hiện thực nó.
    { provide: CATALOG_LOOKUP_PORT, useClass: CatalogLookupService },
  ],
  /**
   * CHỈ export cổng tra cứu.
   *
   * Trước đây file này export cả `CatalogService` và `FeatureService` "để P4 dùng lại" —
   * nhưng hai lớp đó mang cả đường GHI (tạo, sửa, đổi trạng thái) kèm audit và RBAC riêng
   * của Catalog. Mở chúng ra ngoài là mời module khác ghi vào danh mục mà không đi qua
   * controller có permission guard.
   *
   * P4 cần TRA CỨU, không cần ghi. Cổng cho đúng chừng đó.
   */
  exports: [CATALOG_LOOKUP_PORT],
})
export class CatalogModule {}
