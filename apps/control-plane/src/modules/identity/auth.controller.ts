import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { provisionByExternalIdentity } from './account-provisioning.js';
import { verifyIdToken } from './oidc-verifier.js';
import { type AuthenticatedRequest, WebSessionGuard } from './web-session.guard.js';
import { createWebSession, revokeSession } from './web-session.js';

interface ExchangeBody {
  idToken?: unknown;
}

interface ExchangeResult {
  sessionToken: string;
  csrfToken: string;
  expiresAt: string;
  accountId: string;
  /** true nếu account vừa được tạo lần đầu (hữu ích cho onboarding UX). */
  created: boolean;
}

/**
 * Đổi ID token (do IdP phát) lấy phiên đăng nhập của Talosmine.
 *
 * ĐÂY LÀ CẦU NỐI giữa OIDC bên ngoài và session nội bộ:
 *   BFF chạy luồng OIDC → nhận id_token → gọi endpoint này → nhận session token của TA
 *
 * VÌ SAO KHÔNG dùng session của SDK IdP: nửa A đã có `web_sessions` với thu hồi, liệt kê
 * và audit. Hai hệ thống session song song sẽ làm trang "phiên của tôi" và nút thu hồi
 * của admin không nhìn thấy phiên thật.
 *
 * BẢO MẬT: Control Plane **tự verify chữ ký** id_token. Nó KHÔNG nhận `issuer`/`subject`
 * hay `accountId` do caller khai — mọi danh tính đều đến từ token đã chứng thực.
 */
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  async exchange(@Body() body: ExchangeBody): Promise<ExchangeResult> {
    const idToken = typeof body?.idToken === 'string' ? body.idToken : '';
    if (!idToken) {
      throw new BadRequestException('Thiếu idToken.');
    }

    let claims: Awaited<ReturnType<typeof verifyIdToken>>;
    try {
      claims = await verifyIdToken(idToken);
    } catch (err) {
      // Log chi tiết phía server để điều tra; trả về thông điệp chung để không tiết lộ
      // token sai ở điểm nào (hết hạn / sai chữ ký / sai audience).
      this.logger.warn(
        `Xác minh ID token thất bại: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new UnauthorizedException('Token không hợp lệ.');
    }

    // Tạo (hoặc lấy) account từ danh tính đã xác minh — logic race-safe của nửa A.
    const { accountId, created } = await provisionByExternalIdentity(
      this.database.db,
      { issuer: claims.issuer, subject: claims.subject },
      {
        displayName: claims.name,
        email: claims.email,
        emailVerified: claims.emailVerified,
      },
    );

    // Phiên 7 ngày. Hạn tuyệt đối tính bằng DB clock trong createWebSession.
    const session = await createWebSession(this.database.db, accountId, {
      ttlSeconds: 60 * 60 * 24 * 7,
    });

    return {
      sessionToken: session.sessionToken,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt.toISOString(),
      accountId,
      created,
    };
  }

  /**
   * Đăng xuất — thu hồi ĐÚNG phiên đang dùng để gọi request này.
   *
   * `sessionId` đến từ guard (resolve từ token), không phải từ body. Nhờ vậy không ai
   * đăng xuất hộ người khác được, và BFF không cần biết session id là gì.
   *
   * Khác `DELETE /v1/me/account/sessions/all` ("đăng xuất mọi thiết bị"): đây chỉ là
   * thiết bị hiện tại.
   */
  @Delete('sessions/current')
  @UseGuards(WebSessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: AuthenticatedRequest): Promise<void> {
    const auth = request.auth;
    if (!auth) {
      // Không tới được: guard đã chặn. Kiểm tra để type hẹp lại mà không dùng `!`.
      throw new UnauthorizedException('Thiếu phiên đăng nhập.');
    }
    await revokeSession(this.database.db, auth.sessionId, 'user logout');
  }
}
