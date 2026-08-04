import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { loadEnv } from '../../shared/env.js';
import {
  checkUrlSyntax,
  parseAllowedHosts,
  type UrlPolicyOptions,
} from '../../shared/url-policy.js';
import type { AdminMutationContext } from '../admin/admin.service.js';
import { appendAuditEvent } from '../audit/audit.js';
import { CatalogError } from './catalog.service.js';
import {
  applicationHostedBindings,
  applications,
  HOSTED_PROVIDERS,
  type HostedProvider,
} from './schema.js';

/** View trả ra ngoài. KHÔNG có trường nào chứa secret — cùng nguyên tắc `service_identities`. */
export interface HostedBindingView {
  applicationId: string;
  provider: HostedProvider;
  endpointUrl: string;
  model: string | null;
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertHostedBindingInput {
  provider: string;
  endpointUrl: string;
  model?: string | null;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Cấu hình nhà cung cấp cho ứng dụng `hosted` (DEC-T27).
 *
 * `endpointUrl` đi qua ĐÚNG chính sách URL như `launchUrl` và `imageUrl`: https, không
 * userinfo, host phải nằm trong `CATALOG_ALLOWED_HOSTS`, lưu ở dạng chuẩn hoá. Một endpoint
 * lọt allowlist là một địa chỉ Control Plane sẽ tự gửi request tới kèm khoá API — nên nó
 * đáng được soi kỹ ít nhất bằng một redirect URI.
 */
@Injectable()
export class HostedBindingService {
  // Token tường minh: dev runner (tsx/esbuild) không sinh `emitDecoratorMetadata`.
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  private urlPolicyOptions(): UrlPolicyOptions {
    const env = loadEnv();
    return {
      allowedHosts: parseAllowedHosts(env.CATALOG_ALLOWED_HOSTS),
      allowInsecureLoopback: env.NODE_ENV === 'development',
    };
  }

  async get(applicationId: string): Promise<HostedBindingView | null> {
    const rows = await this.database.db
      .select()
      .from(applicationHostedBindings)
      .where(eq(applicationHostedBindings.applicationId, applicationId))
      .limit(1);

    const row = rows[0];
    return row ? toView(row) : null;
  }

  /**
   * Đặt hoặc cập nhật cấu hình. Idempotent.
   *
   * TỪ CHỐI app `external_link`: hai loại app có hai đường chạy khác hẳn nhau, và một
   * binding nằm trên app external là cấu hình chết — không code nào đọc tới, nhưng người rà
   * soát sau sẽ tưởng nó đang có hiệu lực.
   */
  async upsert(
    applicationId: string,
    input: UpsertHostedBindingInput,
    ctx: AdminMutationContext,
  ): Promise<HostedBindingView> {
    if (!isKnownProvider(input.provider)) {
      throw new CatalogError(
        'INVALID_URL',
        `Nhà cung cấp \`${input.provider}\` không nằm trong danh sách được duyệt.`,
      );
    }

    const result = await this.checkUrl(input.endpointUrl);
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const model = input.model?.trim() ? input.model.trim() : null;

    return this.database.db.transaction(async (tx) => {
      const appRows = await tx
        .select({ key: applications.key, kind: applications.kind })
        .from(applications)
        .where(eq(applications.id, applicationId))
        .limit(1);

      const app = appRows[0];
      if (!app) throw new CatalogError('NOT_FOUND', 'Không tìm thấy ứng dụng.');
      if (app.kind !== 'hosted') {
        throw new CatalogError(
          'KIND_MISMATCH',
          'Chỉ ứng dụng `hosted` mới có cấu hình nhà cung cấp.',
        );
      }

      const rows = await tx
        .insert(applicationHostedBindings)
        .values({
          applicationId,
          provider: input.provider,
          endpointUrl: result,
          model,
          timeoutMs,
        })
        .onConflictDoUpdate({
          target: applicationHostedBindings.applicationId,
          set: {
            provider: input.provider,
            endpointUrl: result,
            model,
            timeoutMs,
            updatedAt: sql`now()`,
          },
        })
        .returning();

      const row = rows[0];
      if (!row) throw new CatalogError('NOT_FOUND', 'Không ghi được cấu hình.');

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'application.hosted_binding_set',
        targetType: 'application',
        targetId: applicationId,
        targetKey: app.key,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        // Ghi endpoint và provider vào audit — đây là cấu hình vận hành, KHÔNG phải secret.
        // Khoá API thì không bao giờ đi qua đây vì nó không nằm trong bảng này.
        details: { provider: input.provider, endpointUrl: result },
      });

      return toView(row);
    });
  }

  async remove(applicationId: string, ctx: AdminMutationContext): Promise<boolean> {
    return this.database.db.transaction(async (tx) => {
      const appRows = await tx
        .select({ key: applications.key })
        .from(applications)
        .where(eq(applications.id, applicationId))
        .limit(1);

      const app = appRows[0];
      if (!app) return false;

      const deleted = await tx
        .delete(applicationHostedBindings)
        .where(eq(applicationHostedBindings.applicationId, applicationId))
        .returning({ applicationId: applicationHostedBindings.applicationId });

      if (deleted.length === 0) return false;

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'application.hosted_binding_removed',
        targetType: 'application',
        targetId: applicationId,
        targetKey: app.key,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
      });

      return true;
    });
  }

  /** Kiểm URL và trả về dạng chuẩn hoá. Cùng khuôn `requireValidUrl` của `CatalogService`. */
  private checkUrl(raw: string): string {
    const result = checkUrlSyntax(raw, this.urlPolicyOptions());
    if (!result.ok || !result.canonical) {
      throw new CatalogError(
        'INVALID_URL',
        `\`endpointUrl\`: ${result.message ?? 'URL không hợp lệ.'}`,
      );
    }
    return result.canonical;
  }
}

function isKnownProvider(value: string): value is HostedProvider {
  return (HOSTED_PROVIDERS as readonly string[]).includes(value);
}

function toView(row: typeof applicationHostedBindings.$inferSelect): HostedBindingView {
  return {
    applicationId: row.applicationId,
    provider: row.provider as HostedProvider,
    endpointUrl: row.endpointUrl,
    model: row.model,
    timeoutMs: row.timeoutMs,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
