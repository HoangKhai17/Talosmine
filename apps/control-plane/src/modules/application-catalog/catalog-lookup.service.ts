import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../../shared/database.js';
import { DATABASE_CLIENT } from '../../shared/database.module.js';
import { loadEnv } from '../../shared/env.js';
import { checkUrlSyntax, parseAllowedHosts } from '../../shared/url-policy.js';
import type {
  ApplicationRef,
  CatalogEntityStatus,
  CatalogLookupPort,
  FeatureRef,
  UsageMetricRef,
} from './catalog-lookup.port.js';
import { applicationRedirectUris, applications, features, usageMetrics } from './schema.js';

/**
 * Hiện thực `CatalogLookupPort`.
 *
 * Đây là NƠI DUY NHẤT ngoài module Catalog được phép chạm tới bảng catalog — nói đúng hơn,
 * nó nằm TRONG Catalog và là cửa duy nhất mở ra ngoài. Consumer inject `CATALOG_LOOKUP_PORT`
 * chứ không inject class này.
 *
 * Mọi phương thức chỉ ĐỌC. Không có transaction, không có audit, vì không có gì thay đổi.
 */
@Injectable()
export class CatalogLookupService implements CatalogLookupPort {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async findApplicationByKey(key: string): Promise<ApplicationRef | null> {
    const rows = await this.database.db
      .select({
        id: applications.id,
        key: applications.key,
        status: applications.status,
      })
      .from(applications)
      .where(eq(applications.key, normalizeKey(key)))
      .limit(1);

    const row = rows[0];
    return row ? { ...row, status: row.status as CatalogEntityStatus } : null;
  }

  /**
   * MỘT truy vấn có JOIN, không phải hai truy vấn nối tiếp.
   *
   * Tra app trước rồi tra feature sau sẽ mở một khoảng thời gian giữa hai lượt đọc: app có
   * thể bị đổi trạng thái ở giữa, và kết quả trả về là ghép của hai thời điểm khác nhau.
   * JOIN cho một ảnh chụp nhất quán, và cũng bớt một vòng đi lại tới database.
   *
   * `and(eq(...), eq(...))` chính là phép kiểm quyền sở hữu: feature phải mang đúng
   * `application_id` của app vừa khớp key. Không có nó, biết `featureKey` của app khác là
   * đủ để lấy nhầm.
   */
  async findFeature(applicationKey: string, featureKey: string): Promise<FeatureRef | null> {
    const rows = await this.database.db
      .select({
        id: features.id,
        key: features.key,
        status: features.status,
        applicationId: features.applicationId,
        applicationKey: applications.key,
      })
      .from(features)
      .innerJoin(applications, eq(features.applicationId, applications.id))
      .where(
        and(
          eq(applications.key, normalizeKey(applicationKey)),
          eq(features.key, normalizeKey(featureKey)),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? { ...row, status: row.status as CatalogEntityStatus } : null;
  }

  async findUsageMetric(applicationKey: string, metricKey: string): Promise<UsageMetricRef | null> {
    const rows = await this.database.db
      .select({
        id: usageMetrics.id,
        key: usageMetrics.key,
        status: usageMetrics.status,
        unit: usageMetrics.unit,
        applicationId: usageMetrics.applicationId,
        featureId: usageMetrics.featureId,
      })
      .from(usageMetrics)
      .innerJoin(applications, eq(usageMetrics.applicationId, applications.id))
      .where(
        and(
          eq(applications.key, normalizeKey(applicationKey)),
          eq(usageMetrics.key, normalizeKey(metricKey)),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? { ...row, status: row.status as CatalogEntityStatus } : null;
  }

  async featureBelongsToApplication(featureId: string, applicationId: string): Promise<boolean> {
    const rows = await this.database.db
      .select({ id: features.id })
      .from(features)
      .where(and(eq(features.id, featureId), eq(features.applicationId, applicationId)))
      .limit(1);

    return rows.length > 0;
  }

  /**
   * So khớp allowlist redirect.
   *
   * URI ĐẦU VÀO PHẢI ĐƯỢC CHUẨN HOÁ TRƯỚC KHI SO. Trong bảng, URI đã ở dạng chuẩn hoá (xem
   * `redirect-uri.service.ts`). So chuỗi thô của người gọi với chuỗi đã chuẩn hoá trong
   * bảng sẽ trượt ở những cặp trỏ CÙNG một nơi — `https://a.com:443/cb` và
   * `https://a.com/cb` là một, nhưng khác nhau từng ký tự.
   *
   * Trượt ở đây không phải lỗi hiển thị: nó khiến một redirect hợp lệ bị từ chối, rồi sẽ có
   * người "sửa" bằng cách nới lỏng phép so — và đó là lúc lỗ hổng ra đời.
   *
   * URI không phân giải được trả `false`, không ném lỗi: với người gọi thì "URI rác" và
   * "URI không có trong danh sách" dẫn tới cùng một quyết định.
   */
  async isAllowedRedirectUri(
    applicationKey: string,
    purpose: 'login' | 'logout',
    uri: string,
  ): Promise<boolean> {
    const env = loadEnv();
    const result = checkUrlSyntax(uri, {
      allowedHosts: parseAllowedHosts(env.CATALOG_ALLOWED_HOSTS),
      allowInsecureLoopback: env.NODE_ENV === 'development',
    });
    if (!result.ok || !result.canonical) return false;

    const rows = await this.database.db
      .select({ id: applicationRedirectUris.id })
      .from(applicationRedirectUris)
      .innerJoin(applications, eq(applicationRedirectUris.applicationId, applications.id))
      .where(
        and(
          eq(applications.key, normalizeKey(applicationKey)),
          eq(applicationRedirectUris.purpose, purpose),
          eq(applicationRedirectUris.uri, result.canonical),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }
}

/**
 * Key được lưu ở dạng chữ thường (controller ép `toLowerCase` khi tạo). Chuẩn hoá ở đây để
 * người gọi không phải nhớ luật đó — quên một lần là tra không ra trong khi dữ liệu có thật.
 */
function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}
