import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { getCorrelationId } from '../../shared/correlation.js';
import { type AuthenticatedRequest, WebSessionGuard } from '../identity/web-session.guard.js';
import { type AdminAccountView, AdminService } from './admin.service.js';
import { AdminPermissionGuard, RequirePermission } from './admin-permission.guard.js';

/** Thân request cho mọi mutation quản trị — `reason` là bắt buộc. */
interface ReasonBody {
  reason?: unknown;
}

/**
 * API quản trị account (modular.md mục 11).
 *
 * Thứ tự guard quan trọng: WebSessionGuard TRƯỚC (xác thực, gắn accountId), rồi
 * AdminPermissionGuard (phân quyền). Đảo thứ tự thì guard sau không có accountId để kiểm.
 */
@Controller({ path: 'admin/accounts', version: '1' })
@UseGuards(WebSessionGuard, AdminPermissionGuard)
export class AdminController {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`, nên
  // DI suy luận theo kiểu sẽ nhận `undefined`. Xem admin-permission.guard.ts.
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get(':accountId')
  @RequirePermission('account:read')
  async getAccount(
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ): Promise<AdminAccountView> {
    const account = await this.adminService.getAccount(accountId);
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }
    return account;
  }

  @Post(':accountId/disable')
  @RequirePermission('account:disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disable(
    @Req() request: AuthenticatedRequest,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() body: ReasonBody,
  ): Promise<void> {
    const changed = await this.adminService.disableAccount(accountId, this.context(request, body));
    if (!changed) {
      throw new NotFoundException('Không tìm thấy tài khoản đang hoạt động.');
    }
  }

  @Post(':accountId/enable')
  @RequirePermission('account:enable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async enable(
    @Req() request: AuthenticatedRequest,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() body: ReasonBody,
  ): Promise<void> {
    const changed = await this.adminService.enableAccount(accountId, this.context(request, body));
    if (!changed) {
      throw new NotFoundException('Không tìm thấy tài khoản đang bị vô hiệu hóa.');
    }
  }

  @Post(':accountId/revoke-sessions')
  @RequirePermission('session:revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSessions(
    @Req() request: AuthenticatedRequest,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() body: ReasonBody,
  ): Promise<void> {
    await this.adminService.revokeAccountSessions(accountId, this.context(request, body));
  }

  /**
   * Dựng ngữ cảnh mutation. Ném 400 nếu thiếu `reason` — mọi thao tác quản trị phải giải
   * thích được, đó là điều kiện để audit có giá trị điều tra sau này.
   */
  private context(request: AuthenticatedRequest, body: ReasonBody) {
    const actorAccountId = request.auth?.accountId;
    if (!actorAccountId) {
      throw new UnauthorizedException('Thiếu phiên đăng nhập.');
    }

    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (reason.length === 0) {
      throw new BadRequestException('Thiếu lý do cho thao tác quản trị.');
    }

    return { actorAccountId, reason, correlationId: getCorrelationId() };
  }
}
