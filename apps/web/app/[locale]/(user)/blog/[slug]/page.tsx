import type { Metadata } from 'next';
import { type Locale, localeHref } from '../../../../../i18n/locale';
import { format, type Messages } from '../../../../../i18n/messages';
import { localeAlternates, resolvePageI18n } from '../../../../../i18n/params';
import { ArticleCard } from '../../article-card';
import { Breadcrumb } from '../../breadcrumb';
import { ImageIcon } from '../../icons';
import { Newsletter } from '../../newsletter';
import styles from './page.module.css';

/**
 * Route này có HAI segment động (`locale` và `slug`), nên không dùng chung
 * `PageLocaleParams` với các trang một segment.
 */
interface PostParams {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: PostParams): Promise<Metadata> {
  const { locale, t } = await resolvePageI18n(params);
  const { slug } = await params;

  // `encodeURIComponent` vì slug đến từ URL do người khác gõ: một slug chứa `?` hoặc `#`
  // chưa mã hoá sẽ làm canonical trỏ sang một trang khác hẳn.
  return {
    title: t.meta.blogPost,
    alternates: localeAlternates(locale, `/blog/${encodeURIComponent(slug)}`),
  };
}

/**
 * Trang chi tiết bài viết — bố cục thô theo wireframe Figma của chủ dự án.
 *
 *   Breadcrumb        trọn hàng
 *   Nhãn chủ đề       trọn hàng
 *   Tiêu đề           4 /  8 /  9
 *   Mô tả + meta      4 /  8 /  9
 *   Ảnh bìa           TRỌN HÀNG — rộng hơn phần chữ, đúng như thiết kế
 *   Thân bài          4 /  8 /  9
 *   Bài liên quan     trọn hàng, 3 thẻ mỗi hàng ở desktop
 *
 * TRẠNG THÁI: BẢN DỰNG BỐ CỤC. Toàn bộ chữ là văn bản mẫu.
 *
 * ROUTE ĐỘNG NHƯNG CHƯA ĐỌC `slug`: chưa có nguồn dữ liệu nào để tra cứu. Route nhận mọi
 * slug và luôn trả cùng nội dung — đủ để xem bố cục, và không giả vờ là đã có bài thật.
 * Khi có hệ thống blog thì đây là chỗ gọi API rồi `notFound()` nếu không tìm thấy.
 */

/**
 * Thân bài dưới dạng dữ liệu thay vì JSX viết tay.
 *
 * Vì sao: nội dung thật sẽ đến từ hệ thống blog dưới dạng danh sách khối (block). Dựng sẵn
 * theo hình dạng đó thì lúc nối dữ liệu chỉ phải thay mảng này, không phải viết lại bố cục.
 */
type Block = { id: string } & (
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'image' }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; items: string[] }
);

/** Dựng từ catalog thay vì hằng ở module scope — chữ phải đổi theo ngôn ngữ. */
function placeholderBlocks(t: Messages): Block[] {
  return [
    { id: 'h1', kind: 'heading', text: t.blogPost.heading1 },
    { id: 'p1', kind: 'paragraph', text: t.blogPost.paragraphLong },
    { id: 'p2', kind: 'paragraph', text: t.blogPost.paragraphShort },
    { id: 'img1', kind: 'image' },
    { id: 'h2', kind: 'heading', text: t.blogPost.heading2 },
    { id: 'p3', kind: 'paragraph', text: t.blogPost.paragraphLong },
    { id: 'p4', kind: 'paragraph', text: t.blogPost.paragraphShort },
    { id: 'quote1', kind: 'quote', text: t.blogPost.quote },
    { id: 'h3', kind: 'heading', text: t.blogPost.heading3 },
    { id: 'p5', kind: 'paragraph', text: t.blogPost.paragraphLong },
    {
      id: 'list1',
      kind: 'list',
      items: [
        t.blogPost.listItem1,
        t.blogPost.listItem2,
        t.blogPost.listItem3,
        t.blogPost.listItem4,
      ],
    },
    { id: 'p6', kind: 'paragraph', text: t.blogPost.paragraphShort },
    { id: 'img2', kind: 'image' },
    { id: 'h4', kind: 'heading', text: t.blogPost.heading4 },
    { id: 'p7', kind: 'paragraph', text: t.blogPost.paragraphLong },
  ];
}

const RELATED_IDS = ['rp1', 'rp2', 'rp3'];

export default async function BlogDetailPage({ params }: PostParams) {
  const { locale, t } = await resolvePageI18n(params);

  return (
    <>
      <ArticleHeader locale={locale} t={t} />
      <ArticleBody t={t} />
      <RelatedPosts locale={locale} t={t} />
      <Newsletter locale={locale} />
    </>
  );
}

function ArticleHeader({ locale, t }: { locale: Locale; t: Messages }) {
  return (
    <section className={styles.headerSection}>
      <div className="container grid">
        {/* Chặng "Chủ đề" chưa có `href`: trang lọc theo chủ đề chưa tồn tại, nên nó là chữ
            chứ không phải link dẫn tới 404. */}
        <Breadcrumb
          locale={locale}
          trail={[
            { label: t.blog.breadcrumb, href: localeHref(locale, '/blog') },
            { label: t.blogPost.topic },
            { label: t.blogPost.breadcrumbTitle },
          ]}
        />

        <p className={styles.topicRow}>
          <span className={`typeCaption ${styles.topicTag}`}>{t.blogPost.topic}</span>
        </p>

        <h1 className={`typeH1 ${styles.title}`}>{t.blogPost.title}</h1>

        <p className={`typeBodySmall textSecondary ${styles.lead}`}>{t.blogPost.lead}</p>

        <p className={`typeCaption ${styles.meta}`}>
          {/* `dateTime` là ISO 8601 — giá trị máy đọc, KHÔNG dịch. */}
          <time dateTime="2026-05-15">{t.common.sampleDate}</time>
          <span aria-hidden="true">·</span>
          <span>{format(t.common.readTime, { minutes: 6 })}</span>
        </p>

        {/* Ảnh bìa chiếm TRỌN hàng — rộng hơn cột chữ. Đây là điểm nhấn mở đầu bài. */}
        <div className={styles.cover}>
          <ImageIcon />
        </div>
      </div>
    </section>
  );
}

function ArticleBody({ t }: { t: Messages }) {
  return (
    <section className={styles.bodySection}>
      <div className="container grid">
        {/*
          `<article>` là ô lưới, và bên trong nó KHÔNG chia cột — thân bài là một mạch đọc
          dọc, nên nhịp dọc do flex lo (globals.css: lưới lo cột ngang, flex lo nhịp dọc).
        */}
        <article className={styles.article}>
          {placeholderBlocks(t).map((block) => (
            <BlockView key={block.id} block={block} />
          ))}
        </article>
      </div>
    </section>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'heading':
      return <h2 className={`typeH3 ${styles.heading}`}>{block.text}</h2>;

    case 'paragraph':
      return <p className={`typeBody ${styles.paragraph}`}>{block.text}</p>;

    case 'image':
      return (
        <div className={styles.inlineImage}>
          <ImageIcon />
        </div>
      );

    case 'quote':
      return (
        <blockquote className={styles.quote}>
          <p className="typeBody">{block.text}</p>
        </blockquote>
      );

    case 'list':
      return (
        <ul className={styles.list}>
          {block.items.map((item) => (
            <li key={item} className="typeBody">
              {item}
            </li>
          ))}
        </ul>
      );
  }
}

function RelatedPosts({ locale, t }: { locale: Locale; t: Messages }) {
  return (
    <section className="section">
      <div className="container grid">
        <h2 className={`typeH2 ${styles.relatedHeading}`}>{t.blogPost.relatedTitle}</h2>

        <ul className="gridRow">
          {RELATED_IDS.map((id) => (
            <li key={id} className={styles.relatedItem}>
              <ArticleCard locale={locale} href={localeHref(locale, '/blog/bai-viet-mau')} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
