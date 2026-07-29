import {
  customType,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { controlPlane } from '../account/schema.js';

/**
 * Module Site Content sở hữu `nav_menus`, `nav_items`, `nav_item_translations` (0010),
 * `site_settings` (0011) và `content_slots` (0013).
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

/**
 * Cài đặt chung của site. Khớp migration 0011.
 *
 * Danh mục khoá ĐÓNG (CHECK ở migration): thêm một cài đặt là migration mới, không phải việc
 * code tự làm được. Nhờ vậy bảng key–value này không trượt thành sọt chứa mọi thứ.
 */
export const SITE_SETTING_KEYS = ['logo.url'] as const;
export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number];

export const siteSettings = controlPlane.table(
  'site_settings',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull(),
    /** NULL = chưa đặt. Trạng thái hợp lệ, không phải lỗi. */
    value: text('value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('site_settings_key_key').on(table.key)],
);

export type SiteSettingRow = typeof siteSettings.$inferSelect;

/**
 * Danh mục MIME ĐÓNG cho tài sản site — khớp CHECK ở migration 0015.
 *
 * KHÔNG có SVG: SVG là XML chạy được, phục vụ file người dùng tải lên từ origin của chính
 * mình là một đường XSS.
 */
export const SITE_ASSET_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type SiteAssetMime = (typeof SITE_ASSET_MIMES)[number];

/** Trần kích thước file — khớp CHECK `site_assets_size_check`. */
export const SITE_ASSET_MAX_BYTES = 512 * 1024;

export const SITE_ASSET_KEYS = ['logo.image'] as const;
export type SiteAssetKey = (typeof SITE_ASSET_KEYS)[number];

/**
 * Tài sản nhị phân của site (hiện: file logo). Khớp migration 0015.
 *
 * Bytea trong PostgreSQL là CÓ CHỦ ĐÍCH cho MỘT file nhỏ đọc qua cache — không phải thư
 * viện media; ảnh catalog sau này thuộc về object storage (DEC-T12).
 */
export const siteAssets = controlPlane.table(
  'site_assets',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull(),
    mime: text('mime').notNull(),
    data: customType<{ data: Buffer }>({ dataType: () => 'bytea' })('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('site_assets_key_key').on(table.key)],
);

export type SiteAssetRow = typeof siteAssets.$inferSelect;

/**
 * Khoá khe nội dung — danh mục ĐÓNG, PHẢI khớp CHECK ở migration 0013 và enum
 * `ContentSlotKey` trong OpenAPI.
 *
 * Khoá là ĐƯỜNG DẪN trong message catalog của web (`home.heroTitle` → `t.home.heroTitle`);
 * web merge giá trị DB đè lên catalog, nên khoá không có hàng = trang dùng chữ trong code.
 * Nhóm `seo.description.*` là ngoại lệ không có bản dự phòng: chưa đặt thì trang không phát
 * thẻ description — đúng hành vi trước khi có CMS.
 */
export const CONTENT_SLOT_KEYS = [
  'home.heroTitle',
  'home.heroLead',
  'home.statToolCount',
  'home.statCategoryCount',
  'home.statUpdated',
  'home.toolsTitle',
  'home.toolsLead',
  'home.categoriesTitle',
  'home.whatsNewTitle',
  'home.whatsNewLead',
  'home.blogTitle',
  'home.faqTitle',
  'home.faqLead',
  'tools.title',
  'tools.lead',
  'blog.title',
  'blog.lead',
  'blog.latestTitle',
  'blog.featuredTitle',
  'blog.trendingTitle',
  'comingSoon.categoriesTitle',
  'comingSoon.categoriesDescription',
  'comingSoon.contactTitle',
  'comingSoon.contactDescription',
  'comingSoon.submitTitle',
  'comingSoon.submitDescription',
  'footer.tagline',
  'newsletter.title',
  'newsletter.text',
  'meta.home',
  'meta.tools',
  'meta.blog',
  'meta.categories',
  'meta.contact',
  'meta.submit',
  'seo.description.home',
  'seo.description.tools',
  'seo.description.blog',
  'seo.description.categories',
  'seo.description.contact',
  'seo.description.submit',
  // Văn bản pháp lý (0014) — thân trang `/terms` và `/privacy`. Chữ dài, không có bản dự
  // phòng trong catalog: chưa soạn thì trang hiện thông báo "đang cập nhật".
  'legal.terms',
  'legal.privacy',
] as const;

export type ContentSlotKey = (typeof CONTENT_SLOT_KEYS)[number];

export const contentSlots = controlPlane.table(
  'content_slots',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull(),
    locale: text('locale').notNull(),
    /** KHÔNG NULL, KHÔNG rỗng — "chưa đặt" biểu diễn bằng việc không có hàng. */
    value: text('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('content_slots_key_locale_key').on(table.key, table.locale)],
);

export type ContentSlotRow = typeof contentSlots.$inferSelect;
