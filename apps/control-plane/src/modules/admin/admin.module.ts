import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AdminPermissionGuard } from './admin-permission.guard.js';
import { AuditController } from './audit.controller.js';
import { RbacController } from './rbac.controller.js';
import { RbacService } from './rbac.service.js';

/**
 * Module Admin — RBAC và API quản trị (modular.md mục 11.7).
 *
 * Import IdentityModule để dùng WebSessionGuard. Admin điều phối qua hàm public của module
 * khác (ví dụ thu hồi phiên của Identity), không đụng repository/table của chúng.
 */
@Module({
  imports: [IdentityModule],
  controllers: [AdminController, AuditController, RbacController],
  providers: [AdminService, RbacService, AdminPermissionGuard],
})
export class AdminModule {}
