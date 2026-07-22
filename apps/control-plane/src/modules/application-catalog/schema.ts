import { foreignKey, index, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { controlPlane } from '../account/schema.js';

/**
 * Module Catalog sở hữu `applications`, `application_redirect_uris`, `features`,
 * `usage_metrics`. Khớp migration 0007.
 *
 * SQL-first (DEC-T09): migration là nguồn sự thật của DDL. File này chỉ để query có type,
 * KHÔNG dùng `drizzle-kit push`.
 */

/** Vòng đời dùng chung cho application, feature và metric. */
export const CATALOG_STATUSES = ['draft', 'active', 'inactive'] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

/** Loại redirect. Danh mục ĐÓNG, khớp CHECK trong migration. */
export const REDIRECT_PURPOSES = ['login', 'logout'] as const;
export type RedirectPurpose = (typeof REDIRECT_PURPOSES)[number];

export const applications = controlPlane.table(
  'applications',
  {
    id: uuid('id').primaryKey(),
    /** Machine key ổn định. Code và policy tham chiếu key, KHÔNG tham chiếu displayName. */
    key: text('key').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    /** Chỉ URL, không binary. Ảnh nằm trên object storage (DEC-T12). */
    imageUrl: text('image_url'),
    launchUrl: text('launch_url').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('applications_key_key').on(table.key),
    index('applications_status_idx').on(table.status),
  ],
);

export type ApplicationRow = typeof applications.$inferSelect;

export const applicationRedirectUris = controlPlane.table(
  'application_redirect_uris',
  {
    id: uuid('id').primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'restrict' }),
    purpose: text('purpose').notNull(),
    /** Exact-match, đã canonicalize. KHÔNG wildcard — xem ghi chú ở migration 0007. */
    uri: text('uri').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('application_redirect_uris_exact_key').on(
      table.applicationId,
      table.purpose,
      table.uri,
    ),
  ],
);

export type ApplicationRedirectUriRow = typeof applicationRedirectUris.$inferSelect;

export const features = controlPlane.table(
  'features',
  {
    id: uuid('id').primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'restrict' }),
    /** Ổn định TRONG PHẠM VI app. Hai app khác nhau được phép trùng key. */
    key: text('key').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('features_application_key_key').on(table.applicationId, table.key),
    // Unique "thừa" về logic nhưng bắt buộc kỹ thuật: đích của composite FK từ usage_metrics.
    uniqueIndex('features_id_application_key').on(table.id, table.applicationId),
    index('features_application_status_idx').on(table.applicationId, table.status),
  ],
);

export type FeatureRow = typeof features.$inferSelect;

/** Mốc tính lượt. `null` tới khi P5 duyệt. */
export const COUNTING_POINTS = ['start', 'milestone', 'success'] as const;
/** Xử lý khi hành động thất bại. `null` tới khi P5 duyệt. */
export const FAILURE_TREATMENTS = ['commit', 'cancel', 'policy_defined'] as const;

export const usageMetrics = controlPlane.table(
  'usage_metrics',
  {
    id: uuid('id').primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'restrict' }),
    featureId: uuid('feature_id').notNull(),
    key: text('key').notNull(),
    displayName: text('display_name').notNull(),
    /** `NOT NULL` và giá trị cụ thể cần chủ dự án duyệt (DEC-B05). */
    unit: text('unit').notNull(),
    countingPoint: text('counting_point'),
    failureTreatment: text('failure_treatment'),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // COMPOSITE FK: metric phải trỏ tới feature CÙNG application.
    //
    // Chỉ FK đơn `featureId -> features.id` sẽ cho phép metric của app A trỏ feature app B,
    // và lúc tính quota hệ thống đếm nhầm hạn mức giữa hai app.
    foreignKey({
      name: 'usage_metrics_feature_application_fk',
      columns: [table.featureId, table.applicationId],
      foreignColumns: [features.id, features.applicationId],
    }).onDelete('restrict'),
    uniqueIndex('usage_metrics_application_key_key').on(table.applicationId, table.key),
    uniqueIndex('usage_metrics_id_application_key').on(table.id, table.applicationId),
    uniqueIndex('usage_metrics_id_feature_application_key').on(
      table.id,
      table.featureId,
      table.applicationId,
    ),
    index('usage_metrics_feature_idx').on(table.featureId),
    index('usage_metrics_application_status_idx').on(table.applicationId, table.status),
  ],
);

export type UsageMetricRow = typeof usageMetrics.$inferSelect;
