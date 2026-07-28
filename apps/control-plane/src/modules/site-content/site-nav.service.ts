import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { isValidContentTransition } from '../../shared/content-status.js';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { loadEnv } from '../../shared/env.js';
import { parseAllowedHosts, type UrlPolicyOptions } from '../../shared/url-policy.js';
import type { AdminMutationContext } from '../admin/admin.service.js';
import { appendAuditEvent } from '../audit/audit.js';
import { checkNavHref } from './nav-href.js';
import {
  NAV_LOCALES,
  NAV_MENU_KEYS,
  type NavLocale,
  type NavMenuKey,
  type NavStatus,
  navItems,
  navItemTranslations,
} from './schema.js';

/** Một mục như người dùng cuối nhìn thấy. Không có `status` — họ chỉ thấy mục `active`. */
export interface PublicNavItem {
  id: string;
  label: string;
  href: string;
}

export interface PublicNavMenu {
  key: NavMenuKey;
  items: PublicNavItem[];
}

export interface SiteNavView {
  locale: NavLocale;
  menus: PublicNavMenu[];
}

/** View quản trị: mọi trạng thái, mọi ngôn ngữ. */
export interface AdminNavItemView {
  id: string;
  menuKey: NavMenuKey;
  sortOrder: number;
  href: string;
  status: string;
  labels: { vi?: string | null; en?: string | null };
  createdAt: string;
  updatedAt: string;
}

export class SiteNavError extends Error {
  constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'INVALID_HREF'
      | 'INVALID_STATUS_TRANSITION'
      | 'INVALID_REORDER'
      | 'NO_LABEL',
    message: string,
  ) {
    super(message);
    this.name = 'SiteNavError';
  }
}

export interface NavLabelsInput {
  vi?: string | null | undefined;
  en?: string | null | undefined;
}

export interface CreateNavItemInput {
  menuKey: NavMenuKey;
  href: string;
  labels: NavLabelsInput;
  sortOrder?: number | undefined;
}

export interface UpdateNavItemInput {
  href?: string | undefined;
  labels?: NavLabelsInput | undefined;
}

/**
 * Điều hướng site (header + footer) do quản trị viên sửa.
 *
 * BA NGUYÊN TẮC:
 *
 * 1. **Code giữ BỐ CỤC, dữ liệu giữ NỘI DUNG.** Bảng này quyết định menu có mục nào, nhãn
 *    là gì và trỏ đi đâu. Số cột, thứ tự section và cấu trúc HTML vẫn nằm trong code và đi
 *    qua review.
 *
 * 2. **`href` đi qua chính sách trước khi chạm database.** Database cố ý chấp nhận
 *    `//evil.com` — chặn nó là việc của `checkNavHref`. Cùng ranh giới DB/application như
 *    `launchUrl` của catalog (modular.md mục 5.4).
 *
 * 3. **Thiếu bản dịch thì BỎ QUA mục, không rơi về ngôn ngữ khác.** Một mục menu tiếng Việt
 *    nằm giữa header tiếng Anh trông như lỗi hiển thị; thiếu hẳn một mục thì ít gây hiểu
 *    nhầm hơn. Khác với message catalog trong code — ở đó fallback là đúng, vì mọi khoá đều
 *    được typecheck bảo đảm tồn tại.
 */
@Injectable()
export class SiteNavService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  /** Cấu hình chính sách URL cho `href` ngoài. Dùng chung allowlist với catalog. */
  private urlPolicyOptions(): UrlPolicyOptions {
    const env = loadEnv();
    return {
      allowedHosts: parseAllowedHosts(env.CATALOG_ALLOWED_HOSTS),
      allowInsecureLoopback: env.NODE_ENV === 'development',
    };
  }

  private requireValidHref(raw: string): string {
    const result = checkNavHref(raw, this.urlPolicyOptions());
    if (!result.ok || result.value === undefined) {
      throw new SiteNavError('INVALID_HREF', `\`href\`: ${result.message ?? 'không hợp lệ.'}`);
    }
    return result.value;
  }

  // ── Đường đọc ────────────────────────────────────────────────────────────────

  /**
   * Điều hướng cho người dùng cuối, một ngôn ngữ.
   *
   * Trả về ĐỦ BỐN menu kể cả khi menu rỗng: web dựng khung footer theo danh sách cố định,
   * và một menu vắng mặt sẽ khiến nó phải đoán xem đó là "chưa có mục nào" hay "lỗi tải".
   */
  async getPublicNav(locale: NavLocale): Promise<SiteNavView> {
    const rows = await this.database.db
      .select({
        id: navItems.id,
        menuKey: navItems.menuKey,
        href: navItems.href,
        sortOrder: navItems.sortOrder,
        label: navItemTranslations.label,
      })
      .from(navItems)
      // INNER JOIN, không phải LEFT JOIN: mục thiếu bản dịch cho ngôn ngữ này bị loại khỏi
      // kết quả — đó chính là nguyên tắc 3 ở trên, hiện thực bằng chính phép join.
      .innerJoin(
        navItemTranslations,
        and(eq(navItemTranslations.navItemId, navItems.id), eq(navItemTranslations.locale, locale)),
      )
      .where(eq(navItems.status, 'active'))
      .orderBy(asc(navItems.menuKey), asc(navItems.sortOrder));

    const byMenu = new Map<NavMenuKey, PublicNavItem[]>(NAV_MENU_KEYS.map((key) => [key, []]));

    for (const row of rows) {
      // `menu_key` bị CHECK constraint khoá, nên giá trị lạ là bất khả — nhưng kiểu của
      // Drizzle là `string`, và im lặng bỏ qua an toàn hơn là ép kiểu.
      const bucket = byMenu.get(row.menuKey as NavMenuKey);
      if (!bucket) continue;
      bucket.push({ id: row.id, label: row.label, href: row.href });
    }

    return {
      locale,
      menus: NAV_MENU_KEYS.map((key) => ({ key, items: byMenu.get(key) ?? [] })),
    };
  }

  /** Danh sách quản trị: mọi trạng thái, kèm nhãn của mọi ngôn ngữ. */
  async listForAdmin(): Promise<AdminNavItemView[]> {
    const items = await this.database.db
      .select()
      .from(navItems)
      .orderBy(asc(navItems.menuKey), asc(navItems.sortOrder));

    if (items.length === 0) return [];

    const translations = await this.database.db
      .select()
      .from(navItemTranslations)
      .where(
        inArray(
          navItemTranslations.navItemId,
          items.map((i) => i.id),
        ),
      );

    const labelsByItem = new Map<string, { vi?: string | null; en?: string | null }>();
    for (const t of translations) {
      const entry = labelsByItem.get(t.navItemId) ?? {};
      entry[t.locale as NavLocale] = t.label;
      labelsByItem.set(t.navItemId, entry);
    }

    return items.map((row) => ({
      id: row.id,
      menuKey: row.menuKey as NavMenuKey,
      sortOrder: row.sortOrder,
      href: row.href,
      status: row.status,
      labels: labelsByItem.get(row.id) ?? {},
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  // ── Đường ghi ────────────────────────────────────────────────────────────────

  /**
   * Thêm một mục. Luôn ở trạng thái `draft`.
   *
   * Không cho tạo thẳng `active`: đưa mục lên header/footer là hành động riêng cần
   * `content:publish` — cùng lập luận với catalog.
   */
  async create(input: CreateNavItemInput, ctx: AdminMutationContext): Promise<string> {
    const href = this.requireValidHref(input.href);
    const labels = normaliseLabels(input.labels);

    if (Object.keys(labels).length === 0) {
      throw new SiteNavError('NO_LABEL', 'Phải có ít nhất một nhãn (vi hoặc en).');
    }

    const id = uuidv7();

    await this.database.db.transaction(async (tx) => {
      const sortOrder =
        input.sortOrder ?? (await nextSortOrder(tx as unknown as Tx, input.menuKey));

      await tx.insert(navItems).values({
        id,
        menuKey: input.menuKey,
        sortOrder,
        href,
        status: 'draft',
      });

      for (const [locale, label] of Object.entries(labels)) {
        await tx.insert(navItemTranslations).values({
          id: uuidv7(),
          navItemId: id,
          locale,
          label: label as string,
        });
      }

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'nav_item.created',
        targetType: 'nav_item',
        targetId: id,
        targetKey: input.menuKey,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { href, locales: Object.keys(labels) },
      });
    });

    return id;
  }

  /**
   * Sửa `href` và nhãn. KHÔNG sửa `status` (đường riêng, permission riêng) và KHÔNG sửa
   * `menuKey` — chuyển mục sang menu khác là xoá và tạo lại, để audit nói đúng chuyện đã xảy ra.
   */
  async update(id: string, input: UpdateNavItemInput, ctx: AdminMutationContext): Promise<void> {
    const href = input.href !== undefined ? this.requireValidHref(input.href) : undefined;

    await this.database.db.transaction(async (tx) => {
      const existing = await tx
        .select({ menuKey: navItems.menuKey })
        .from(navItems)
        .where(eq(navItems.id, id))
        .limit(1);

      const row = existing[0];
      if (!row) throw new SiteNavError('NOT_FOUND', 'Không tìm thấy mục điều hướng.');

      if (href !== undefined) {
        await tx.update(navItems).set({ href, updatedAt: sql`now()` }).where(eq(navItems.id, id));
      }

      const touched: string[] = [];

      if (input.labels !== undefined) {
        for (const locale of NAV_LOCALES) {
          const value = input.labels[locale];
          // Không gửi khoá này → không đụng tới bản dịch đó.
          if (value === undefined) continue;

          touched.push(locale);
          const trimmed = typeof value === 'string' ? value.trim() : '';

          if (trimmed === '') {
            // `null` hoặc chuỗi rỗng = XOÁ bản dịch. Mục sẽ biến mất khỏi ngôn ngữ đó ở
            // đường công khai — đúng ý người biên tập, và không có nhãn rỗng nào lọt vào DB.
            await tx
              .delete(navItemTranslations)
              .where(
                and(eq(navItemTranslations.navItemId, id), eq(navItemTranslations.locale, locale)),
              );
            continue;
          }

          // Upsert theo (nav_item_id, locale) — unique index là đích của `onConflict`.
          await tx
            .insert(navItemTranslations)
            .values({ id: uuidv7(), navItemId: id, locale, label: trimmed })
            .onConflictDoUpdate({
              target: [navItemTranslations.navItemId, navItemTranslations.locale],
              set: { label: trimmed, updatedAt: sql`now()` },
            });
        }
      }

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'nav_item.updated',
        targetType: 'nav_item',
        targetId: id,
        targetKey: row.menuKey,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { hrefChanged: href !== undefined, locales: touched },
      });
    });
  }

  /**
   * Đưa mục lên giao diện hoặc gỡ xuống.
   *
   * Chuyển tiếp hợp lệ giống catalog: `draft → active ⇄ inactive`, KHÔNG quay lại `draft`.
   * Mục đã từng hiển thị công khai không thể trở lại trạng thái "chưa từng phát hành" —
   * dấu vết lịch sử sẽ nói dối.
   */
  async changeStatus(id: string, next: NavStatus, ctx: AdminMutationContext): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const rows = await tx
        .select({ status: navItems.status, menuKey: navItems.menuKey })
        .from(navItems)
        .where(eq(navItems.id, id))
        .limit(1);

      const row = rows[0];
      if (!row) throw new SiteNavError('NOT_FOUND', 'Không tìm thấy mục điều hướng.');

      if (!isValidContentTransition(row.status, next)) {
        throw new SiteNavError(
          'INVALID_STATUS_TRANSITION',
          `Không thể chuyển từ \`${row.status}\` sang \`${next}\`.`,
        );
      }

      await tx
        .update(navItems)
        .set({ status: next, updatedAt: sql`now()` })
        .where(eq(navItems.id, id));

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: `nav_item.${next === 'active' ? 'published' : 'unpublished'}`,
        targetType: 'nav_item',
        targetId: id,
        targetKey: row.menuKey,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { from: row.status, to: next },
      });
    });
  }

  /**
   * Sắp xếp lại toàn bộ một menu.
   *
   * NHẬN TRỌN DANH SÁCH, không nhận "đổi chỗ hai mục". Gửi trọn danh sách khiến kết quả
   * không phụ thuộc thứ tự request tới, nên hai người biên tập thao tác cùng lúc không tạo
   * ra một thứ tự lai giữa hai ý định.
   *
   * DỰA VÀO UNIQUE DEFERRABLE: trong lúc gán lại chỉ số, hai hàng sẽ tạm thời trùng
   * `sort_order`. Ràng buộc `nav_items_menu_sort_key` khai `DEFERRABLE INITIALLY DEFERRED`
   * ở migration 0010 nên phép kiểm dời tới lúc COMMIT. Không có nó, câu UPDATE thứ hai đã
   * fail dù trạng thái cuối hoàn toàn hợp lệ.
   */
  async reorder(menuKey: NavMenuKey, itemIds: string[], ctx: AdminMutationContext): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const current = await tx
        .select({ id: navItems.id })
        .from(navItems)
        .where(eq(navItems.menuKey, menuKey));

      const currentIds = new Set(current.map((r) => r.id));
      const givenIds = new Set(itemIds);

      // Phải khớp TRỌN VẸN. Thiếu id nào thì mục đó giữ chỉ số cũ và có thể đụng độ với chỉ
      // số mới; thừa id thì người gọi đang nghĩ menu này chứa thứ nó không chứa. Cả hai đều
      // là dấu hiệu client và server đang bất đồng về trạng thái — dừng lại an toàn hơn.
      if (givenIds.size !== itemIds.length) {
        throw new SiteNavError('INVALID_REORDER', 'Danh sách chứa id trùng lặp.');
      }
      if (givenIds.size !== currentIds.size || itemIds.some((id) => !currentIds.has(id))) {
        throw new SiteNavError(
          'INVALID_REORDER',
          'Danh sách phải chứa đúng và đủ mọi mục của menu này.',
        );
      }

      for (const [index, id] of itemIds.entries()) {
        await tx
          .update(navItems)
          .set({ sortOrder: index, updatedAt: sql`now()` })
          .where(eq(navItems.id, id));
      }

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'nav_menu.reordered',
        targetType: 'nav_menu',
        targetKey: menuKey,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { order: itemIds },
      });
    });
  }

  /**
   * Xoá một mục.
   *
   * CÓ xoá thật ở đây, khác với catalog. Lý do: một mục menu không được entitlement, quota
   * hay dữ liệu usage nào tham chiếu, nên xoá nó không để lại bản ghi mồ côi. Bản dịch đi
   * theo bằng `ON DELETE CASCADE`.
   *
   * Vẫn ghi audit kèm lý do — nội dung này đã từng hiển thị công khai.
   */
  async remove(id: string, ctx: AdminMutationContext): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const rows = await tx
        .delete(navItems)
        .where(eq(navItems.id, id))
        .returning({ menuKey: navItems.menuKey, href: navItems.href });

      const row = rows[0];
      if (!row) throw new SiteNavError('NOT_FOUND', 'Không tìm thấy mục điều hướng.');

      await appendAuditEvent(tx, {
        actor: { type: 'account', accountId: ctx.actorAccountId },
        action: 'nav_item.deleted',
        targetType: 'nav_item',
        targetId: id,
        targetKey: row.menuKey,
        reason: ctx.reason,
        correlationId: ctx.correlationId,
        details: { href: row.href },
      });
    });
  }
}

/** Kiểu tối thiểu của transaction mà `nextSortOrder` cần. */
type Tx = Pick<DatabaseClient['db'], 'select'>;

/** Chỉ số kế tiếp trong menu. Menu rỗng → 0. */
async function nextSortOrder(tx: Tx, menuKey: string): Promise<number> {
  const rows = await tx
    .select({ max: sql<number | null>`max(${navItems.sortOrder})` })
    .from(navItems)
    .where(eq(navItems.menuKey, menuKey));

  const max = rows[0]?.max;
  return max === null || max === undefined ? 0 : Number(max) + 1;
}

/** Bỏ nhãn rỗng/khoảng trắng; giữ lại đúng những ngôn ngữ thật sự có chữ. */
function normaliseLabels(input: NavLabelsInput): Record<string, string> {
  const out: Record<string, string> = {};
  for (const locale of NAV_LOCALES) {
    const value = input[locale];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed !== '') out[locale] = trimmed;
  }
  return out;
}
