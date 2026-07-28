import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { isValidContentTransition } from '../../shared/content-status.js';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import type { AdminMutationContext } from '../admin/admin.service.js';
import { appendAuditEvent } from '../audit/audit.js';
import { CatalogError } from './catalog.service.js';
import { applications, type CatalogStatus, features } from './schema.js';

export interface FeatureView {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Feature — đơn vị tính năng bên trong một ứng dụng.
 *
 * Đây là thứ mà **entitlement ở P4 sẽ cấp quyền lên**: plan không cấp "toàn bộ app A" mà
 * cấp từng feature. Vì vậy `key` của feature cũng bất biến, cùng lý do với `key` của app.
 *
 * Feature dùng chung máy trạng thái với application (`isValidContentTransition`): `draft` →
 * `active` ⇄ `inactive`, không quay lại `draft`.
 */
@Injectable()
export class FeatureService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async list(applicationId: string): Promise<FeatureView[]> {
    const rows = await this.database.db
      .select()
      .from(features)
      .where(eq(features.applicationId, applicationId))
      .orderBy(asc(features.key));

    return rows.map(toView);
  }

  async create(
    applicationId: string,
    input: { key: string; displayName: string; description?: string | null },
    ctx: AdminMutationContext,
  ): Promise<string> {
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

        await tx.insert(features).values({
          id,
          applicationId,
          key: input.key,
          displayName: input.displayName,
          description: input.description ?? null,
          status: 'draft',
        });

        await appendAuditEvent(tx, {
          actor: { type: 'account', accountId: ctx.actorAccountId },
          action: 'feature.created',
          targetType: 'feature',
          targetId: id,
          // Ghi key GHÉP để đọc log biết ngay feature nào của app nào mà không phải tra bảng.
          targetKey: `${found.key}/${input.key}`,
          reason: ctx.reason,
          correlationId: ctx.correlationId,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CatalogError('KEY_TAKEN', `Feature \`${input.key}\` đã tồn tại trong app này.`);
      }
      throw error;
    }

    return id;
  }

  async update(
    applicationId: string,
    featureId: string,
    input: { displayName?: string; description?: string | null },
    ctx: AdminMutationContext,
  ): Promise<void> {
    const patch: Record<string, unknown> = { updatedAt: sql`now()` };
    if (input.displayName !== undefined) patch.displayName = input.displayName;
    if (input.description !== undefined) patch.description = input.description;

    await this.database.db.transaction(async (tx) => {
      const rows = await tx
        .update(features)
        .set(patch)
        // Ràng buộc applicationId: một request không sửa được feature của app khác dù
        // đoán đúng id.
        .where(and(eq(features.id, featureId), eq(features.applicationId, applicationId)))
        .returning({ key: features.key });

      const row = rows[0];
      if (!row) throw new CatalogError('NOT_FOUND', 'Không tìm thấy feature.');

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'feature.updated',
        targetType: 'feature',
        targetId: featureId,
        targetKey: row.key,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { fields: Object.keys(patch).filter((k) => k !== 'updatedAt') },
      });
    });
  }

  /**
   * Đổi trạng thái feature.
   *
   * Dùng CHUNG `isValidContentTransition` với application — hai thực thể có cùng vòng đời,
   * và viết hai máy trạng thái song song là cách chắc chắn để chúng lệch nhau về sau.
   */
  async changeStatus(
    applicationId: string,
    featureId: string,
    next: CatalogStatus,
    ctx: AdminMutationContext,
  ): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const current = await tx
        .select({ key: features.key, status: features.status })
        .from(features)
        .where(and(eq(features.id, featureId), eq(features.applicationId, applicationId)))
        .limit(1);

      const row = current[0];
      if (!row) throw new CatalogError('NOT_FOUND', 'Không tìm thấy feature.');

      if (!isValidContentTransition(row.status, next)) {
        throw new CatalogError(
          'INVALID_STATUS_TRANSITION',
          `Không thể chuyển từ \`${row.status}\` sang \`${next}\`.`,
        );
      }

      await tx
        .update(features)
        .set({ status: next, updatedAt: sql`now()` })
        .where(eq(features.id, featureId));

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'feature.status_changed',
        targetType: 'feature',
        targetId: featureId,
        targetKey: row.key,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { from: row.status, to: next },
      });
    });
  }
}

function toView(row: typeof features.$inferSelect): FeatureView {
  return {
    id: row.id,
    key: row.key,
    displayName: row.displayName,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  const layers = [err, (err as { cause?: unknown } | null)?.cause];
  return layers.some(
    (e) => typeof e === 'object' && e !== null && 'code' in e && e.code === UNIQUE_VIOLATION,
  );
}
