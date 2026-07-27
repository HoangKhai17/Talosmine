import { index, integer, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { controlPlane } from '../account/schema.js';

/**
 * Module Site Content sở hữu `nav_menus`, `nav_items`, `nav_item_translations`.
 * Khớp migration 0010.
 *
 * SQL-first (DEC-T09): migration là nguồn sự thật của DDL. File này chỉ để query có type,
 * KHÔNG dùng `drizzle-kit push`.
 */

/**
 * Vị trí đặt menu. Danh mục ĐÓNG, khớp CHECK trong migration 0010.
 *
 * Thêm một vị trí đòi code phải có chỗ render nó — nên đó là migration, không phải dữ liệu
 * người biên tập tạo được từ giao diện.
 */
export const NAV_MENU_KEYS = [
  'header.primary',
  'footer.explore',
  'footer.about',
  'footer.resources',
] as const;

export type NavMenuKey = (typeof NAV_MENU_KEYS)[number];

/** Vòng đời của một mục điều hướng. Cùng bộ ba với catalog, cùng lý do. */
export const NAV_STATUSES = ['draft', 'active', 'inactive'] as const;
export type NavStatus = (typeof NAV_STATUSES)[number];

/** Ngôn ngữ hỗ trợ (DEC-B15). Khớp CHECK ở `nav_item_translations`. */
export const NAV_LOCALES = ['vi', 'en'] as const;
export type NavLocale = (typeof NAV_LOCALES)[number];

export const navMenus = controlPlane.table(
  'nav_menus',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull(),
    displayName: text('display_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('nav_menus_key_key').on(table.key)],
);

export type NavMenuRow = typeof navMenus.$inferSelect;

export const navItems = controlPlane.table(
  'nav_items',
  {
    id: uuid('id').primaryKey(),
    menuKey: text('menu_key')
      .notNull()
      .references(() => navMenus.key, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull(),
    /** Đường dẫn nội bộ hoặc URL ngoài. KHÔNG mang prefix locale — web tự gắn lúc render. */
    href: text('href').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // `nav_items_menu_sort_key` (UNIQUE DEFERRABLE) KHÔNG khai ở đây: Drizzle sinh unique
  // thường, không sinh `DEFERRABLE`. Migration là nguồn sự thật; khai lại sai ở đây chỉ tạo
  // ra một mô tả lệch với database thật.
  (table) => [
    index('nav_items_menu_status_sort_idx').on(table.menuKey, table.status, table.sortOrder),
  ],
);

export type NavItemRow = typeof navItems.$inferSelect;

export const navItemTranslations = controlPlane.table(
  'nav_item_translations',
  {
    id: uuid('id').primaryKey(),
    navItemId: uuid('nav_item_id')
      .notNull()
      .references(() => navItems.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    label: text('label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('nav_item_translations_item_locale_key').on(table.navItemId, table.locale),
  ],
);

export type NavItemTranslationRow = typeof navItemTranslations.$inferSelect;
