import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { getCorrelationId } from '../../shared/correlation.js';
import type { AdminMutationContext } from '../admin/admin.service.js';
import { AdminPermissionGuard, RequirePermission } from '../admin/admin-permission.guard.js';
import { type AuthenticatedRequest, WebSessionGuard } from '../identity/web-session.guard.js';
import {
  type AdminContentSlotView,
  ContentSlotsService,
  type SlotValuesInput,
} from './content-slots.service.js';
import { CONTENT_SLOT_KEYS, type ContentSlotKey, NAV_LOCALES, type NavLocale } from './schema.js';

/**
 * Giới hạn độ dài một giá trị khe. Dài nhất trong thực tế là đoạn dẫn hero (~200 ký tự);
 * 2000 đủ rộng cho mô tả SEO mà vẫn chặn được việc nhồi cả một bài viết vào một tiêu đề.
 */
const MAX_VALUE = 2000;

interface UpdateBody {
  values?: unknown;
  reason?: unknown;
}

/**
 * Khe nội dung cho người dùng cuối.
 *
 * KHÔNG GUARD — cùng lý do với `SiteNavController`: đây là chữ trên các trang marketing mở
 * cho mọi khách. Dữ liệu trả về đúng bằng thứ đã hiển thị công khai.
 */
@Controller({ path: 'site/content', version: '1' })
export class SiteContentController {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`.
  constructor(@Inject(ContentSlotsService) private readonly slots: ContentSlotsService) {}

  @Get()
  async get(
    @Query('locale') locale?: string,
  ): Promise<{ locale: NavLocale; values: Record<string, string> }> {
    if (!isLocale(locale)) {
      throw new BadRequestException(`\`locale\` phải là một trong: ${NAV_LOCALES.join(', ')}.`);
    }
    return { locale, values: await this.slots.getPublic(locale) };
  }
}

/**
 * Khe nội dung cho quản trị.
 *
 * KHÔNG có mức `publish` riêng — cùng lập luận đã ghi ở `SiteSettingsAdminController`: một
 * khe chỉ có hai trạng thái (đã đặt / chưa), không có bản nháp để duyệt.
 */
@Controller({ path: 'admin/site/content', version: '1' })
@UseGuards(WebSessionGuard, AdminPermissionGuard)
export class SiteContentAdminController {
  constructor(@Inject(ContentSlotsService) private readonly slots: ContentSlotsService) {}

  @Get()
  @RequirePermission('content:read')
  async list(): Promise<AdminContentSlotView[]> {
    return this.slots.listForAdmin();
  }

  @Patch(':slotKey')
  @RequirePermission('content:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('slotKey') slotKey: string,
    @Body() body: UpdateBody,
  ): Promise<void> {
    const key = requireSlotKey(slotKey);
    const values = requireValues(body.values);

    await this.slots.set(key, values, this.context(request, body));
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

function isLocale(value: unknown): value is NavLocale {
  return typeof value === 'string' && (NAV_LOCALES as readonly string[]).includes(value);
}

/**
 * Khoá lạ bị chặn ở đây TRƯỚC khi chạm CHECK của database — thông điệp nói được "khoá không
 * thuộc danh mục" thay vì một lỗi ràng buộc thô, và CHECK vẫn là chốt chặn cuối.
 */
function requireSlotKey(value: string): ContentSlotKey {
  if (!(CONTENT_SLOT_KEYS as readonly string[]).includes(value)) {
    throw new BadRequestException('`slotKey` không thuộc danh mục khe nội dung.');
  }
  return value as ContentSlotKey;
}

/**
 * `values` dạng `{ vi, en }` — vắng mặt = không đổi, `null`/rỗng = xoá.
 *
 * Bắt buộc ĐỤNG ÍT NHẤT MỘT ngôn ngữ: một PATCH không đổi gì là lệnh vô nghĩa, và nó vẫn
 * ghi audit — tạo dấu vết "đã sửa" cho một lần không sửa gì.
 */
function requireValues(value: unknown): SlotValuesInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestException('`values` phải là object dạng `{ vi, en }`.');
  }

  const source = value as Record<string, unknown>;
  const out: SlotValuesInput = {};

  for (const locale of NAV_LOCALES) {
    const raw = source[locale];
    if (raw === undefined) continue;

    if (raw === null) {
      out[locale] = null;
      continue;
    }
    if (typeof raw !== 'string') {
      throw new BadRequestException(`\`values.${locale}\` phải là chuỗi hoặc null.`);
    }
    if (raw.trim().length > MAX_VALUE) {
      throw new BadRequestException(`\`values.${locale}\` vượt quá ${MAX_VALUE} ký tự.`);
    }
    out[locale] = raw;
  }

  if (Object.keys(out).length === 0) {
    throw new BadRequestException('`values` phải chứa ít nhất một ngôn ngữ (vi hoặc en).');
  }

  return out;
}
