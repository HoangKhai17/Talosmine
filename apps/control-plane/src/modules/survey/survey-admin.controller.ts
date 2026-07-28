import {
  BadRequestException,
  Body,
  ConflictException,
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
import { SURVEY_ICONS, SURVEY_LOCALES, SURVEY_QUESTION_KEYS, type SurveyIcon } from './schema.js';
import {
  type AdminSurveyQuestionView,
  type LocalizedInput,
  SurveyAdminError,
  SurveyAdminService,
} from './survey-admin.service.js';

/** Giới hạn độ dài — một field tự do không được thành kênh nhồi dữ liệu. */
const MAX_LABEL = 200;
const MAX_DESCRIPTION = 500;
const MAX_OPTION_KEY = 64;
/** Chặn payload reorder phi lý trước khi nó chạm database. */
const MAX_REORDER_ITEMS = 200;
/** Khoá máy: chữ thường, số, gạch dưới. Đây là thứ đi vào báo cáo, không phải chữ hiển thị. */
const OPTION_KEY_PATTERN = /^[a-z0-9_]+$/;

interface UpdateQuestionBody {
  minSelect?: unknown;
  titles?: unknown;
  descriptions?: unknown;
  reason?: unknown;
}

interface CreateOptionBody {
  questionKey?: unknown;
  key?: unknown;
  icon?: unknown;
  labels?: unknown;
  descriptions?: unknown;
  sortOrder?: unknown;
  reason?: unknown;
}

interface UpdateOptionBody {
  icon?: unknown;
  labels?: unknown;
  descriptions?: unknown;
  reason?: unknown;
}

interface StatusBody {
  status?: unknown;
  reason?: unknown;
}

interface ReorderBody {
  questionKey?: unknown;
  optionIds?: unknown;
  reason?: unknown;
}

/**
 * API quản trị NỘI DUNG khảo sát.
 *
 * BA MỨC PERMISSION, cùng khuôn với catalog và điều hướng site:
 *   `content:read`    xem, gồm cả lựa chọn `draft` mà người dùng không thấy
 *   `content:manage`  sửa câu hỏi, thêm/sửa/xoá/sắp xếp lựa chọn
 *   `content:publish` đổi trạng thái lựa chọn
 *
 * ĐỌC CÂU TRẢ LỜI KHÔNG Ở ĐÂY — nó nằm ở `SurveyResponsesController` sau
 * `survey_response:read`. Sửa câu hỏi là việc biên tập; đọc câu trả lời là truy cập dữ liệu
 * cá nhân. Gộp hai thứ vào một permission nghĩa là ai sửa được chữ cũng đọc được dữ liệu của
 * mọi người dùng.
 *
 * KHÔNG có endpoint tạo/xoá CÂU HỎI: cấu trúc ba câu là cố định (chủ dự án chốt 2026-07-28)
 * vì code phải có chỗ render tương ứng. Thêm câu hỏi là migration, không phải dữ liệu.
 */
@Controller({ path: 'admin/survey', version: '1' })
@UseGuards(WebSessionGuard, AdminPermissionGuard)
export class SurveyAdminController {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`.
  constructor(@Inject(SurveyAdminService) private readonly survey: SurveyAdminService) {}

  @Get('questions')
  @RequirePermission('content:read')
  async listQuestions(): Promise<AdminSurveyQuestionView[]> {
    return this.survey.listQuestions();
  }

  @Patch('questions/:questionId')
  @RequirePermission('content:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateQuestion(
    @Req() request: AuthenticatedRequest,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() body: UpdateQuestionBody,
  ): Promise<void> {
    // `key`, `kind` và `status` không có trong danh sách sửa được; client gửi lên thì bị bỏ
    // qua im lặng, cùng quy ước với PATCH của account, catalog và nav.
    const input: Parameters<SurveyAdminService['updateQuestion']>[1] = {};

    if (body.minSelect !== undefined) input.minSelect = requireMinSelect(body.minSelect);
    if (body.titles !== undefined) {
      input.titles = requireLocalized(body.titles, 'titles', MAX_LABEL);
    }
    if (body.descriptions !== undefined) {
      input.descriptions = requireLocalized(body.descriptions, 'descriptions', MAX_DESCRIPTION);
    }

    try {
      await this.survey.updateQuestion(questionId, input, this.context(request, body));
    } catch (error) {
      throw toHttp(error);
    }
  }

  /**
   * `reorder` khai TRƯỚC `options/:optionId` — Fastify khớp route theo thứ tự đăng ký, nên
   * nếu `:optionId` đứng trước thì `/reorder` bị nuốt thành một id rồi fail ở ParseUUIDPipe.
   * Cùng bẫy đã ghi ở `CatalogModule` và `SiteNavAdminController`.
   */
  @Post('options/reorder')
  @RequirePermission('content:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(@Req() request: AuthenticatedRequest, @Body() body: ReorderBody): Promise<void> {
    const questionKey = requireQuestionKey(body.questionKey);
    const optionIds = requireUuidList(body.optionIds);

    try {
      await this.survey.reorder(questionKey, optionIds, this.context(request, body));
    } catch (error) {
      throw toHttp(error);
    }
  }

  @Post('options')
  @RequirePermission('content:manage')
  @HttpCode(HttpStatus.CREATED)
  async createOption(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateOptionBody,
  ): Promise<{ id: string }> {
    const questionKey = requireQuestionKey(body.questionKey);
    const key = requireOptionKey(body.key);
    const labels = requireLocalized(body.labels, 'labels', MAX_LABEL, { allowEmpty: false });

    try {
      const id = await this.survey.create(
        {
          questionKey,
          key,
          labels,
          ...(body.icon !== undefined ? { icon: requireIcon(body.icon) } : {}),
          ...(body.descriptions !== undefined
            ? { descriptions: requireLocalized(body.descriptions, 'descriptions', MAX_DESCRIPTION) }
            : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: requireSortOrder(body.sortOrder) } : {}),
        },
        this.context(request, body),
      );
      return { id };
    } catch (error) {
      throw toHttp(error);
    }
  }

  @Patch('options/:optionId')
  @RequirePermission('content:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateOption(
    @Req() request: AuthenticatedRequest,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body() body: UpdateOptionBody,
  ): Promise<void> {
    const input: Parameters<SurveyAdminService['update']>[1] = {};

    if (body.icon !== undefined) input.icon = requireIcon(body.icon);
    if (body.labels !== undefined)
      input.labels = requireLocalized(body.labels, 'labels', MAX_LABEL);
    if (body.descriptions !== undefined) {
      input.descriptions = requireLocalized(body.descriptions, 'descriptions', MAX_DESCRIPTION);
    }

    try {
      await this.survey.update(optionId, input, this.context(request, body));
    } catch (error) {
      throw toHttp(error);
    }
  }

  @Post('options/:optionId/status')
  @RequirePermission('content:publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeStatus(
    @Req() request: AuthenticatedRequest,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body() body: StatusBody,
  ): Promise<void> {
    // Chỉ nhận `active`/`inactive`: `draft` không phải đích hợp lệ của chuyển tiếp nào
    // (xem `isValidContentTransition`).
    const status = body.status;
    if (status !== 'active' && status !== 'inactive') {
      throw new BadRequestException('`status` phải là `active` hoặc `inactive`.');
    }

    try {
      await this.survey.changeStatus(optionId, status, this.context(request, body));
    } catch (error) {
      throw toHttp(error);
    }
  }

  @Delete('options/:optionId')
  @RequirePermission('content:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeOption(
    @Req() request: AuthenticatedRequest,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body() body: { reason?: unknown },
  ): Promise<void> {
    try {
      await this.survey.remove(optionId, this.context(request, body));
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
 * Thông điệp giữ NGUYÊN VĂN, không làm mờ đi: đây là màn hình quản trị, người dùng đã có
 * quyền, và một câu "không hợp lệ" chung chung chỉ khiến họ thử mò cho tới khi tình cờ đúng.
 */
export function toHttp(error: unknown): Error {
  if (!(error instanceof SurveyAdminError)) return error as Error;

  switch (error.code) {
    case 'NOT_FOUND':
      return new NotFoundException(error.message);
    case 'DUPLICATE_KEY':
    case 'OPTION_IN_USE':
      return new ConflictException(error.message);
    case 'INVALID_STATUS_TRANSITION':
    case 'INVALID_REORDER':
    case 'INVALID_CURSOR':
    case 'INVALID_MIN_SELECT':
    case 'NO_LABEL':
    case 'NO_TITLE':
      return new BadRequestException(error.message);
  }
}

function requireQuestionKey(value: unknown): string {
  if (typeof value !== 'string' || !(SURVEY_QUESTION_KEYS as readonly string[]).includes(value)) {
    throw new BadRequestException(
      `\`questionKey\` phải là một trong: ${SURVEY_QUESTION_KEYS.join(', ')}.`,
    );
  }
  return value;
}

function requireOptionKey(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('`key` phải là chuỗi.');
  }
  const key = value.trim();
  if (key === '') throw new BadRequestException('Thiếu `key`.');
  if (key.length > MAX_OPTION_KEY) {
    throw new BadRequestException(`\`key\` vượt quá ${MAX_OPTION_KEY} ký tự.`);
  }
  if (!OPTION_KEY_PATTERN.test(key)) {
    throw new BadRequestException('`key` chỉ được chứa chữ thường, số và gạch dưới.');
  }
  return key;
}

/**
 * `icon` nhận `null` để GỠ icon. Danh mục đóng — khoá lạ bị từ chối ở đây trước khi chạm
 * CHECK của database, để thông điệp nói được danh sách hợp lệ là gì.
 */
function requireIcon(value: unknown): SurveyIcon | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !(SURVEY_ICONS as readonly string[]).includes(value)) {
    throw new BadRequestException(
      `\`icon\` phải là null hoặc một trong: ${SURVEY_ICONS.join(', ')}.`,
    );
  }
  return value as SurveyIcon;
}

function requireMinSelect(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new BadRequestException('`minSelect` phải là số nguyên từ 1 trở lên.');
  }
  return value;
}

function requireSortOrder(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new BadRequestException('`sortOrder` phải là số nguyên không âm.');
  }
  return value;
}

/**
 * Văn bản theo ngôn ngữ, dạng `{ vi, en }`.
 *
 * `allowEmpty` mặc định BẬT: ở PATCH thì `null`/chuỗi rỗng mang nghĩa "xoá bản dịch này".
 * Chỉ lúc TẠO mới tắt nó, vì một lựa chọn không nhãn nào là vô nghĩa — service từ chối bằng
 * `NO_LABEL`, và chặn sớm ở đây cho ra thông điệp nói rõ ngôn ngữ nào.
 */
function requireLocalized(
  value: unknown,
  field: string,
  max: number,
  options?: { allowEmpty?: boolean },
): LocalizedInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestException(`\`${field}\` phải là object dạng \`{ vi, en }\`.`);
  }

  const source = value as Record<string, unknown>;
  const out: LocalizedInput = {};

  for (const locale of SURVEY_LOCALES) {
    const raw = source[locale];
    if (raw === undefined) continue;

    if (raw === null) {
      if (options?.allowEmpty === false) {
        throw new BadRequestException(`\`${field}.${locale}\` không được rỗng khi tạo mới.`);
      }
      out[locale] = null;
      continue;
    }

    if (typeof raw !== 'string') {
      throw new BadRequestException(`\`${field}.${locale}\` phải là chuỗi hoặc null.`);
    }
    if (raw.trim().length > max) {
      throw new BadRequestException(`\`${field}.${locale}\` vượt quá ${max} ký tự.`);
    }
    out[locale] = raw;
  }

  return out;
}

function requireUuidList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException('`optionIds` phải là mảng không rỗng.');
  }
  if (value.length > MAX_REORDER_ITEMS) {
    throw new BadRequestException(`\`optionIds\` vượt quá ${MAX_REORDER_ITEMS} phần tử.`);
  }
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new BadRequestException('`optionIds` chỉ được chứa chuỗi id.');
    }
  }
  return value as string[];
}
