import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { getCorrelationId } from '../../shared/correlation.js';
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
  private readonly logger = new Logger(SessionController.name);

  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`, nên
  // DI suy luận theo kiểu sẽ nhận `undefined`. Xem admin-permission.guard.ts.
  constructor(@Inject(SessionService) private readonly sessionService: SessionService) {}

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
    const count = await this.sessionService.revokeAllOwnSessions(auth.accountId);

    // B3 (`pending-work.md`) — "session revoke": nhánh "đăng xuất mọi nơi" tự người dùng bấm.
    this.logger.log(
      { correlationId: getCorrelationId(), accountId: auth.accountId, revokedCount: count },
      'Đã thu hồi mọi phiên của account (đăng xuất mọi nơi)',
    );
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

    // B3 (`pending-work.md`) — "session revoke": nhánh thu hồi MỘT phiên cụ thể (ví dụ từ
    // trang "các thiết bị đang đăng nhập").
    this.logger.log(
      { correlationId: getCorrelationId(), accountId: auth.accountId, sessionId },
      'Đã thu hồi một phiên theo yêu cầu của chính chủ',
    );
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
