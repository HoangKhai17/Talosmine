import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { SiteNavController } from './site-nav.controller.js';
import { SiteNavService } from './site-nav.service.js';
import { SiteNavAdminController } from './site-nav-admin.controller.js';

/**
 * Module Site Content — sở hữu `nav_menus`, `nav_items`, `nav_item_translations`.
 *
 * Import IdentityModule để dùng `WebSessionGuard` và AdminModule để dùng
 * `AdminPermissionGuard`. Cả hai là capability của module khác; module này chỉ tiêu thụ
 * chứ không khai lại provider (modular.md mục 1.2).
 *
 * Hai controller cho hai đối tượng khác nhau:
 *   - `SiteNavController`      công khai, KHÔNG guard, chỉ mục `active` của một ngôn ngữ
 *   - `SiteNavAdminController` quản trị, mọi trạng thái, cần permission `content:*`
 *
 * KHÔNG export gì. Chưa module nào cần tra cứu điều hướng, và mở `SiteNavService` ra ngoài
 * là mời module khác ghi vào nội dung mà không đi qua controller có permission guard — đúng
 * bài học đã ghi ở `CatalogModule`.
 */
@Module({
  imports: [IdentityModule, AdminModule],
  controllers: [SiteNavController, SiteNavAdminController],
  providers: [SiteNavService],
})
export class SiteContentModule {}
