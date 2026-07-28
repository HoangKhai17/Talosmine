import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { loadEnv } from '../../shared/env.js';
import { parseAllowedHosts, type UrlPolicyOptions } from '../../shared/url-policy.js';
import type { AdminMutationContext } from '../admin/admin.service.js';
import { appendAuditEvent } from '../audit/audit.js';
import { checkNavHref } from './nav-href.js';
import { siteSettings } from './schema.js';
import { SiteNavError } from './site-nav.service.js';

/** Cài đặt site như cả hai đường đọc (công khai và quản trị) nhìn thấy. */
export interface SiteSettingsView {
  logoUrl: string | null;
}

export interface UpdateSiteSettingsInput {
  /** `undefined` = không đổi. `null` = xoá logo. */
  logoUrl?: string | null | undefined;
}

const LOGO_KEY = 'logo.url';

/**
 * Cài đặt chung của site — hiện tại chỉ có logo.
 *
 * DÙNG LẠI `checkNavHref` cho URL logo thay vì viết bộ kiểm thứ hai. Ô này cũng là chỗ quản
 * trị viên gõ URL vào rồi giá trị đó thành thuộc tính `src` trên mọi trang, nên nó có cùng
 * bề mặt tấn công với `href` của mục điều hướng: scheme lạ (`javascript:`, `data:`), host
 * ngoài allowlist, `//` protocol-relative. Hai bộ kiểm cho cùng một luật là hai bộ sẽ lệch nhau.
 *
 * KHÔNG có upload file: object storage chưa dựng (DEC-T12). Bảng lưu URL; khi có storage thì
 * nút upload ghi vào đúng trường này, service không phải đổi.
 */
@Injectable()
export class SiteSettingsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  private urlPolicyOptions(): UrlPolicyOptions {
    const env = loadEnv();
    return {
      allowedHosts: parseAllowedHosts(env.CATALOG_ALLOWED_HOSTS),
      allowInsecureLoopback: env.NODE_ENV === 'development',
    };
  }

  async read(): Promise<SiteSettingsView> {
    const rows = await this.database.db
      .select({ key: siteSettings.key, value: siteSettings.value })
      .from(siteSettings);

    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    return { logoUrl: byKey.get(LOGO_KEY) ?? null };
  }

  /**
   * Lưu cài đặt.
   *
   * Chỉ UPDATE, không upsert: hàng đã được migration seed sẵn, và runtime cố ý KHÔNG được cấp
   * quyền INSERT/DELETE trên bảng này (xem migration 0011). Hàng biến mất là sự cố hạ tầng,
   * không phải trạng thái mà code phải tự vá.
   */
  async update(input: UpdateSiteSettingsInput, ctx: AdminMutationContext): Promise<void> {
    if (input.logoUrl === undefined) return;

    const value = input.logoUrl === null ? null : this.requireValidUrl(input.logoUrl);

    await this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(siteSettings)
        .set({ value, updatedAt: sql`now()` })
        .where(eq(siteSettings.key, LOGO_KEY))
        .returning({ id: siteSettings.id });

      if (rows.length === 0) {
        throw new SiteNavError('NOT_FOUND', 'Không tìm thấy cài đặt logo.');
      }

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: value === null ? 'site_setting.cleared' : 'site_setting.updated',
        targetType: 'site_setting',
        targetKey: LOGO_KEY,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { value },
      });
    });
  }

  private requireValidUrl(raw: string): string {
    const result = checkNavHref(raw, this.urlPolicyOptions());
    if (!result.ok || result.value === undefined) {
      throw new SiteNavError('INVALID_HREF', `\`logoUrl\`: ${result.message ?? 'không hợp lệ.'}`);
    }
    return result.value;
  }
}
