import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { getCorrelationId } from '../../shared/correlation.js';
import type { AdminMutationContext } from '../admin/admin.service.js';
import { AdminPermissionGuard, RequirePermission } from '../admin/admin-permission.guard.js';
import { type AuthenticatedRequest, WebSessionGuard } from '../identity/web-session.guard.js';
import { type AdminApplicationView, CatalogError, CatalogService } from './catalog.service.js';

/** Giới hạn độ dài — một field tự do không được thành kênh nhồi dữ liệu. */
const MAX_KEY = 64;
const MAX_DISPLAY_NAME = 120;
const MAX_DESCRIPTION = 2000;
const MAX_URL = 2048;

/**
 * Mã ứng dụng: chữ thường, số và dấu gạch ngang. Bắt đầu bằng chữ.
 *
 * Hẹp có chủ đích. `key` xuất hiện trong URL, log, policy request và dữ liệu usage — cho
 * phép ký tự lạ sẽ tạo ra vấn đề encoding ở những chỗ không ai ngờ.
 */
const KEY_PATTERN = /^[a-z][a-z0-9-]*$/;

interface CreateBody {
  key?: unknown;
  displayName?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  launchUrl?: unknown;
  reason?: unknown;
}

interface UpdateBody {
  displayName?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  launchUrl?: unknown;
  reason?: unknown;
}

interface StatusBody {
  status?: unknown;
  reason?: unknown;
}

/**
 * API quản trị danh mục ứng dụng (P3).
 *
 * BA MỨC PERMISSION (migration 0009):
 *   `catalog:read`    — xem, gồm cả app `draft` mà người dùng không thấy
 *   `catalog:manage`  — tạo và sửa metadata
 *   `catalog:publish` — đổi trạng thái
 *
 * `publish` tách riêng vì đưa app sang `active` là mở một `launch_url` cho người dùng bấm
 * vào — hành động có hệ quả bên ngoài, khác hẳn việc sửa mô tả.
 */
@Controller({ path: 'admin/catalog/applications', version: '1' })
@UseGuards(WebSessionGuard, AdminPermissionGuard)
export class CatalogAdminController {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`.
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermission('catalog:read')
  async list(): Promise<AdminApplicationView[]> {
    return this.catalog.listForAdmin();
  }

  @Get(':applicationId')
  @RequirePermission('catalog:read')
  async get(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ): Promise<AdminApplicationView> {
    const application = await this.catalog.getForAdmin(applicationId);
    if (!application) throw new NotFoundException('Không tìm thấy ứng dụng.');
    return application;
  }

  @Post()
  @RequirePermission('catalog:manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateBody,
  ): Promise<{ id: string }> {
    const key = requireKey(body.key);
    const displayName = requireText(body.displayName, 'displayName', MAX_DISPLAY_NAME);
    const launchUrl = requireText(body.launchUrl, 'launchUrl', MAX_URL);

    try {
      const id = await this.catalog.create(
        {
          key,
          displayName,
          description: optionalText(body.description, 'description', MAX_DESCRIPTION),
          imageUrl: optionalText(body.imageUrl, 'imageUrl', MAX_URL),
          launchUrl,
        },
        this.context(request, body),
      );
      return { id };
    } catch (error) {
      throw toHttp(error);
    }
  }

  @Patch(':applicationId')
  @RequirePermission('catalog:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() body: UpdateBody,
  ): Promise<void> {
    // `key` KHÔNG có trong danh sách sửa được, và cố ý không báo lỗi nếu client gửi lên —
    // trường lạ bị bỏ qua im lặng, giống PATCH của account.
    const input: Parameters<CatalogService['update']>[1] = {};

    if (body.displayName !== undefined) {
      input.displayName = requireText(body.displayName, 'displayName', MAX_DISPLAY_NAME);
    }
    if (body.description !== undefined) {
      input.description = optionalText(body.description, 'description', MAX_DESCRIPTION);
    }
    if (body.launchUrl !== undefined) {
      input.launchUrl = requireText(body.launchUrl, 'launchUrl', MAX_URL);
    }
    if (body.imageUrl !== undefined) {
      input.imageUrl = optionalText(body.imageUrl, 'imageUrl', MAX_URL);
    }

    try {
      await this.catalog.update(applicationId, input, this.context(request, body));
    } catch (error) {
      throw toHttp(error);
    }
  }

  @Post(':applicationId/status')
  @RequirePermission('catalog:publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeStatus(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() body: StatusBody,
  ): Promise<void> {
    // Chỉ nhận `active` và `inactive`: `draft` không phải đích hợp lệ của bất kỳ chuyển
    // tiếp nào (xem `isValidContentTransition`).
    const status = body.status;
    if (status !== 'active' && status !== 'inactive') {
      throw new BadRequestException('`status` phải là `active` hoặc `inactive`.');
    }

    try {
      await this.catalog.changeStatus(applicationId, status, this.context(request, body));
    } catch (error) {
      throw toHttp(error);
    }
  }

  /** Actor lấy TỪ GUARD (resolve session phía server); reason lấy từ body và bắt buộc. */
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

/**
 * Map lỗi nghiệp vụ sang HTTP.
 *
 * `INVALID_URL` trả 400 kèm thông điệp CỤ THỂ (host chưa allowlist / không phải https /
 * có userinfo). Đây là màn hình quản trị: người dùng là người vận hành đã có quyền, và
 * thông điệp mơ hồ chỉ khiến họ thử mò.
 */
function toHttp(error: unknown): Error {
  if (!(error instanceof CatalogError)) return error as Error;

  switch (error.code) {
    case 'NOT_FOUND':
      return new NotFoundException(error.message);
    case 'KEY_TAKEN':
      return new ConflictException(error.message);
    case 'KEY_IMMUTABLE':
    case 'INVALID_URL':
    case 'INVALID_STATUS_TRANSITION':
      return new BadRequestException(error.message);
  }
}

function requireKey(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('`key` phải là chuỗi.');
  }
  const key = value.trim().toLowerCase();

  if (key.length === 0 || key.length > MAX_KEY) {
    throw new BadRequestException(`\`key\` phải dài 1–${MAX_KEY} ký tự.`);
  }
  if (!KEY_PATTERN.test(key)) {
    throw new BadRequestException(
      '`key` chỉ gồm chữ thường, số và dấu gạch ngang, bắt đầu bằng chữ.',
    );
  }
  return key;
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`\`${field}\` phải là chuỗi.`);
  }
  const text = value.trim();
  if (text === '') throw new BadRequestException(`Thiếu \`${field}\`.`);
  if (text.length > max) {
    throw new BadRequestException(`\`${field}\` vượt quá ${max} ký tự.`);
  }
  return text;
}

/**
 * Trường tuỳ chọn.
 *
 * `undefined` (không gửi) và `null` (gửi tường minh) đều cho ra NULL. Chuỗi rỗng cũng vậy —
 * nếu không, database sẽ có hai cách biểu diễn cho "không có giá trị".
 */
function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(`\`${field}\` phải là chuỗi hoặc null.`);
  }
  const text = value.trim();
  if (text === '') return null;
  if (text.length > max) {
    throw new BadRequestException(`\`${field}\` vượt quá ${max} ký tự.`);
  }
  return text;
}
