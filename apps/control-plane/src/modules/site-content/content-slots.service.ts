import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import type { AdminMutationContext } from '../admin/admin.service.js';
import { appendAuditEvent } from '../audit/audit.js';
import { type ContentSlotKey, contentSlots, NAV_LOCALES, type NavLocale } from './schema.js';

/** Giá trị theo ngôn ngữ. Ở đường ghi: vắng mặt = không đổi, `null`/rỗng = xoá. */
export type SlotValuesInput = Partial<Record<NavLocale, string | null>>;

export interface AdminContentSlotView {
  key: ContentSlotKey;
  values: Partial<Record<NavLocale, string>>;
  updatedAt: string;
}

/**
 * Khe nội dung của các trang tĩnh (migration 0013).
 *
 * HAI QUY TẮC ĐỊNH HÌNH SERVICE NÀY:
 *
 * 1. **"Chưa đặt" = KHÔNG CÓ HÀNG, không phải hàng rỗng.** Web merge kết quả đè lên message
 *    catalog, nên vắng mặt nghĩa là "dùng chữ trong code". Nếu tồn tại hàng giá trị rỗng thì
 *    có hai cách biểu diễn cùng một trạng thái, và một chuỗi rỗng sẽ đè mất chữ dự phòng —
 *    ra một khoảng trắng trên production mà không ai hiểu từ đâu. CHECK ở migration chặn
 *    tầng cuối; ở đây chuẩn hoá sớm để thông điệp lỗi nói được điều dễ hiểu.
 *
 * 2. **Không có vòng đời draft/publish.** Khe là giá trị kiểu `site_settings` (đặt là ăn
 *    sau cache 60s), không phải mục có trạng thái như nav/survey. Thêm draft cho khe nghĩa
 *    là mỗi khe phải giữ HAI giá trị (nháp + đã phát hành) — cái giá đó chỉ đáng khi có
 *    nhu cầu duyệt nội dung thật, và hiện chưa có.
 */
@Injectable()
export class ContentSlotsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  /** Toàn bộ khe ĐÃ ĐẶT của một ngôn ngữ — hình dạng phẳng cho web merge thẳng. */
  async getPublic(locale: NavLocale): Promise<Record<string, string>> {
    const rows = await this.database.db
      .select({ key: contentSlots.key, value: contentSlots.value })
      .from(contentSlots)
      .where(eq(contentSlots.locale, locale));

    const values: Record<string, string> = {};
    for (const row of rows) values[row.key] = row.value;
    return values;
  }

  /** Mọi khe đã đặt, cả hai ngôn ngữ cạnh nhau — cho màn hình quản trị. */
  async listForAdmin(): Promise<AdminContentSlotView[]> {
    const rows = await this.database.db.select().from(contentSlots);

    const byKey = new Map<string, AdminContentSlotView>();
    for (const row of rows) {
      const entry = byKey.get(row.key) ?? {
        key: row.key as ContentSlotKey,
        values: {},
        updatedAt: row.updatedAt.toISOString(),
      };
      entry.values[row.locale as NavLocale] = row.value;
      // Hai hàng vi/en có mốc sửa khác nhau — lấy mốc MỚI nhất làm mốc của khe.
      if (row.updatedAt.toISOString() > entry.updatedAt) {
        entry.updatedAt = row.updatedAt.toISOString();
      }
      byKey.set(row.key, entry);
    }

    return [...byKey.values()];
  }

  /**
   * Đặt hoặc xoá giá trị của một khe.
   *
   * Một transaction cho cả hai ngôn ngữ + audit: sửa vi thành công mà en lỗi giữa chừng sẽ
   * để màn hình quản trị nói dối rằng cả hai đã lưu.
   */
  async set(
    key: ContentSlotKey,
    values: SlotValuesInput,
    ctx: AdminMutationContext,
  ): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const set: string[] = [];
      const cleared: string[] = [];

      for (const locale of NAV_LOCALES) {
        const raw = values[locale];
        if (raw === undefined) continue; // không gửi = không đổi

        const trimmed = typeof raw === 'string' ? raw.trim() : '';

        if (trimmed === '') {
          // `null` hoặc chuỗi rỗng = xoá override, trang quay về chữ mặc định trong code.
          await tx
            .delete(contentSlots)
            .where(and(eq(contentSlots.key, key), eq(contentSlots.locale, locale)));
          cleared.push(locale);
          continue;
        }

        await tx
          .insert(contentSlots)
          .values({ id: uuidv7(), key, locale, value: trimmed })
          .onConflictDoUpdate({
            target: [contentSlots.key, contentSlots.locale],
            set: { value: trimmed, updatedAt: sql`now()` },
          });
        set.push(locale);
      }

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'content_slot.updated',
        targetType: 'content_slot',
        targetKey: key,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        // KHÔNG ghi giá trị chữ vào audit — nó có thể dài và nội dung marketing không phải
        // dữ liệu điều tra; ghi ngôn ngữ nào bị đụng là đủ trả lời "ai đổi gì lúc nào".
        details: { set, cleared },
      });
    });
  }
}
