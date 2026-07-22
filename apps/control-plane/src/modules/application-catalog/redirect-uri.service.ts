import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { loadEnv } from '../../shared/env.js';
import { checkUrlSyntax, parseAllowedHosts } from '../../shared/url-policy.js';
import type { AdminMutationContext } from '../admin/admin.service.js';
import { appendAuditEvent } from '../audit/audit.js';
import { CatalogError } from './catalog.service.js';
import { applicationRedirectUris, applications, type RedirectPurpose } from './schema.js';

export interface RedirectUriView {
  id: string;
  purpose: string;
  uri: string;
  createdAt: string;
}

/**
 * Allowlist redirect URI của từng ứng dụng.
 *
 * ĐÂY LÀ BỀ MẶT NHẠY CẢM NHẤT CỦA CATALOG. Redirect URI quyết định nơi authorization code
 * được gửi tới sau khi người dùng đăng nhập. Một entry sai nghĩa là code — và qua đó là
 * phiên của người dùng — rơi vào tay người khác.
 *
 * Vì vậy:
 *   • So khớp CHÍNH XÁC từng ký tự. Không wildcard, không prefix, không subdomain.
 *   • URI đi qua cùng chính sách URL như `launch_url`.
 *   • Sửa = XOÁ dòng cũ rồi THÊM dòng mới, cả hai đều có audit. Không `UPDATE` tại chỗ —
 *     sửa tại chỗ làm mất dấu vết URI cũ là gì.
 */
@Injectable()
export class RedirectUriService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async list(applicationId: string): Promise<RedirectUriView[]> {
    const rows = await this.database.db
      .select()
      .from(applicationRedirectUris)
      .where(eq(applicationRedirectUris.applicationId, applicationId))
      .orderBy(asc(applicationRedirectUris.purpose), asc(applicationRedirectUris.uri));

    return rows.map((row) => ({
      id: row.id,
      purpose: row.purpose,
      uri: row.uri,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async add(
    applicationId: string,
    input: { purpose: RedirectPurpose; uri: string },
    ctx: AdminMutationContext,
  ): Promise<string> {
    const env = loadEnv();
    const policy = checkUrlSyntax(input.uri, {
      allowedHosts: parseAllowedHosts(env.CATALOG_ALLOWED_HOSTS),
      allowInsecureLoopback: env.NODE_ENV === 'development',
    });

    if (!policy.ok || !policy.canonical) {
      throw new CatalogError('INVALID_URL', `\`uri\`: ${policy.message ?? 'URL không hợp lệ.'}`);
    }

    // LƯU DẠNG CHUẨN HOÁ. Đây không phải chuyện thẩm mỹ: lúc IdP so khớp redirect, nó so
    // chuỗi. `https://A.com:443/cb` và `https://a.com/cb` trỏ cùng một nơi nhưng khác
    // chuỗi — lưu nguyên văn sẽ làm phép so khớp trượt.
    const canonical = policy.canonical;
    const id = uuidv7();

    try {
      await this.database.db.transaction(async (tx) => {
        const app = await tx
          .select({ key: applications.key })
          .from(applications)
          .where(eq(applications.id, applicationId))
          .limit(1);

        const found = app[0];
        if (!found) throw new CatalogError('NOT_FOUND', 'Không tìm thấy ứng dụng.');

        await tx.insert(applicationRedirectUris).values({
          id,
          applicationId,
          purpose: input.purpose,
          uri: canonical,
        });

        await appendAuditEvent(tx, {
          actor: { type: 'account', accountId: ctx.actorAccountId },
          action: 'application_redirect_uri.added',
          targetType: 'application',
          targetId: applicationId,
          targetKey: found.key,
          reason: ctx.reason,
          correlationId: ctx.correlationId,
          details: { purpose: input.purpose, uri: canonical },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CatalogError('KEY_TAKEN', 'URI này đã có trong danh sách.');
      }
      throw error;
    }

    return id;
  }

  /**
   * Gỡ một URI khỏi allowlist.
   *
   * Đây là chỗ DUY NHẤT trong catalog thực sự XOÁ dòng — mọi nơi khác đổi `status`.
   * Lý do: allowlist là tập hợp các giá trị được phép ở thời điểm hiện tại, không phải
   * lịch sử. Giữ một URI "đã gỡ" trong bảng sẽ đòi mọi truy vấn so khớp phải nhớ lọc nó
   * ra — và quên một lần là lỗ hổng.
   *
   * Dấu vết lịch sử nằm ở `audit_events`, nơi không xoá được.
   */
  async remove(
    applicationId: string,
    redirectUriId: string,
    ctx: AdminMutationContext,
  ): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const rows = await tx
        .delete(applicationRedirectUris)
        .where(
          and(
            eq(applicationRedirectUris.id, redirectUriId),
            // Ràng buộc applicationId để một request không xoá được URI của app khác dù
            // đoán đúng id.
            eq(applicationRedirectUris.applicationId, applicationId),
          ),
        )
        .returning({ purpose: applicationRedirectUris.purpose, uri: applicationRedirectUris.uri });

      const removed = rows[0];
      if (!removed) throw new CatalogError('NOT_FOUND', 'Không tìm thấy URI.');

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'application_redirect_uri.removed',
        targetType: 'application',
        targetId: applicationId,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        // Ghi lại giá trị đã xoá — đây là nơi duy nhất còn dấu vết của nó.
        details: { purpose: removed.purpose, uri: removed.uri },
      });
    });
  }
}

const UNIQUE_VIOLATION = '23505';

/** Drizzle bọc lỗi thành `DrizzleQueryError` với `PostgresError` ở `.cause`. */
function isUniqueViolation(err: unknown): boolean {
  const layers = [err, (err as { cause?: unknown } | null)?.cause];
  return layers.some(
    (e) => typeof e === 'object' && e !== null && 'code' in e && e.code === UNIQUE_VIOLATION,
  );
}
