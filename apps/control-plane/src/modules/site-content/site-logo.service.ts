import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import type { AdminMutationContext } from '../admin/admin.service.js';
import { appendAuditEvent } from '../audit/audit.js';
import { SITE_ASSET_MAX_BYTES, type SiteAssetMime, siteAssets } from './schema.js';

export interface SiteLogoFile {
  mime: string;
  data: Buffer;
}

export class SiteLogoError extends Error {
  constructor(
    public readonly code: 'TOO_LARGE' | 'EMPTY',
    message: string,
  ) {
    super(message);
    this.name = 'SiteLogoError';
  }
}

/**
 * File logo tải lên (bảng `site_assets`, migration 0015).
 *
 * MỘT hàng duy nhất khoá `logo.image` — tải lần nữa là THAY (upsert), không phải thêm.
 * Không có vòng đời draft: logo chỉ có hai trạng thái đã tải / chưa, cùng lập luận với
 * `site_settings`.
 *
 * Quan hệ với `site_settings.logo.url`: ẢNH TẢI LÊN THẮNG. URL ngoài ở lại làm đường thay
 * thế cho ai muốn dùng ảnh host sẵn — thứ tự ưu tiên do BFF quyết ở `/api/brand/logo`.
 */
@Injectable()
export class SiteLogoService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async read(): Promise<SiteLogoFile | null> {
    const rows = await this.database.db
      .select({ mime: siteAssets.mime, data: siteAssets.data })
      .from(siteAssets)
      .where(eq(siteAssets.key, 'logo.image'))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : { mime: row.mime, data: row.data };
  }

  async upload(mime: SiteAssetMime, data: Buffer, ctx: AdminMutationContext): Promise<void> {
    if (data.length === 0) {
      throw new SiteLogoError('EMPTY', 'File rỗng.');
    }
    // Kiểm sớm cho ra thông điệp đọc được; CHECK `site_assets_size_check` là chốt chặn cuối.
    if (data.length > SITE_ASSET_MAX_BYTES) {
      throw new SiteLogoError(
        'TOO_LARGE',
        `File ${Math.round(data.length / 1024)}KB vượt trần ${SITE_ASSET_MAX_BYTES / 1024}KB.`,
      );
    }

    await this.database.db.transaction(async (tx) => {
      await tx
        .insert(siteAssets)
        .values({ id: uuidv7(), key: 'logo.image', mime, data })
        .onConflictDoUpdate({
          target: siteAssets.key,
          set: { mime, data, updatedAt: sql`now()` },
        });

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'site_asset.uploaded',
        targetType: 'site_asset',
        targetKey: 'logo.image',
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        // Ghi kích thước + mime, KHÔNG ghi bytes: audit trả lời "ai đổi gì lúc nào",
        // không phải nơi lưu bản sao dữ liệu.
        details: { mime, bytes: data.length },
      });
    });
  }

  async remove(ctx: AdminMutationContext): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(siteAssets)
        .where(eq(siteAssets.key, 'logo.image'))
        .returning({ id: siteAssets.id });

      // Gỡ khi vốn không có gì là no-op thành công (idempotent) — nhưng chỉ ghi audit khi
      // có thứ thật sự bị gỡ, để nhật ký không chứa những sự kiện không xảy ra.
      if (deleted.length === 0) return;

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'site_asset.deleted',
        targetType: 'site_asset',
        targetKey: 'logo.image',
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: {},
      });
    });
  }
}
