import type { Metadata } from 'next';
import Link from 'next/link';
import { ArticleCard } from '../article-card';
import { Breadcrumb } from '../breadcrumb';
import { DraftBanner } from '../draft-banner';
import { SearchIcon } from '../icons';
import { Newsletter } from '../newsletter';
import styles from './page.module.css';

/**
 * Đích của mọi thẻ bài viết ở bản dựng này.
 *
 * Một slug cố định, không phải link chết: trang chi tiết nhận mọi slug và luôn render cùng
 * nội dung mẫu. Khi có dữ liệu thật thì thay bằng slug của từng bài.
 */
const PLACEHOLDER_ARTICLE_HREF = '/blog/bai-viet-mau';

export const metadata: Metadata = { title: 'Talosmine — Blog' };

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

/** Nhãn phân loại bài viết — đây là loại NỘI DUNG, không phải dữ liệu, nên giữ nghĩa thật. */
const TOPIC_TABS = [
  'Tất cả',
  'Hướng dẫn',
  'Bài học',
  'So sánh',
  'Quy trình',
  'Tin tức',
  'Đánh giá',
  'Prompt',
];

/** Năm thẻ = đúng MỘT chu kỳ nhịp xen kẽ (3+6+3 rồi 6+6), tức hai hàng đầy ở desktop. */
const PLACEHOLDER_LATEST = ['l1', 'l2', 'l3', 'l4', 'l5'];

/** Sáu thẻ = một chu kỳ (6+3+3 rồi 3+3+6) — nhịp đảo ngược so với phần trên. */
const PLACEHOLDER_FEATURED = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'];

const PLACEHOLDER_TOPICS = ['#ChuDe1', '#ChuDe2', '#ChuDe3', '#ChuDe4', '#ChuDe5'];

export default function BlogPage() {
  return (
    <>
      <DraftBanner>
        Bản dựng bố cục — bài viết là dữ liệu mẫu. Hệ thống blog chưa nằm trong phase nào.
      </DraftBanner>

      <BlogHeader />

      <ArticleSection
        title="Khám phá tin mới nhất"
        items={PLACEHOLDER_LATEST}
        listClassName={styles.latestList}
      />

      <ArticleSection
        title="Bài viết nổi bật"
        items={PLACEHOLDER_FEATURED}
        listClassName={styles.featuredList}
      />

      <TrendingTopics />
      <Newsletter />
    </>
  );
}

function BlogHeader() {
  return (
    <section className={styles.headerSection}>
      <div className="container grid">
        <Breadcrumb trail={[{ label: 'Blog' }]} />

        <h1 className={`typeH1 ${styles.pageTitle}`}>
          Khám phá. Học hỏi. Mọi thứ bạn cần ở một nơi.
        </h1>

        <p className={`typeBodySmall textSecondary ${styles.pageLead}`}>
          Góc nhìn thực tế, kinh nghiệm từ người làm nghề và những cách làm đã được kiểm chứng — gom
          lại trong một mạch đọc liền.
        </p>

        <TopicFilterBar />
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
function TopicFilterBar() {
  return (
    <div className={styles.filterBar}>
      <ul className={styles.tabList}>
        {TOPIC_TABS.map((label, index) => (
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

      <button type="button" className={styles.filterSearch} aria-label="Tìm bài viết">
        <SearchIcon />
      </button>
    </div>
  );
}

function ArticleSection({
  title,
  items,
  listClassName,
}: {
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
          <Link className={`typeBodySmall ${styles.readMore}`} href="/blog">
            Xem thêm →
          </Link>
        </div>

        {/* `gridRow` chiếm trọn hàng rồi chia lại đúng số cột của lưới trang; nhịp rộng hẹp
            của từng thẻ nằm ở `listClassName`. */}
        <ul className={`gridRow ${listClassName}`}>
          {items.map((id) => (
            <li key={id} className={styles.articleItem}>
              <ArticleCard href={PLACEHOLDER_ARTICLE_HREF} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TrendingTopics() {
  return (
    <section className="section">
      <div className="container grid">
        <div className={styles.sectionHeader}>
          <h2 className="typeH2">Chủ đề thịnh hành</h2>
          <Link className={`typeBodySmall ${styles.readMore}`} href="/blog">
            Xem thêm →
          </Link>
        </div>

        <ul className={styles.topicRow}>
          {PLACEHOLDER_TOPICS.map((topic) => (
            <li key={topic} className={styles.topicItem}>
              <span className="typeBodySmall">{topic}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
