import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SessionService, type SessionView } from './session.service.js';
import { type AuthenticatedRequest, WebSessionGuard } from './web-session.guard.js';

/**
 * API quản lý phiên của chính user — "các thiết bị đang đăng nhập" và nút đăng xuất.
 *
 * Mọi thao tác giới hạn trong account của phiên hiện tại: accountId đến từ guard, và
 * revoke còn kiểm quyền sở hữu trước khi thu hồi.
 */
@Controller({ path: 'me/account/sessions', version: '1' })
@UseGuards(WebSessionGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  async listOwnSessions(@Req() request: AuthenticatedRequest): Promise<SessionView[]> {
    const auth = this.requireAuth(request);
    return this.sessionService.listOwnSessions(auth.accountId, auth.sessionId);
  }

  /**
   * Đăng xuất mọi nơi. Đặt TRƯỚC route `:sessionId` — nếu không, Fastify sẽ khớp "all"
   * như một sessionId và ParseUUIDPipe trả 400 thay vì chạy đúng handler này.
   */
  @Delete('all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAll(@Req() request: AuthenticatedRequest): Promise<void> {
    const auth = this.requireAuth(request);
    await this.sessionService.revokeAllOwnSessions(auth.accountId);
  }

  @Delete(':sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeOne(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    const auth = this.requireAuth(request);

    const revoked = await this.sessionService.revokeOwnSession(auth.accountId, sessionId);
    if (!revoked) {
      // Không phân biệt "không tồn tại" với "của người khác" — tránh dò sessionId hợp lệ.
      throw new NotFoundException('Không tìm thấy phiên.');
    }
  }

  private requireAuth(request: AuthenticatedRequest): { accountId: string; sessionId: string } {
    if (!request.auth) {
      // Guard đã chặn nên nhánh này chỉ xảy ra nếu ai đó gỡ guard — fail-closed thay vì
      // chạy tiếp với accountId undefined.
      throw new UnauthorizedException('Thiếu phiên đăng nhập.');
    }
    return request.auth;
  }
}
