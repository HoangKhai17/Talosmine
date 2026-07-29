import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Put,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { getCorrelationId } from '../../shared/correlation.js';
import type { AdminMutationContext } from '../admin/admin.service.js';
import { AdminPermissionGuard, RequirePermission } from '../admin/admin-permission.guard.js';
import { type AuthenticatedRequest, WebSessionGuard } from '../identity/web-session.guard.js';
import { SITE_ASSET_MAX_BYTES, SITE_ASSET_MIMES, type SiteAssetMime } from './schema.js';
import { SiteLogoError, SiteLogoService } from './site-logo.service.js';

interface UploadBody {
  mime?: unknown;
  data?: unknown;
  reason?: unknown;
}

/**
 * File logo cho người dùng cuối.
 *
 * KHÔNG GUARD — logo hiển thị công khai trên mọi trang. Trả BYTES kèm đúng Content-Type;
 * đây là endpoint nhị phân duy nhất của Control Plane nên dùng thẳng FastifyReply thay vì
 * đổi cả serializer.
 */
@Controller({ path: 'site/logo', version: '1' })
export class SiteLogoController {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`.
  constructor(@Inject(SiteLogoService) private readonly logo: SiteLogoService) {}

  @Get()
  async get(@Res() reply: FastifyReply): Promise<void> {
    const file = await this.logo.read();
    if (file === null) {
      // 404 là tín hiệu cho BFF rơi về `logo.url` rồi về logo chữ — không phải lỗi.
      throw new NotFoundException('Chưa tải logo nào lên.');
    }

    await reply
      .header('content-type', file.mime)
      // `nosniff` vì đây là bytes do người dùng (admin) tải lên — trình duyệt không được
      // đoán lại kiểu file.
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'public, max-age=60')
      .send(file.data);
  }
}

/** Quản trị logo. `content:manage` — cùng mức với đổi `logo.url`, không có mức publish riêng. */
@Controller({ path: 'admin/site/logo', version: '1' })
@UseGuards(WebSessionGuard, AdminPermissionGuard)
export class SiteLogoAdminController {
  constructor(@Inject(SiteLogoService) private readonly logo: SiteLogoService) {}

  @Put()
  @RequirePermission('content:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async upload(@Req() request: AuthenticatedRequest, @Body() body: UploadBody): Promise<void> {
    const mime = requireMime(body.mime);
    const data = requireBase64(body.data);

    try {
      await this.logo.upload(mime, data, this.context(request, body));
    } catch (error) {
      if (error instanceof SiteLogoError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Delete()
  @RequirePermission('content:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() request: AuthenticatedRequest,
    @Body() body: { reason?: unknown },
  ): Promise<void> {
    await this.logo.remove(this.context(request, body));
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

function requireMime(value: unknown): SiteAssetMime {
  if (typeof value !== 'string' || !(SITE_ASSET_MIMES as readonly string[]).includes(value)) {
    throw new BadRequestException(`\`mime\` phải là một trong: ${SITE_ASSET_MIMES.join(', ')}.`);
  }
  return value as SiteAssetMime;
}

/**
 * Giải mã base64 PHÒNG THỦ: `Buffer.from(..., 'base64')` nuốt ký tự rác thay vì báo lỗi,
 * nên mã hoá ngược lại để đối chiếu — chuỗi không phải base64 hợp lệ bị 400 thay vì lặng
 * lẽ thành một file ảnh hỏng.
 */
function requireBase64(value: unknown): Buffer {
  if (typeof value !== 'string' || value === '') {
    throw new BadRequestException('`data` phải là chuỗi base64.');
  }
  // Chặn payload phi lý TRƯỚC khi decode: 512KB bytes ≈ 700K ký tự base64.
  if (value.length > Math.ceil((SITE_ASSET_MAX_BYTES / 3) * 4) + 8) {
    throw new BadRequestException(`File vượt trần ${SITE_ASSET_MAX_BYTES / 1024}KB.`);
  }

  const data = Buffer.from(value, 'base64');
  if (data.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) {
    throw new BadRequestException('`data` không phải base64 hợp lệ.');
  }
  return data;
}
