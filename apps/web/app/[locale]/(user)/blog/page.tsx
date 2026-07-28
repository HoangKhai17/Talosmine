import type { Metadata } from 'next';
import Link from 'next/link';
import { type Locale, localeHref } from '../../../../i18n/locale';
import { format, type Messages } from '../../../../i18n/messages';
import { localeAlternates, type PageLocaleParams, resolvePageI18n } from '../../../../i18n/params';
import { ArticleCard } from '../article-card';
import { Breadcrumb } from '../breadcrumb';
import { SearchIcon } from '../icons';
import { Newsletter } from '../newsletter';
import styles from './page.module.css';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t } = await resolvePageI18n(params);
  return { title: t.meta.blog, alternates: localeAlternates(locale, '/blog') };
}

/**
 * Đích của mọi thẻ bài viết ở bản dựng này.
 *
 * Một slug cố định, không phải link chết: trang chi tiết nhận mọi slug và luôn render cùng
 * nội dung mẫu. Khi có dữ liệu thật thì thay bằng slug của từng bài.
 */
const PLACEHOLDER_ARTICLE_PATH = '/blog/bai-viet-mau';

/**
 * Trang blog — bố cục thô theo wireframe Figma của chủ dự án.
 *
 * KIẾN TRÚC LƯỚI giống trang chủ và `/tools`: mọi khối là con TRỰC TIẾP của
 * `.container.grid`, danh sách thẻ dùng `.gridRow` để chiếm trọn hàng rồi chia lại cột.
 *
 *   Breadcrumb           trọn hàng
 *   Tiêu đề              4 /  8 /  8
 *   Mô tả                4 /  6 /  5
 *   Thanh lọc chủ đề     trọn hàng
 *   Tiêu đề section      trọn hàng
 *   Thẻ bài viết         4 /  4 / xen kẽ (xem page.module.css)
 *   Ô chủ đề             trọn hàng, chia đều bằng flex
 *
 * TRẠNG THÁI: BẢN DỰNG BỐ CỤC. Hệ thống blog KHÔNG nằm trong bất kỳ phase nào của P0–P9
 * (đã ghi ở phase-2 §Ghi chú phạm vi). Trang này và `[slug]` chỉ dựng khung nhìn; chưa có
 * bảng dữ liệu, chưa có API.
 */

/** Năm thẻ = đúng MỘT chu kỳ nhịp xen kẽ (3+6+3 rồi 6+6), tức hai hàng đầy ở desktop. */
const LATEST_IDS = ['l1', 'l2', 'l3', 'l4', 'l5'];

/** Sáu thẻ = một chu kỳ (6+3+3 rồi 3+3+6) — nhịp đảo ngược so với phần trên. */
const FEATURED_IDS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'];

const TRENDING_TOPIC_COUNT = 5;

export default async function BlogPage({ params }: PageLocaleParams) {
  const { locale, t } = await resolvePageI18n(params);

  return (
    <>
      <BlogHeader locale={locale} t={t} />

      <ArticleSection
        locale={locale}
        t={t}
        title={t.blog.latestTitle}
        items={LATEST_IDS}
        listClassName={styles.latestList}
      />

      <ArticleSection
        locale={locale}
        t={t}
        title={t.blog.featuredTitle}
        items={FEATURED_IDS}
        listClassName={styles.featuredList}
      />

      <TrendingTopics locale={locale} t={t} />
      <Newsletter locale={locale} />
    </>
  );
}

function BlogHeader({ locale, t }: { locale: Locale; t: Messages }) {
  return (
    <section className={styles.headerSection}>
      <div className="container grid">
        <Breadcrumb locale={locale} trail={[{ label: t.blog.breadcrumb }]} />

        <h1 className={`typeH1 ${styles.pageTitle}`}>{t.blog.title}</h1>

        <p className={`typeBodySmall textSecondary ${styles.pageLead}`}>{t.blog.lead}</p>

        <TopicFilterBar t={t} />
      </div>
    </section>
  );
}

/**
 * Thanh lọc chủ đề.
 *
 * Các tab là `<button>` chứ không phải `<Link>`: khi nối dữ liệu thật, lọc sẽ nằm trên
 * `searchParams` của chính trang này. Lúc đó đổi sang `<Link href="/blog?topic=…">` để
 * chia sẻ được link và không cần client component — nhưng đích đến chưa tồn tại nên chưa
 * đặt link vào bây giờ.
 */
function TopicFilterBar({ t }: { t: Messages }) {
  /** Nhãn phân loại bài viết — đây là loại NỘI DUNG, không phải dữ liệu, nên giữ nghĩa thật. */
  const topics = [
    t.blog.topicAll,
    t.blog.topicGuide,
    t.blog.topicLesson,
    t.blog.topicCompare,
    t.blog.topicProcess,
    t.blog.topicNews,
    t.blog.topicReview,
    t.blog.topicPrompt,
  ];

  return (
    <div className={styles.filterBar}>
      <ul className={styles.tabList}>
        {topics.map((label, index) => (
          <li key={label}>
            {/* Tab đầu đang chọn (theo wireframe). `aria-pressed` để trình đọc màn hình
                biết đây là trạng thái bật/tắt chứ không phải một nút bấm thường. */}
            <button
              type="button"
              className={`typeBodySmall ${styles.tab}`}
              aria-pressed={index === 0}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className={styles.filterSearch} aria-label={t.blog.searchLabel}>
        <SearchIcon />
      </button>
    </div>
  );
}

function ArticleSection({
  locale,
  t,
  title,
  items,
  listClassName,
}: {
  locale: Locale;
  t: Messages;
  title: string;
  items: string[];
  // `string | undefined` vì tra cứu trên CSS Module trả về kiểu đó. Ở runtime class luôn
  // tồn tại; khai đúng kiểu ở đây thay vì ép kiểu để nếu có ngày đổi tên class trong .css
  // mà quên đổi ở .tsx thì lỗi hiện ra ngay chỗ dùng.
  listClassName: string | undefined;
}) {
  return (
    <section className="section">
      <div className="container grid">
        <div className={styles.sectionHeader}>
          <h2 className="typeH2">{title}</h2>
          <Link className={`typeBodySmall ${styles.readMore}`} href={localeHref(locale, '/blog')}>
            {t.common.viewAll}
          </Link>
        </div>

        {/* `gridRow` chiếm trọn hàng rồi chia lại đúng số cột của lưới trang; nhịp rộng hẹp
            của từng thẻ nằm ở `listClassName`. */}
        <ul className={`gridRow ${listClassName}`}>
          {items.map((id) => (
            <li key={id} className={styles.articleItem}>
              <ArticleCard locale={locale} href={localeHref(locale, PLACEHOLDER_ARTICLE_PATH)} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TrendingTopics({ locale, t }: { locale: Locale; t: Messages }) {
  const topics = Array.from({ length: TRENDING_TOPIC_COUNT }, (_, i) =>
    format(t.blog.trendingTopic, { n: i + 1 }),
  );

  return (
    <section className="section">
      <div className="container grid">
        <div className={styles.sectionHeader}>
          <h2 className="typeH2">{t.blog.trendingTitle}</h2>
          <Link className={`typeBodySmall ${styles.readMore}`} href={localeHref(locale, '/blog')}>
            {t.common.viewAll}
          </Link>
        </div>

        <ul className={styles.topicRow}>
          {topics.map((topic) => (
            <li key={topic} className={styles.topicItem}>
              <span className="typeBodySmall">{topic}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
