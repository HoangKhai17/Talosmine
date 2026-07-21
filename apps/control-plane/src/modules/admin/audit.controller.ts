import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { WebSessionGuard } from '../identity/web-session.guard.js';
import { AdminService, type AuditEventView } from './admin.service.js';
import { AdminPermissionGuard, RequirePermission } from './admin-permission.guard.js';

/**
 * API tra cứu nhật ký kiểm toán.
 *
 * Controller RIÊNG chứ không nhét vào `AdminController`: prefix của controller đó là
 * `admin/accounts`, mà audit không phải tài nguyên con của một account — nó ghi mọi thao
 * tác trên mọi loại đối tượng.
 *
 * CHỈ CÓ ĐƯỜNG ĐỌC. Không có POST/PATCH/DELETE ở đây, và cũng không thể có: bảng
 * `audit_events` bị trigger ở tầng database chặn mọi UPDATE/DELETE, còn runtime role
 * không được cấp quyền TRUNCATE. Ba lớp đó độc lập nhau.
 */
@Controller({ path: 'admin/audit', version: '1' })
@UseGuards(WebSessionGuard, AdminPermissionGuard)
export class AuditController {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`, nên
  // DI suy luận theo kiểu sẽ nhận `undefined`. Xem admin-permission.guard.ts.
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get()
  @RequirePermission('audit:read')
  async list(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('targetId') targetId?: string,
  ): Promise<{ items: AuditEventView[]; nextCursor: string | null }> {
    // Chặn trên 100 vì cùng lý do với tìm kiếm account: một tham số limit tùy ý là cách
    // dễ nhất để biến API tra cứu thành công cụ tải toàn bộ nhật ký.
    const parsed = Number.parseInt(limit ?? '50', 10);
    const safeLimit = Number.isNaN(parsed) ? 50 : Math.min(Math.max(parsed, 1), 100);

    return this.adminService.listAuditEvents({
      limit: safeLimit,
      cursor,
      targetId,
    });
  }
}
