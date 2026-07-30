import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { getCorrelationId } from '../../shared/correlation.js';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { accounts } from '../account/schema.js';
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
        { correlationId: getCorrelationId() },
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

    // CỬA CHẶN: account bị khóa KHÔNG được cấp phiên mới.
    //
    // Thiếu bước này thì `disable` vô tác dụng: nó thu hồi mọi phiên hiện có, nhưng người
    // bị khóa chỉ cần đăng nhập lại là có phiên mới — vì xác thực nằm ở Logto, mà Logto
    // không biết gì về trạng thái account bên ta.
    const status = await this.readAccountStatus(accountId);
    if (status !== 'active') {
      // Thông điệp CHUNG cho mọi trạng thái không active. Nói rõ "bị khóa" hay "chờ duyệt"
      // là tiết lộ trạng thái account cho người chưa chứng minh được quyền biết điều đó.
      throw new ForbiddenException('Tài khoản không sử dụng được. Vui lòng liên hệ hỗ trợ.');
    }

    // Phiên 7 ngày. Hạn tuyệt đối tính bằng DB clock trong createWebSession.
    const session = await createWebSession(this.database.db, accountId, {
      ttlSeconds: 60 * 60 * 24 * 7,
    });

    // B3 (`pending-work.md`) — "callback outcome" phía Control Plane: nối được với log
    // cùng tên ở BFF (`auth/callback/route.ts`) qua correlationId chung của lượt đăng nhập.
    this.logger.log(
      { correlationId: getCorrelationId(), accountId, created },
      'Phiên đăng nhập mới được tạo',
    );

    return {
      sessionToken: session.sessionToken,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt.toISOString(),
      accountId,
      created,
    };
  }

  /** Đọc trạng thái account. Tách hàm riêng để cửa chặn ở trên đọc gọn một dòng. */
  private async readAccountStatus(accountId: string): Promise<string | undefined> {
    const rows = await this.database.db
      .select({ status: accounts.status })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    return rows[0]?.status;
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

    // B3 (`pending-work.md`) — "session revoke": nối với log cùng tên ở BFF
    // (`auth/logout/route.ts`) qua correlationId chung của lượt đăng xuất này.
    this.logger.log(
      { correlationId: getCorrelationId(), accountId: auth.accountId, sessionId: auth.sessionId },
      'Phiên đã bị thu hồi (đăng xuất)',
    );
  }
}
