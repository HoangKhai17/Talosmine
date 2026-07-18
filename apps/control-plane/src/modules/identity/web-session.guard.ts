import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { validateSession } from './web-session.js';

/**
 * Header mà BFF forward session token tới Control Plane.
 *
 * Vì sao KHÔNG dùng `Authorization: Bearer`: header đó dành cho M2M JWT của Data Plane
 * (P3+) — xác minh bằng chữ ký, khác hẳn web session token (opaque, tra hash trong DB).
 * Tách hai kênh để không lẫn: session của người dùng qua `X-Session-Token`, service token
 * qua `Authorization`.
 */
const SESSION_HEADER = 'x-session-token';

/** Request đã gắn account sau khi guard xác thực phiên thành công. */
export interface AuthenticatedRequest extends FastifyRequest {
  auth?: { accountId: string; sessionId: string };
}

/**
 * Guard xác thực WEB SESSION cho các endpoint `/v1/me/*`.
 *
 * Nhận session token (BFF forward từ cookie), validate qua Identity, gắn accountId vào
 * request. KHÔNG tin `accountId` do client tự khai — accountId LUÔN đến từ việc resolve
 * session token phía server (modular.md: không tin claim client).
 *
 * Fail-closed: token thiếu / sai / hết hạn / đã thu hồi đều → 401, không phân biệt lý do.
 */
@Injectable()
export class WebSessionGuard implements CanActivate {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const header = request.headers[SESSION_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) {
      throw new UnauthorizedException('Thiếu phiên đăng nhập.');
    }

    const session = await validateSession(this.database.db, token);
    if (!session) {
      throw new UnauthorizedException('Phiên không hợp lệ.');
    }

    request.auth = { accountId: session.accountId, sessionId: session.sessionId };
    return true;
  }
}
