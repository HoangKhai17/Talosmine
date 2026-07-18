import { Controller, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import { type AuthenticatedRequest, WebSessionGuard } from '../identity/web-session.guard.js';
import { AccountService, type OwnAccountView } from './account.service.js';

/**
 * API tài khoản của chính user. Prefix `/v1` do global versioning (main-api.ts).
 *
 * `@UseGuards(WebSessionGuard)`: mọi route ở đây bắt buộc có phiên hợp lệ. accountId đến
 * TỪ guard (resolve session token phía server), KHÔNG từ path/query/body — không có cách
 * nào để một user hỏi account của user khác.
 */
@Controller({ path: 'me/account', version: '1' })
@UseGuards(WebSessionGuard)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  async getOwnAccount(@Req() request: AuthenticatedRequest): Promise<OwnAccountView> {
    // request.auth do WebSessionGuard gắn. Guard đã chặn nếu không có phiên, nên ở đây
    // auth luôn tồn tại; kiểm tra thêm để type-safe và phòng lỗi lập trình.
    const accountId = request.auth?.accountId;
    if (!accountId) {
      throw new NotFoundException('Không xác định được tài khoản.');
    }

    const account = await this.accountService.getOwnAccount(accountId);
    if (!account) {
      // Phiên hợp lệ nhưng account biến mất (bị xóa cứng?) — không xảy ra ở thiết kế hiện
      // tại (account không hard-delete) nhưng xử lý tường minh thay vì trả null mơ hồ.
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }

    return account;
  }
}
