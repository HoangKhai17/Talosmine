import type { Metadata } from 'next';
import {
  localeAlternates,
  type PageLocaleParams,
  resolvePageI18n,
} from '../../../../../i18n/params';
import styles from '../shared.module.css';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t } = await resolvePageI18n(params);
  return {
    title: t.savedTools.title,
    alternates: localeAlternates(locale, '/account/saved-tools'),
    robots: { index: false, follow: false },
  };
}

/**
 * Công cụ đã lưu.
 *
 * CHƯA CÓ BACKEND: không có bảng bookmark, không có API. Trang này là bố cục thật với trạng
 * thái RỖNG thật.
 *
 * VÌ SAO KHÔNG RENDER THẺ MẪU như trong mockup: một lưới sáu thẻ giả trông y hệt lưới sáu
 * thẻ thật. Sau vài tuần sẽ không ai còn phân biệt được phần nào đã chạy và phần nào chưa —
 * và đó là cách một bản demo âm thầm được báo cáo là tính năng hoàn chỉnh.
 *
 * Ô tìm kiếm và bộ lọc vẫn hiện đúng vị trí thiết kế nhưng `disabled`: giữ được bố cục để
 * đánh giá, mà không giả vờ chạy.
 */
export default async function SavedToolsPage({ params }: PageLocaleParams) {
  const { t } = await resolvePageI18n(params);
  const page = t.savedTools;

  return (
    <div>
      <div className={styles.header}>
        <h1 className="typeH2">{page.title}</h1>
        <p className={`typeBody ${styles.lead}`}>{page.lead}</p>
      </div>

      <section className={styles.card} aria-labelledby="collection-heading">
        <h2 className="typeH3" id="collection-heading">
          {page.manageCollection}
        </h2>

        <div className={styles.grid}>
          <div className={styles.field}>
            <label className="typeBodySmall" htmlFor="saved-search">
              {page.searchPlaceholder}
            </label>
            <input
              id="saved-search"
              type="search"
              className={`typeBody ${styles.input}`}
              placeholder={page.searchPlaceholder}
              disabled
              aria-describedby="saved-not-ready"
            />
          </div>

          <div className={styles.field}>
            <label className="typeBodySmall" htmlFor="saved-category">
              {page.allCategories}
            </label>
            <select
              id="saved-category"
              className={`typeBody ${styles.select}`}
              disabled
              aria-describedby="saved-not-ready"
            >
              <option>{page.allCategories}</option>
            </select>
          </div>
        </div>

        <div>
          <p className="typeCardTitle">{page.emptyTitle}</p>
          <p className={`typeBody ${styles.lead}`}>{page.emptyLead}</p>
        </div>

        <p className={`typeBodySmall ${styles.notReady}`} id="saved-not-ready">
          {t.accountNav.notReady}
        </p>
      </section>
    </div>
  );
}
