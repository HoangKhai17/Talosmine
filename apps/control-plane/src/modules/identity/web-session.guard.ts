import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { csrfTokenMatches, validateSession } from './web-session.js';

/**
 * Header mà BFF forward session token tới Control Plane.
 *
 * Vì sao KHÔNG dùng `Authorization: Bearer`: header đó dành cho M2M JWT của Data Plane
 * (P3+) — xác minh bằng chữ ký, khác hẳn web session token (opaque, tra hash trong DB).
 * Tách hai kênh để không lẫn: session của người dùng qua `X-Session-Token`, service token
 * qua `Authorization`.
 */
const SESSION_HEADER = 'x-session-token';

/** Header mang CSRF token cho request ghi dữ liệu. */
const CSRF_HEADER = 'x-csrf-token';

/**
 * Method KHÔNG làm thay đổi trạng thái — theo định nghĩa của HTTP.
 *
 * Chỉ những method ngoài danh sách này mới bị bắt buộc có CSRF token. Ép CSRF lên cả GET
 * vừa vô nghĩa (GET không được đổi dữ liệu) vừa làm request đọc phức tạp không cần thiết.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
 * Fail-closed: token thiếu / sai / hết hạn / đã thu hồi / account bị khóa đều → 401,
 * không phân biệt lý do.
 *
 * LỚP THỨ HAI CHỐNG CSRF: mọi request ghi dữ liệu phải kèm CSRF token khớp với phiên.
 * Lớp thứ nhất nằm ở BFF (đối chiếu header với cookie). Vì sao cần cả hai: nếu chỉ chặn
 * ở BFF, bất cứ đường nào chạm thẳng Control Plane sẽ bỏ qua toàn bộ bảo vệ.
 */
@Injectable()
export class WebSessionGuard implements CanActivate {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = readHeader(request, SESSION_HEADER);
    if (!token) {
      throw new UnauthorizedException('Thiếu phiên đăng nhập.');
    }

    const session = await validateSession(this.database.db, token);
    if (!session) {
      throw new UnauthorizedException('Phiên không hợp lệ.');
    }

    if (!SAFE_METHODS.has(request.method.toUpperCase())) {
      const csrfToken = readHeader(request, CSRF_HEADER);
      // 403 chứ không 401: phiên HỢP LỆ, chỉ là request không chứng minh được nó do
      // chính trang của ta phát ra. Trả 401 sẽ khiến client tưởng cần đăng nhập lại.
      if (!csrfToken) {
        throw new ForbiddenException('Thiếu CSRF token.');
      }
      if (!csrfTokenMatches(csrfToken, session.csrfTokenHash)) {
        throw new ForbiddenException('CSRF token không hợp lệ.');
      }
    }

    request.auth = { accountId: session.accountId, sessionId: session.sessionId };
    return true;
  }
}

function readHeader(request: FastifyRequest, name: string): string | undefined {
  const raw = request.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}
