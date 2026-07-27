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
import { NAV_MENU_KEYS, type NavMenuKey } from './schema.js';
import {
  type AdminNavItemView,
  type NavLabelsInput,
  SiteNavError,
  SiteNavService,
} from './site-nav.service.js';

/** Giới hạn độ dài — một field tự do không được thành kênh nhồi dữ liệu. */
const MAX_LABEL = 120;
const MAX_HREF = 2048;
/** Chặn payload reorder phi lý trước khi nó chạm database. */
const MAX_REORDER_ITEMS = 200;

interface CreateBody {
  menuKey?: unknown;
  href?: unknown;
  labels?: unknown;
  sortOrder?: unknown;
  reason?: unknown;
}

interface UpdateBody {
  href?: unknown;
  labels?: unknown;
  reason?: unknown;
}

interface StatusBody {
  status?: unknown;
  reason?: unknown;
}

interface ReorderBody {
  menuKey?: unknown;
  itemIds?: unknown;
  reason?: unknown;
}

/**
 * API quản trị điều hướng site.
 *
 * BA MỨC PERMISSION (migration 0010), cùng khuôn với catalog:
 *   `content:read`    xem, gồm cả mục `draft` mà người dùng không thấy
 *   `content:manage`  thêm/sửa/xoá/sắp xếp
 *   `content:publish` đổi trạng thái
 *
 * `publish` tách riêng vì đưa một mục sang `active` là đặt nó lên header/footer của MỌI
 * trang, cho MỌI khách. Người sửa nhãn và người quyết định phát hành không nhất thiết là một.
 */
@Controller({ path: 'admin/site/nav', version: '1' })
@UseGuards(WebSessionGuard, AdminPermissionGuard)
export class SiteNavAdminController {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`.
  constructor(@Inject(SiteNavService) private readonly nav: SiteNavService) {}

  @Get()
  @RequirePermission('content:read')
  async list(): Promise<AdminNavItemView[]> {
    return this.nav.listForAdmin();
  }

  /**
   * `reorder` khai TRƯỚC `:navItemId` — Fastify khớp route theo thứ tự đăng ký, nên nếu
   * `:navItemId` đứng trước thì `/reorder` sẽ bị nuốt thành một id (rồi fail ở ParseUUIDPipe).
   * Cùng bẫy đã ghi ở `CatalogModule`.
   */
  @Post('reorder')
  @RequirePermission('content:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(@Req() request: AuthenticatedRequest, @Body() body: ReorderBody): Promise<void> {
    const menuKey = requireMenuKey(body.menuKey);
    const itemIds = requireUuidList(body.itemIds);

    try {
      await this.nav.reorder(menuKey, itemIds, this.context(request, body));
    } catch (error) {
      throw toHttp(error);
    }
  }

  @Post()
  @RequirePermission('content:manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateBody,
  ): Promise<{ id: string }> {
    const menuKey = requireMenuKey(body.menuKey);
    const href = requireText(body.href, 'href', MAX_HREF);
    const labels = requireLabels(body.labels);

    try {
      const id = await this.nav.create(
        {
          menuKey,
          href,
          labels,
          ...(body.sortOrder !== undefined ? { sortOrder: requireSortOrder(body.sortOrder) } : {}),
        },
        this.context(request, body),
      );
      return { id };
    } catch (error) {
      throw toHttp(error);
    }
  }

  @Patch(':navItemId')
  @RequirePermission('content:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('navItemId', ParseUUIDPipe) navItemId: string,
    @Body() body: UpdateBody,
  ): Promise<void> {
    // `menuKey` và `status` KHÔNG có trong danh sách sửa được; client gửi lên thì bị bỏ qua
    // im lặng, giống PATCH của account và của catalog.
    const input: Parameters<SiteNavService['update']>[1] = {};

    if (body.href !== undefined) input.href = requireText(body.href, 'href', MAX_HREF);
    if (body.labels !== undefined) input.labels = requireLabels(body.labels, { allowEmpty: true });

    try {
      await this.nav.update(navItemId, input, this.context(request, body));
    } catch (error) {
      throw toHttp(error);
    }
  }

  @Post(':navItemId/status')
  @RequirePermission('content:publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeStatus(
    @Req() request: AuthenticatedRequest,
    @Param('navItemId', ParseUUIDPipe) navItemId: string,
    @Body() body: StatusBody,
  ): Promise<void> {
    // Chỉ nhận `active`/`inactive`: `draft` không phải đích hợp lệ của chuyển tiếp nào.
    const status = body.status;
    if (status !== 'active' && status !== 'inactive') {
      throw new BadRequestException('`status` phải là `active` hoặc `inactive`.');
    }

    try {
      await this.nav.changeStatus(navItemId, status, this.context(request, body));
    } catch (error) {
      throw toHttp(error);
    }
  }

  @Delete(':navItemId')
  @RequirePermission('content:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('navItemId', ParseUUIDPipe) navItemId: string,
    @Body() body: { reason?: unknown },
  ): Promise<void> {
    try {
      await this.nav.remove(navItemId, this.context(request, body));
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
 * `INVALID_HREF` trả 400 kèm thông điệp CỤ THỂ (bắt đầu bằng `//`, scheme sai, host chưa
 * allowlist). Đây là màn hình quản trị: người dùng đã có quyền, và thông điệp mơ hồ chỉ
 * khiến họ thử mò cho tới khi tình cờ đúng.
 */
function toHttp(error: unknown): Error {
  if (!(error instanceof SiteNavError)) return error as Error;

  switch (error.code) {
    case 'NOT_FOUND':
      return new NotFoundException(error.message);
    case 'INVALID_HREF':
    case 'INVALID_STATUS_TRANSITION':
    case 'INVALID_REORDER':
    case 'NO_LABEL':
      return new BadRequestException(error.message);
  }
}

function requireMenuKey(value: unknown): NavMenuKey {
  if (typeof value !== 'string' || !(NAV_MENU_KEYS as readonly string[]).includes(value)) {
    throw new BadRequestException(`\`menuKey\` phải là một trong: ${NAV_MENU_KEYS.join(', ')}.`);
  }
  return value as NavMenuKey;
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

function requireSortOrder(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new BadRequestException('`sortOrder` phải là số nguyên không âm.');
  }
  return value;
}

/**
 * Nhãn theo ngôn ngữ.
 *
 * `allowEmpty` chỉ bật ở PATCH: ở đó `null`/chuỗi rỗng mang nghĩa "xoá bản dịch này", còn
 * lúc TẠO thì một mục không nhãn nào là vô nghĩa — service từ chối bằng `NO_LABEL`.
 */
function requireLabels(value: unknown, options?: { allowEmpty?: boolean }): NavLabelsInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestException('`labels` phải là object dạng `{ vi, en }`.');
  }

  const source = value as Record<string, unknown>;
  const out: NavLabelsInput = {};

  for (const locale of ['vi', 'en'] as const) {
    const raw = source[locale];
    if (raw === undefined) continue;

    if (raw === null) {
      if (!options?.allowEmpty) {
        throw new BadRequestException(`\`labels.${locale}\` không được rỗng khi tạo mới.`);
      }
      out[locale] = null;
      continue;
    }

    if (typeof raw !== 'string') {
      throw new BadRequestException(`\`labels.${locale}\` phải là chuỗi hoặc null.`);
    }
    if (raw.trim().length > MAX_LABEL) {
      throw new BadRequestException(`\`labels.${locale}\` vượt quá ${MAX_LABEL} ký tự.`);
    }
    out[locale] = raw;
  }

  return out;
}

function requireUuidList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException('`itemIds` phải là mảng không rỗng.');
  }
  if (value.length > MAX_REORDER_ITEMS) {
    throw new BadRequestException(`\`itemIds\` vượt quá ${MAX_REORDER_ITEMS} phần tử.`);
  }
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new BadRequestException('`itemIds` chỉ được chứa chuỗi id.');
    }
  }
  return value as string[];
}
