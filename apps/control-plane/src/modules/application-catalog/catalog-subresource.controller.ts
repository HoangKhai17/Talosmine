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
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { getCorrelationId } from '../../shared/correlation.js';
import type { AdminMutationContext } from '../admin/admin.service.js';
import { AdminPermissionGuard, RequirePermission } from '../admin/admin-permission.guard.js';
import { type AuthenticatedRequest, WebSessionGuard } from '../identity/web-session.guard.js';
import { CatalogError } from './catalog.service.js';
import { FeatureService, type FeatureView } from './feature.service.js';
import { HostedBindingService, type HostedBindingView } from './hosted-binding.service.js';
import { RedirectUriService, type RedirectUriView } from './redirect-uri.service.js';

const MAX_KEY = 64;
const MAX_DISPLAY_NAME = 120;
const MAX_DESCRIPTION = 2000;
const MAX_URL = 2048;

/** Cùng quy tắc với `key` của application — xem `catalog-admin.controller.ts`. */
const KEY_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Tài nguyên con của một application: redirect URI và feature.
 *
 * Controller riêng chứ không nhét vào `CatalogAdminController` để file đó không phình ra
 * — nhưng dùng chung prefix và cùng bộ permission.
 *
 * MỌI route đều mang `applicationId` trong đường dẫn, và service luôn ràng buộc theo nó.
 * Nhờ vậy một request không đụng được tài nguyên của app khác dù đoán đúng id con.
 */
@Controller({ path: 'admin/catalog/applications/:applicationId', version: '1' })
@UseGuards(WebSessionGuard, AdminPermissionGuard)
export class CatalogSubresourceController {
  constructor(
    @Inject(RedirectUriService) private readonly redirectUris: RedirectUriService,
    @Inject(FeatureService) private readonly featureService: FeatureService,
    @Inject(HostedBindingService) private readonly hostedBindings: HostedBindingService,
  ) {}

  // ── Redirect URI ────────────────────────────────────────────────────────────

  @Get('redirect-uris')
  @RequirePermission('catalog:read')
  async listRedirectUris(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ): Promise<RedirectUriView[]> {
    return this.redirectUris.list(applicationId);
  }

  @Post('redirect-uris')
  @RequirePermission('catalog:manage')
  @HttpCode(HttpStatus.CREATED)
  async addRedirectUri(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() body: { purpose?: unknown; uri?: unknown; reason?: unknown },
  ): Promise<{ id: string }> {
    const purpose = body.purpose;
    if (purpose !== 'login' && purpose !== 'logout') {
      throw new BadRequestException('`purpose` phải là `login` hoặc `logout`.');
    }

    try {
      const id = await this.redirectUris.add(
        applicationId,
        { purpose, uri: requireText(body.uri, 'uri', MAX_URL) },
        this.context(request, body),
      );
      return { id };
    } catch (error) {
      throw toHttp(error);
    }
  }

  /**
   * Gỡ URI khỏi allowlist.
   *
   * `DELETE` mang body vì `reason` bắt buộc — HTTP không cấm điều đó, và bỏ qua audit cho
   * một thao tác trên allowlist redirect là không chấp nhận được.
   */
  @Delete('redirect-uris/:redirectUriId')
  @RequirePermission('catalog:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeRedirectUri(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('redirectUriId', ParseUUIDPipe) redirectUriId: string,
    @Body() body: { reason?: unknown },
  ): Promise<void> {
    try {
      await this.redirectUris.remove(applicationId, redirectUriId, this.context(request, body));
    } catch (error) {
      throw toHttp(error);
    }
  }

  // ── Feature ─────────────────────────────────────────────────────────────────

  @Get('features')
  @RequirePermission('catalog:read')
  async listFeatures(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ): Promise<FeatureView[]> {
    return this.featureService.list(applicationId);
  }

  @Post('features')
  @RequirePermission('catalog:manage')
  @HttpCode(HttpStatus.CREATED)
  async createFeature(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() body: { key?: unknown; displayName?: unknown; description?: unknown; reason?: unknown },
  ): Promise<{ id: string }> {
    try {
      const id = await this.featureService.create(
        applicationId,
        {
          key: requireKey(body.key),
          displayName: requireText(body.displayName, 'displayName', MAX_DISPLAY_NAME),
          description: optionalText(body.description, 'description', MAX_DESCRIPTION),
        },
        this.context(request, body),
      );
      return { id };
    } catch (error) {
      throw toHttp(error);
    }
  }

  @Patch('features/:featureId')
  @RequirePermission('catalog:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateFeature(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('featureId', ParseUUIDPipe) featureId: string,
    @Body() body: { displayName?: unknown; description?: unknown; reason?: unknown },
  ): Promise<void> {
    const input: { displayName?: string; description?: string | null } = {};
    if (body.displayName !== undefined) {
      input.displayName = requireText(body.displayName, 'displayName', MAX_DISPLAY_NAME);
    }
    if (body.description !== undefined) {
      input.description = optionalText(body.description, 'description', MAX_DESCRIPTION);
    }

    try {
      await this.featureService.update(
        applicationId,
        featureId,
        input,
        this.context(request, body),
      );
    } catch (error) {
      throw toHttp(error);
    }
  }

  /**
   * Đổi trạng thái feature — cần `catalog:publish`, cùng lý do với application.
   *
   * Bật một feature nghĩa là plan có thể cấp quyền lên nó và người dùng có thể dùng nó.
   * Đó là hành động có hệ quả, khác việc sửa mô tả.
   */
  @Post('features/:featureId/status')
  @RequirePermission('catalog:publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeFeatureStatus(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Param('featureId', ParseUUIDPipe) featureId: string,
    @Body() body: { status?: unknown; reason?: unknown },
  ): Promise<void> {
    const status = body.status;
    if (status !== 'active' && status !== 'inactive') {
      throw new BadRequestException('`status` phải là `active` hoặc `inactive`.');
    }

    try {
      await this.featureService.changeStatus(
        applicationId,
        featureId,
        status,
        this.context(request, body),
      );
    } catch (error) {
      throw toHttp(error);
    }
  }

  // ── Cấu hình nhà cung cấp cho app `hosted` (DEC-B17, DEC-T27) ───────────────

  @Get('hosted-binding')
  @RequirePermission('catalog:read')
  async getHostedBinding(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ): Promise<HostedBindingView> {
    const binding = await this.hostedBindings.get(applicationId);
    if (!binding) throw new NotFoundException('Ứng dụng chưa có cấu hình nhà cung cấp.');
    return binding;
  }

  /**
   * `PUT` chứ không phải `POST`: đây là một cấu hình DUY NHẤT cho mỗi app (quan hệ 1–1),
   * không phải một bộ sưu tập để thêm phần tử. Gọi lại với cùng nội dung cho cùng kết quả.
   */
  @Put('hosted-binding')
  @RequirePermission('catalog:manage')
  async upsertHostedBinding(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body()
    body: {
      provider?: unknown;
      endpointUrl?: unknown;
      model?: unknown;
      timeoutMs?: unknown;
      reason?: unknown;
    },
  ): Promise<HostedBindingView> {
    const provider = requireText(body.provider, 'provider', 64);
    const endpointUrl = requireText(body.endpointUrl, 'endpointUrl', MAX_URL);
    const model = optionalText(body.model, 'model', MAX_DISPLAY_NAME);

    // Trần 300s khớp CHECK trong database. Kiểm ở đây để người gọi nhận 400 có nghĩa thay
    // vì một lỗi ràng buộc SQL khó đọc.
    let timeoutMs: number | undefined;
    if (body.timeoutMs !== undefined && body.timeoutMs !== null) {
      if (typeof body.timeoutMs !== 'number' || !Number.isInteger(body.timeoutMs)) {
        throw new BadRequestException('`timeoutMs` phải là số nguyên.');
      }
      if (body.timeoutMs < 1000 || body.timeoutMs > 300_000) {
        throw new BadRequestException('`timeoutMs` phải nằm trong khoảng 1000–300000.');
      }
      timeoutMs = body.timeoutMs;
    }

    try {
      return await this.hostedBindings.upsert(
        applicationId,
        { provider, endpointUrl, model, ...(timeoutMs === undefined ? {} : { timeoutMs }) },
        this.context(request, body),
      );
    } catch (error) {
      throw toHttp(error);
    }
  }

  @Delete('hosted-binding')
  @RequirePermission('catalog:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteHostedBinding(
    @Req() request: AuthenticatedRequest,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() body: { reason?: unknown },
  ): Promise<void> {
    const removed = await this.hostedBindings.remove(applicationId, this.context(request, body));
    if (!removed) throw new NotFoundException('Ứng dụng chưa có cấu hình nhà cung cấp.');
  }

  private context(request: AuthenticatedRequest, body: { reason?: unknown }): AdminMutationContext {
    const actorAccountId = request.auth?.accountId;
    if (!actorAccountId) throw new UnauthorizedException('Thiếu phiên đăng nhập.');

    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (reason === '') {
      throw new BadRequestException('Thiếu `reason`. Mọi thao tác quản trị phải nêu lý do.');
    }

    return { actorAccountId, reason, correlationId: getCorrelationId() };
  }
}

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
    case 'KIND_MISMATCH':
      return new BadRequestException(error.message);
  }
}

function requireKey(value: unknown): string {
  if (typeof value !== 'string') throw new BadRequestException('`key` phải là chuỗi.');
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
  if (typeof value !== 'string') throw new BadRequestException(`\`${field}\` phải là chuỗi.`);
  const text = value.trim();
  if (text === '') throw new BadRequestException(`Thiếu \`${field}\`.`);
  if (text.length > max) throw new BadRequestException(`\`${field}\` vượt quá ${max} ký tự.`);
  return text;
}

/** `undefined` và `null` đều cho ra NULL. Chuỗi rỗng cũng vậy. */
function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(`\`${field}\` phải là chuỗi hoặc null.`);
  }
  const text = value.trim();
  if (text === '') return null;
  if (text.length > max) throw new BadRequestException(`\`${field}\` vượt quá ${max} ký tự.`);
  return text;
}
