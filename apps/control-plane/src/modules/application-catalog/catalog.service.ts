import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { isValidContentTransition } from '../../shared/content-status.js';
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
import { applications, type CatalogStatus } from './schema.js';

/** View đầy đủ — chỉ dành cho quản trị. Gồm cả app `draft` và `inactive`. */
export interface AdminApplicationView {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  imageUrl: string | null;
  launchUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * View cho người dùng cuối.
 *
 * KHÔNG có `status`: người dùng chỉ nhìn thấy app `active`, nên trường đó không mang thông
 * tin gì ngoài việc lộ ra rằng hệ thống có những trạng thái khác.
 */
export interface PublicApplicationView {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  imageUrl: string | null;
  launchUrl: string;
}

/** Lỗi nghiệp vụ của catalog. Controller map sang HTTP; service không biết gì về HTTP. */
export class CatalogError extends Error {
  constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'KEY_TAKEN'
      | 'KEY_IMMUTABLE'
      | 'INVALID_URL'
      | 'INVALID_STATUS_TRANSITION',
    message: string,
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}

export interface CreateApplicationInput {
  key: string;
  displayName: string;
  description?: string | null;
  imageUrl?: string | null;
  launchUrl: string;
}

export interface UpdateApplicationInput {
  displayName?: string;
  description?: string | null;
  imageUrl?: string | null;
  launchUrl?: string;
}

/**
 * Danh mục ứng dụng (P3).
 *
 * BA NGUYÊN TẮC XUYÊN SUỐT:
 *
 * 1. **`key` bất biến.** Nó là định danh mà policy request, plan grant và dữ liệu usage
 *    tham chiếu. Đổi key = mọi bản ghi lịch sử trỏ sai đối tượng. Không có đường sửa key,
 *    kể cả cho quản trị.
 *
 * 2. **URL đi qua chính sách trước khi chạm database.** Database cố ý chấp nhận
 *    `http://127.0.0.1/admin` — chặn nó là việc ở đây (xem `docs/url-policy.md`).
 *
 * 3. **Thấy app không có nghĩa là được dùng.** Catalog trả lời "app nào tồn tại", KHÔNG
 *    trả lời "người này được phép mở nó". Phân quyền thật thuộc entitlement ở P4.
 */
@Injectable()
export class CatalogService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  /**
   * Cấu hình chính sách URL, đọc từ env.
   *
   * Đọc mỗi lần thay vì cache: `loadEnv` đã cache sẵn, và việc parse lại một chuỗi ngắn
   * rẻ hơn nhiều so với rủi ro giữ cấu hình cũ sau khi env đổi lúc test.
   */
  private urlPolicyOptions(): UrlPolicyOptions {
    const env = loadEnv();
    return {
      allowedHosts: parseAllowedHosts(env.CATALOG_ALLOWED_HOSTS),
      // Ngoại lệ loopback chỉ mở ở development. Điều kiện thật nằm ở hostname — xem
      // `checkUrlSyntax`; cờ này chỉ quyết định có XÉT ngoại lệ hay không.
      allowInsecureLoopback: env.NODE_ENV === 'development',
    };
  }

  /** Kiểm URL và trả về dạng đã chuẩn hoá. Ném `CatalogError` nếu không đạt. */
  private requireValidUrl(raw: string, field: string): string {
    const result = checkUrlSyntax(raw, this.urlPolicyOptions());
    if (!result.ok || !result.canonical) {
      throw new CatalogError(
        'INVALID_URL',
        `\`${field}\`: ${result.message ?? 'URL không hợp lệ.'}`,
      );
    }
    // LƯU DẠNG CHUẨN HOÁ, không lưu chuỗi gốc: hai chuỗi khác nhau có thể trỏ cùng một
    // nơi, và lúc so khớp allowlist redirect sẽ trượt ở chỗ không ai ngờ.
    return result.canonical;
  }

  // ── Đường đọc ────────────────────────────────────────────────────────────────

  /** Danh sách cho quản trị — MỌI trạng thái. */
  async listForAdmin(): Promise<AdminApplicationView[]> {
    const rows = await this.database.db.select().from(applications).orderBy(asc(applications.key));

    return rows.map(toAdminView);
  }

  async getForAdmin(id: string): Promise<AdminApplicationView | null> {
    const rows = await this.database.db
      .select()
      .from(applications)
      .where(eq(applications.id, id))
      .limit(1);

    const row = rows[0];
    return row ? toAdminView(row) : null;
  }

  /**
   * Danh sách cho người dùng — CHỈ app `active`.
   *
   * `draft` là app đang soạn, `inactive` là app đã gỡ. Cả hai đều không được xuất hiện,
   * kể cả khi người dùng đoán đúng id.
   */
  async listPublic(): Promise<PublicApplicationView[]> {
    const rows = await this.database.db
      .select()
      .from(applications)
      .where(eq(applications.status, 'active'))
      .orderBy(asc(applications.displayName));

    return rows.map(toPublicView);
  }

  /**
   * Chi tiết app cho người dùng.
   *
   * Trả `null` cho app không `active` — KHÔNG phân biệt "không tồn tại" với "tồn tại
   * nhưng chưa phát hành". Phân biệt hai trường hợp đó cho phép dò xem hệ thống đang
   * chuẩn bị những app nào.
   */
  async getPublicByKey(key: string): Promise<PublicApplicationView | null> {
    const rows = await this.database.db
      .select()
      .from(applications)
      .where(and(eq(applications.key, key), eq(applications.status, 'active')))
      .limit(1);

    const row = rows[0];
    return row ? toPublicView(row) : null;
  }

  // ── Đường ghi ────────────────────────────────────────────────────────────────

  /**
   * Tạo application mới. Luôn ở trạng thái `draft`.
   *
   * Không cho tạo thẳng `active`: phát hành là hành động riêng, cần permission riêng
   * (`catalog:publish`) và phải qua bước xem lại.
   */
  async create(input: CreateApplicationInput, ctx: AdminMutationContext): Promise<string> {
    const launchUrl = this.requireValidUrl(input.launchUrl, 'launchUrl');
    const imageUrl = input.imageUrl ? this.requireValidUrl(input.imageUrl, 'imageUrl') : null;

    const id = uuidv7();

    try {
      await this.database.db.transaction(async (tx) => {
        await tx.insert(applications).values({
          id,
          key: input.key,
          displayName: input.displayName,
          description: input.description ?? null,
          imageUrl,
          launchUrl,
          status: 'draft',
        });

        // Audit ĐỒNG BỘ trong cùng transaction. Audit lỗi → tạo app cũng rollback.
        await appendAuditEvent(tx, {
          actor: { type: 'account', accountId: ctx.actorAccountId },
          action: 'application.created',
          targetType: 'application',
          targetId: id,
          targetKey: input.key,
          reason: ctx.reason,
          correlationId: ctx.correlationId,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CatalogError('KEY_TAKEN', `Mã \`${input.key}\` đã được dùng.`);
      }
      throw error;
    }

    return id;
  }

  /**
   * Sửa metadata. KHÔNG sửa được `key` và KHÔNG sửa được `status`.
   *
   * `status` có đường riêng (`changeStatus`) vì nó cần permission khác — xem migration 0009.
   */
  async update(
    id: string,
    input: UpdateApplicationInput,
    ctx: AdminMutationContext,
  ): Promise<void> {
    const patch: Record<string, unknown> = { updatedAt: sql`now()` };

    if (input.displayName !== undefined) patch.displayName = input.displayName;
    if (input.description !== undefined) patch.description = input.description;

    if (input.launchUrl !== undefined) {
      patch.launchUrl = this.requireValidUrl(input.launchUrl, 'launchUrl');
    }
    if (input.imageUrl !== undefined) {
      patch.imageUrl = input.imageUrl ? this.requireValidUrl(input.imageUrl, 'imageUrl') : null;
    }

    await this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(applications)
        .set(patch)
        .where(eq(applications.id, id))
        .returning({ key: applications.key });

      const row = rows[0];
      if (!row) throw new CatalogError('NOT_FOUND', 'Không tìm thấy ứng dụng.');

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'application.updated',
        targetType: 'application',
        targetId: id,
        targetKey: row.key,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { fields: Object.keys(patch).filter((k) => k !== 'updatedAt') },
      });
    });
  }

  /**
   * Đổi trạng thái vòng đời.
   *
   * Chuyển tiếp hợp lệ:
   *     draft ──→ active ⇄ inactive
   *       ↑          |
   *       └──────────┘   (KHÔNG quay lại draft)
   *
   * Vì sao không quay lại `draft`: app đã từng `active` nghĩa là người dùng đã thấy nó và
   * có thể đã có dữ liệu usage. Đưa về `draft` sẽ tạo ra trạng thái "chưa từng phát hành"
   * cho một thứ đã phát hành — dấu vết lịch sử nói dối. Muốn gỡ thì dùng `inactive`.
   */
  async changeStatus(id: string, next: CatalogStatus, ctx: AdminMutationContext): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const current = await tx
        .select({ key: applications.key, status: applications.status })
        .from(applications)
        .where(eq(applications.id, id))
        .limit(1);

      const row = current[0];
      if (!row) throw new CatalogError('NOT_FOUND', 'Không tìm thấy ứng dụng.');

      if (!isValidContentTransition(row.status, next)) {
        throw new CatalogError(
          'INVALID_STATUS_TRANSITION',
          `Không thể chuyển từ \`${row.status}\` sang \`${next}\`.`,
        );
      }

      await tx
        .update(applications)
        .set({ status: next, updatedAt: sql`now()` })
        .where(eq(applications.id, id));

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: `application.${next === 'active' ? 'published' : 'deactivated'}`,
        targetType: 'application',
        targetId: id,
        targetKey: row.key,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { from: row.status, to: next },
      });
    });
  }
}

const UNIQUE_VIOLATION = '23505';

/**
 * Drizzle BỌC lỗi query thành `DrizzleQueryError` với `PostgresError` ở `.cause`, nên kiểm
 * mỗi `err.code` sẽ trượt. Đây là lỗi đã từng xảy ra ở module identity.
 */
function isUniqueViolation(err: unknown): boolean {
  const layers = [err, (err as { cause?: unknown } | null)?.cause];
  return layers.some(
    (e) => typeof e === 'object' && e !== null && 'code' in e && e.code === UNIQUE_VIOLATION,
  );
}

function toAdminView(row: typeof applications.$inferSelect): AdminApplicationView {
  return {
    id: row.id,
    key: row.key,
    displayName: row.displayName,
    description: row.description,
    imageUrl: row.imageUrl,
    launchUrl: row.launchUrl,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPublicView(row: typeof applications.$inferSelect): PublicApplicationView {
  return {
    id: row.id,
    key: row.key,
    displayName: row.displayName,
    description: row.description,
    imageUrl: row.imageUrl,
    launchUrl: row.launchUrl,
  };
}
