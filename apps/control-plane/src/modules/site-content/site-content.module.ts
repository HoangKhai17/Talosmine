import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { SiteContentAdminController, SiteContentController } from './content-slots.controller.js';
import { ContentSlotsService } from './content-slots.service.js';
import { SiteLogoAdminController, SiteLogoController } from './site-logo.controller.js';
import { SiteLogoService } from './site-logo.service.js';
import { SiteNavController } from './site-nav.controller.js';
import { SiteNavService } from './site-nav.service.js';
import { SiteNavAdminController } from './site-nav-admin.controller.js';
import { SiteSettingsAdminController, SiteSettingsController } from './site-settings.controller.js';
import { SiteSettingsService } from './site-settings.service.js';

/**
 * Module Site Content — sở hữu `nav_menus`, `nav_items`, `nav_item_translations`,
 * `site_settings`, `content_slots`.
 *
 * Import IdentityModule để dùng `WebSessionGuard` và AdminModule để dùng
 * `AdminPermissionGuard`. Cả hai là capability của module khác; module này chỉ tiêu thụ
 * chứ không khai lại provider (modular.md mục 1.2).
 *
 * Mỗi mảng nội dung có một cặp controller công khai / quản trị:
 *   - Công khai: KHÔNG guard, chỉ trả thứ đã hiển thị cho mọi khách
 *   - Quản trị: cần permission `content:*`
 *
 * KHÔNG export gì. Chưa module nào cần tra cứu nội dung site, và mở service ra ngoài là mời
 * module khác ghi vào nội dung mà không đi qua controller có permission guard — đúng bài học
 * đã ghi ở `CatalogModule`.
 */
@Module({
  imports: [IdentityModule, AdminModule],
  controllers: [
    SiteNavController,
    SiteNavAdminController,
    SiteSettingsController,
    SiteSettingsAdminController,
    SiteContentController,
    SiteContentAdminController,
    SiteLogoController,
    SiteLogoAdminController,
  ],
  providers: [SiteNavService, SiteSettingsService, ContentSlotsService, SiteLogoService],
})
export class SiteContentModule {}
