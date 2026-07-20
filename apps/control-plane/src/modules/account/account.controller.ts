import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { listAdminPermissions } from '../admin/admin-authorization.js';
import { type AuthenticatedRequest, WebSessionGuard } from '../identity/web-session.guard.js';
import {
  AccountService,
  type OwnAccountView,
  type UpdateOwnAccountInput,
} from './account.service.js';

/** Giới hạn độ dài để một field tự do không thành kênh nhồi dữ liệu vào DB. */
const MAX_DISPLAY_NAME = 100;
const MAX_LOCALE = 35;
const MAX_TIMEZONE = 64;

interface UpdateBody {
  displayName?: unknown;
  locale?: unknown;
  timezone?: unknown;
}

/**
 * API tài khoản của chính user. Prefix `/v1` do global versioning (main-api.ts).
 *
 * `@UseGuards(WebSessionGuard)`: mọi route ở đây bắt buộc có phiên hợp lệ. accountId đến
 * TỪ guard (resolve session token phía server), KHÔNG từ path/query/body — không có cách
 * nào để một user hỏi account của user khác.
 */
@Controller({ path: 'me', version: '1' })
@UseGuards(WebSessionGuard)
export class AccountController {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`, nên
  // DI suy luận theo kiểu sẽ nhận `undefined`. Xem admin-permission.guard.ts.
  constructor(
    @Inject(AccountService) private readonly accountService: AccountService,
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
  ) {}

  @Get('account')
  async getOwnAccount(@Req() request: AuthenticatedRequest): Promise<OwnAccountView> {
    const accountId = this.requireAccountId(request);

    const account = await this.accountService.getOwnAccount(accountId);
    if (!account) {
      // Phiên hợp lệ nhưng account biến mất (bị xóa cứng?) — không xảy ra ở thiết kế hiện
      // tại (account không hard-delete) nhưng xử lý tường minh thay vì trả null mơ hồ.
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }

    return account;
  }

  /**
   * Sửa hồ sơ của chính mình.
   *
   * Chỉ nhận đúng ba trường trong allowlist. Trường lạ trong body bị BỎ QUA im lặng chứ
   * không gây lỗi — client cũ gửi thừa field vẫn chạy, mà field đó vẫn không có tác dụng.
   */
  @Patch('account')
  async updateOwnAccount(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateBody,
  ): Promise<OwnAccountView> {
    const accountId = this.requireAccountId(request);

    const input: UpdateOwnAccountInput = {};
    if (body.displayName !== undefined) {
      input.displayName = normalizeText(body.displayName, 'displayName', MAX_DISPLAY_NAME);
    }
    if (body.locale !== undefined) {
      input.locale = normalizeText(body.locale, 'locale', MAX_LOCALE);
    }
    if (body.timezone !== undefined) {
      input.timezone = normalizeText(body.timezone, 'timezone', MAX_TIMEZONE);
    }

    const account = await this.accountService.updateOwnAccount(accountId, input);
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }

    return account;
  }

  /**
   * Permission quản trị của chính mình — danh sách rỗng nghĩa là không phải admin.
   *
   * VÌ SAO CẦN: frontend phải biết có hiện khu vực `/admin` hay không. Đây thuần túy là
   * UX — mọi endpoint admin vẫn tự kiểm quyền phía server, nên endpoint này có nói dối
   * cũng không cấp thêm được quyền gì.
   *
   * Đặt ở `/me` chứ không phải `/admin`: nó trả lời về CHÍNH NGƯỜI GỌI, và người chưa
   * phải admin vẫn phải gọi được (để nhận về danh sách rỗng).
   */
  @Get('permissions')
  async getOwnPermissions(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ permissions: string[] }> {
    const accountId = this.requireAccountId(request);
    return { permissions: await listAdminPermissions(this.database.db, accountId) };
  }

  private requireAccountId(request: AuthenticatedRequest): string {
    // request.auth do WebSessionGuard gắn. Guard đã chặn nếu không có phiên, nên ở đây
    // auth luôn tồn tại; kiểm tra thêm để type-safe và phòng lỗi lập trình.
    const accountId = request.auth?.accountId;
    if (!accountId) {
      throw new NotFoundException('Không xác định được tài khoản.');
    }
    return accountId;
  }
}

/**
 * Chuẩn hóa một field text tùy chọn.
 *
 * Chuỗi rỗng (kể cả toàn khoảng trắng) được hiểu là "xóa giá trị" → NULL, chứ không lưu
 * chuỗi rỗng. Nếu không, database sẽ có hai cách biểu diễn cho "không có giá trị" và mọi
 * chỗ đọc đều phải kiểm cả hai.
 */
function normalizeText(value: unknown, field: string, maxLength: number): string | null {
  if (value === null) return null;

  if (typeof value !== 'string') {
    throw new BadRequestException(`Trường \`${field}\` phải là chuỗi.`);
  }

  const trimmed = value.trim();
  if (trimmed === '') return null;

  if (trimmed.length > maxLength) {
    throw new BadRequestException(`Trường \`${field}\` vượt quá ${maxLength} ký tự.`);
  }

  return trimmed;
}
