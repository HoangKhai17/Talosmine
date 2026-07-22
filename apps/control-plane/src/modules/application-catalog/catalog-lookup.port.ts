/**
 * `CatalogLookupPort` — cổng tra cứu danh mục cho các module KHÁC.
 *
 * VÌ SAO CẦN CỔNG NÀY THAY VÌ ĐỌC THẲNG BẢNG:
 *
 * P4 (gói dịch vụ / entitlement) và P5 (hạn mức) sẽ liên tục phải trả lời "feature
 * `xuat-bao-cao` của app `ke-toan` là feature nào" và "feature này có đúng thuộc app này
 * không". Cách dễ nhất là `import { features } from '../application-catalog/schema.js'` rồi
 * tự viết truy vấn. Làm vậy một lần thì vô hại; làm vậy ở năm chỗ thì:
 *
 *   - Đổi cột trong Catalog phải sửa năm nơi, và không grep nào chắc chắn tìm hết.
 *   - Quy tắc "feature phải cùng app" bị mỗi nơi tự kiểm một kiểu, rồi có nơi quên.
 *   - Không còn ai trả lời được câu "ai đang đọc bảng này".
 *
 * Cổng đóng cả ba lỗ đó bằng một chỗ duy nhất. `modular.md` gọi đây là ranh giới module.
 *
 * NGUYÊN TẮC "METADATA TỐI THIỂU": các view ở đây CỐ Ý nghèo nàn. Không có `launchUrl`,
 * không có `description`, không có `imageUrl`. Entitlement không cần chúng, và mỗi trường
 * thừa là một trường mà consumer sẽ bắt đầu phụ thuộc vào — rồi Catalog không đổi được nữa.
 *
 * CỔNG TRẢ VỀ CẢ `status`, KHÔNG TỰ LỌC. Đây là quyết định có chủ đích: gán quyền cho một
 * feature còn `draft` là hợp lệ (chuẩn bị gói trước khi phát hành), nhưng CHO DÙNG nó thì
 * không. Hai câu hỏi khác nhau, và cổng không được đoán hộ. Consumer đọc `status` rồi tự
 * quyết định theo ngữ cảnh của mình.
 *
 * Cổng chỉ ĐỌC. Không có phương thức nào ghi — mọi thay đổi danh mục đi qua controller của
 * Catalog, nơi có RBAC và audit.
 */

/** Token DI. Consumer inject token này, không inject class implementation. */
export const CATALOG_LOOKUP_PORT = Symbol('CATALOG_LOOKUP_PORT');

export type CatalogEntityStatus = 'draft' | 'active' | 'inactive';

/** Metadata tối thiểu của một ứng dụng. */
export interface ApplicationRef {
  id: string;
  key: string;
  status: CatalogEntityStatus;
}

/**
 * Metadata tối thiểu của một feature, KÈM ứng dụng sở hữu nó.
 *
 * `applicationId` luôn có mặt để consumer không phải tra thêm một lượt nữa chỉ để biết
 * feature này thuộc về ai — và để không ai bị cám dỗ bỏ qua bước đó.
 */
export interface FeatureRef {
  id: string;
  key: string;
  status: CatalogEntityStatus;
  applicationId: string;
  applicationKey: string;
}

/** Metadata tối thiểu của một chỉ số sử dụng. */
export interface UsageMetricRef {
  id: string;
  key: string;
  status: CatalogEntityStatus;
  unit: string;
  applicationId: string;
  /** Luôn có: `usage_metrics.feature_id` là `NOT NULL` — mỗi chỉ số đo đúng một feature. */
  featureId: string;
}

export interface CatalogLookupPort {
  /** `null` nếu không có ứng dụng nào mang `key` này. */
  findApplicationByKey(key: string): Promise<ApplicationRef | null>;

  /**
   * Tra feature theo cặp `(applicationKey, featureKey)`.
   *
   * KHÔNG có phương thức tra feature bằng mỗi `featureKey`, và đó là chủ đích: `key` của
   * feature chỉ duy nhất TRONG một ứng dụng, hai ứng dụng khác nhau được phép trùng key.
   * Một hàm nhận mỗi `featureKey` sẽ hoặc trả nhầm feature của app khác, hoặc buộc phải
   * đoán — cả hai đều tệ hơn là không có hàm đó.
   */
  findFeature(applicationKey: string, featureKey: string): Promise<FeatureRef | null>;

  /** Cùng quy tắc phạm vi với feature: `key` chỉ duy nhất trong một ứng dụng. */
  findUsageMetric(applicationKey: string, metricKey: string): Promise<UsageMetricRef | null>;

  /**
   * Feature `featureId` có đúng thuộc ứng dụng `applicationId` không.
   *
   * Có sẵn ở đây để consumer không phải tự viết lại phép kiểm này — đây chính là phép kiểm
   * mà nếu quên, app A sẽ gán được quyền lên feature của app B.
   */
  featureBelongsToApplication(featureId: string, applicationId: string): Promise<boolean>;

  /**
   * URI này có nằm trong allowlist redirect của ứng dụng, đúng `purpose` đó không.
   *
   * SO KHỚP CHÍNH XÁC TỪNG KÝ TỰ sau khi chuẩn hoá. Không tiền tố, không ký tự đại diện,
   * không "gần đúng thì cho qua". URI không phân giải được cũng trả `false` chứ không ném
   * lỗi — với người gọi thì "URI rác" và "URI không có trong danh sách" cùng một kết luận.
   */
  isAllowedRedirectUri(
    applicationKey: string,
    purpose: 'login' | 'logout',
    uri: string,
  ): Promise<boolean>;
}
