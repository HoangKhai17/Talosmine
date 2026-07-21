import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
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
import type { AdminMutationContext } from './admin.service.js';
import { AdminPermissionGuard, RequirePermission } from './admin-permission.guard.js';
import {
  type AdminAssignmentView,
  type AdminRoleView,
  RbacError,
  RbacService,
} from './rbac.service.js';

interface AssignBody {
  roleId?: unknown;
  accountId?: unknown;
  reason?: unknown;
  validUntil?: unknown;
}

interface ReasonBody {
  reason?: unknown;
}

/**
 * API vai trò và phân quyền quản trị.
 *
 * MỌI route đều cần `admin_role:manage` — kể cả đường đọc. Biết ai đang có quyền gì là
 * thông tin nhạy cảm: nó cho biết nên tấn công tài khoản nào.
 */
@Controller({ path: 'admin/rbac', version: '1' })
@UseGuards(WebSessionGuard, AdminPermissionGuard)
export class RbacController {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`.
  constructor(@Inject(RbacService) private readonly rbacService: RbacService) {}

  @Get('roles')
  @RequirePermission('admin_role:manage')
  async listRoles(): Promise<AdminRoleView[]> {
    return this.rbacService.listRoles();
  }

  @Get('permissions')
  @RequirePermission('admin_role:manage')
  listPermissions(): { permissions: readonly string[] } {
    return { permissions: this.rbacService.listPermissionCatalog() };
  }

  @Get('assignments')
  @RequirePermission('admin_role:manage')
  async listAssignments(): Promise<AdminAssignmentView[]> {
    return this.rbacService.listAssignments();
  }

  @Post('assignments')
  @RequirePermission('admin_role:manage')
  @HttpCode(HttpStatus.CREATED)
  async assign(
    @Req() request: AuthenticatedRequest,
    @Body() body: AssignBody,
  ): Promise<{ id: string }> {
    const roleId = requireUuid(body.roleId, 'roleId');
    const accountId = requireUuid(body.accountId, 'accountId');

    const validUntil = body.validUntil === undefined ? undefined : String(body.validUntil);
    if (validUntil !== undefined && Number.isNaN(Date.parse(validUntil))) {
      throw new BadRequestException('`validUntil` không phải thời điểm hợp lệ.');
    }

    try {
      const id = await this.rbacService.assignRole(
        { roleId, accountId, validUntil },
        this.context(request, body),
      );
      return { id };
    } catch (error) {
      throw this.toHttp(error);
    }
  }

  @Delete('assignments/:assignmentId')
  @RequirePermission('admin_role:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Req() request: AuthenticatedRequest,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: ReasonBody,
  ): Promise<void> {
    try {
      await this.rbacService.revokeAssignment(assignmentId, this.context(request, body));
    } catch (error) {
      throw this.toHttp(error);
    }
  }

  /**
   * Dựng ngữ cảnh mutation: actor lấy TỪ GUARD (resolve session phía server), reason lấy
   * từ body và BẮT BUỘC không rỗng.
   */
  private context(request: AuthenticatedRequest, body: ReasonBody): AdminMutationContext {
    const actorAccountId = request.auth?.accountId;
    if (!actorAccountId) {
      // Không tới được: guard đã chặn. Kiểm để type hẹp lại mà không dùng `!`.
      throw new UnauthorizedException('Thiếu phiên đăng nhập.');
    }

    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (reason === '') {
      throw new BadRequestException('Thiếu `reason`. Mọi thao tác quản trị phải nêu lý do.');
    }

    return { actorAccountId, reason, correlationId: getCorrelationId() };
  }

  /**
   * Map lỗi nghiệp vụ sang HTTP.
   *
   * `PRIVILEGE_ESCALATION` trả 403 chứ không 400: đây không phải dữ liệu sai định dạng mà
   * là hành động bị từ chối vì thiếu quyền.
   */
  private toHttp(error: unknown): Error {
    if (!(error instanceof RbacError)) return error as Error;

    switch (error.code) {
      case 'ROLE_NOT_FOUND':
      case 'ACCOUNT_NOT_FOUND':
      case 'ASSIGNMENT_NOT_FOUND':
        return new NotFoundException(error.message);
      case 'ALREADY_ASSIGNED':
        return new ConflictException(error.message);
      case 'ROLE_INACTIVE':
        return new BadRequestException(error.message);
      case 'PRIVILEGE_ESCALATION':
        return new ForbiddenException(error.message);
    }
  }
}

function requireUuid(value: unknown, field: string): string {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new BadRequestException(`\`${field}\` phải là UUID hợp lệ.`);
  }
  return value;
}
