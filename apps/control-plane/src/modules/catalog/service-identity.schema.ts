import { index, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { controlPlane } from '../account/schema.js';
import { applications } from './schema.js';

/**
 * `service_identities` — danh tính máy-với-máy của từng ứng dụng. Khớp migration 0008.
 *
 * TUYỆT ĐỐI KHÔNG có cột nào cho client secret, access token hay refresh token
 * (database-schema mục 8.1). Control Plane xác minh token M2M bằng CHỮ KÝ qua JWKS — nó
 * không cần biết secret, nên lưu secret chỉ tạo thêm thứ để mất.
 *
 * Đặt trong module Catalog vì service identity thuộc về một application và ra đời cùng
 * catalog. Khi P3 mở service scope, cân nhắc tách thành module riêng.
 */

export const SERVICE_IDENTITY_STATUSES = ['active', 'revoked'] as const;
export type ServiceIdentityStatus = (typeof SERVICE_IDENTITY_STATUSES)[number];

export const serviceIdentities = controlPlane.table(
  'service_identities',
  {
    id: uuid('id').primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'restrict' }),
    /** Issuer của IdP phát token M2M. Tên trung tính, không gắn nhà cung cấp. */
    issuer: text('issuer').notNull(),
    /** Định danh CÔNG KHAI, không phải secret. */
    clientId: text('client_id').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /** Thu hồi = ghi hai cột này, KHÔNG xoá row. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revocationReason: text('revocation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Cùng nguyên tắc với (issuer, subject) của người dùng: một cặp chỉ thuộc một danh tính.
    uniqueIndex('service_identities_issuer_client_key').on(table.issuer, table.clientId),
    uniqueIndex('service_identities_id_application_key').on(table.id, table.applicationId),
    index('service_identities_application_status_idx').on(table.applicationId, table.status),
  ],
);

export type ServiceIdentityRow = typeof serviceIdentities.$inferSelect;
