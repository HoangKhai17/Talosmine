import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import type { AuthenticatedRequest } from '../identity/web-session.guard.js';
import { hasAdminPermission } from './admin-authorization.js';
import type { AdminPermission } from './schema.js';

const REQUIRED_PERMISSION = 'talosmine:required-permission';

/** Khai báo permission bắt buộc cho một route admin. */
export const RequirePermission = (permission: AdminPermission) =>
  SetMetadata(REQUIRED_PERMISSION, permission);

/**
 * Guard phân quyền quản trị — DENY-BY-DEFAULT.
 *
 * Chạy SAU WebSessionGuard (thứ tự trong `@UseGuards`) nên đã có accountId từ phiên.
 *
 * Hai lớp deny quan trọng:
 *   1. Route admin KHÔNG khai `@RequirePermission` → TỪ CHỐI. Quên khai báo là lỗi lập
 *      trình, và mặc định phải nghiêng về an toàn, không phải mở cửa.
 *   2. Có phiên nhưng thiếu permission → 403 (khác 401 "chưa đăng nhập").
 */
@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<AdminPermission | undefined>(
      REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      // Deny-by-default: route admin không khai permission thì không ai vào được.
      throw new ForbiddenException('Route quản trị chưa khai báo quyền yêu cầu.');
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accountId = request.auth?.accountId;
    if (!accountId) {
      throw new UnauthorizedException('Thiếu phiên đăng nhập.');
    }

    const allowed = await hasAdminPermission(this.database.db, accountId, required);
    if (!allowed) {
      // Không nêu thiếu quyền nào cụ thể — tránh vẽ bản đồ phân quyền cho kẻ dò.
      throw new ForbiddenException('Không đủ quyền quản trị.');
    }

    return true;
  }
}
