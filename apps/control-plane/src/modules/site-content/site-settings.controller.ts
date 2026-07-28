import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { getCorrelationId } from '../../shared/correlation.js';
import type { AdminMutationContext } from '../admin/admin.service.js';
import { AdminPermissionGuard, RequirePermission } from '../admin/admin-permission.guard.js';
import { type AuthenticatedRequest, WebSessionGuard } from '../identity/web-session.guard.js';
import { SiteNavError } from './site-nav.service.js';
import { SiteSettingsService, type SiteSettingsView } from './site-settings.service.js';

const MAX_URL = 2048;

interface UpdateBody {
  logoUrl?: unknown;
  reason?: unknown;
}

/**
 * Cài đặt site cho người dùng cuối.
 *
 * KHÔNG GUARD — cùng lý do với `SiteNavController`: logo nằm trên header của mọi trang, kể cả
 * với khách chưa đăng nhập. Dữ liệu trả về đúng bằng thứ đã hiển thị công khai.
 */
@Controller({ path: 'site/settings', version: '1' })
export class SiteSettingsController {
  constructor(@Inject(SiteSettingsService) private readonly settings: SiteSettingsService) {}

  @Get()
  async get(): Promise<SiteSettingsView> {
    return this.settings.read();
  }
}

/**
 * Cài đặt site cho quản trị.
 *
 * KHÔNG có mức `publish` riêng như mục điều hướng: một cài đặt chỉ có hai trạng thái — đã đặt
 * hoặc chưa. Không có bản nháp để duyệt, nên tách `manage`/`publish` ở đây chỉ thêm một bước
 * bấm mà không thêm phép kiểm nào.
 */
@Controller({ path: 'admin/site/settings', version: '1' })
@UseGuards(WebSessionGuard, AdminPermissionGuard)
export class SiteSettingsAdminController {
  constructor(@Inject(SiteSettingsService) private readonly settings: SiteSettingsService) {}

  @Get()
  @RequirePermission('content:read')
  async get(): Promise<SiteSettingsView> {
    return this.settings.read();
  }

  @Patch()
  @RequirePermission('content:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(@Req() request: AuthenticatedRequest, @Body() body: UpdateBody): Promise<void> {
    const input: { logoUrl?: string | null } = {};

    if (body.logoUrl !== undefined) {
      input.logoUrl = optionalUrl(body.logoUrl);
    }

    try {
      await this.settings.update(input, this.context(request, body));
    } catch (error) {
      throw toHttp(error);
    }
  }

  /** Actor lấy TỪ GUARD; reason lấy từ body và bắt buộc. */
  private context(request: AuthenticatedRequest, body: { reason?: unknown }): AdminMutationContext {
    const actorAccountId = request.auth?.accountId;
    if (!actorAccountId) {
      throw new UnauthorizedException('Thiếu phiên đăng nhập.');
    }

    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (reason === '') {
      throw new BadRequestException('Thiếu `reason`. Mọi thao tác quản trị phải nêu lý do.');
    }

    return { actorAccountId, reason, correlationId: getCorrelationId() };
  }
}

function toHttp(error: unknown): Error {
  if (!(error instanceof SiteNavError)) return error as Error;
  return error.code === 'NOT_FOUND'
    ? new NotFoundException(error.message)
    : new BadRequestException(error.message);
}

/**
 * `null` và chuỗi rỗng đều cho ra `null` — cùng quy ước với `optionalText` của catalog: nếu
 * không, database sẽ có hai cách biểu diễn cho "chưa đặt".
 */
function optionalUrl(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException('`logoUrl` phải là chuỗi hoặc null.');
  }
  const text = value.trim();
  if (text === '') return null;
  if (text.length > MAX_URL) {
    throw new BadRequestException(`\`logoUrl\` vượt quá ${MAX_URL} ký tự.`);
  }
  return text;
}
