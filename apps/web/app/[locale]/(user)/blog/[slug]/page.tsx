import type { Metadata } from 'next';
import { ArticleCard } from '../../article-card';
import { Breadcrumb } from '../../breadcrumb';
import { DraftBanner } from '../../draft-banner';
import { ImageIcon } from '../../icons';
import { Newsletter } from '../../newsletter';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'Talosmine — Bài viết' };

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

const LOREM_LONG =
  'Đây là đoạn văn mẫu để thấy nhịp dòng và độ dài dòng đọc của thân bài. Nội dung thật sẽ ' +
  'đến từ hệ thống blog ở giai đoạn sau, nên phần chữ ở đây chỉ có nhiệm vụ chiếm đúng chỗ ' +
  'mà một đoạn văn thật sẽ chiếm, không nhiều hơn cũng không ít hơn.';

const LOREM_SHORT =
  'Đoạn tiếp theo ngắn hơn, để thấy khoảng cách giữa hai đoạn liền nhau và giữa một đoạn với ' +
  'tiêu đề phụ ngay dưới nó.';

const PLACEHOLDER_BLOCKS: Block[] = [
  { id: 'h1', kind: 'heading', text: 'Tiêu đề phụ thứ nhất' },
  { id: 'p1', kind: 'paragraph', text: LOREM_LONG },
  { id: 'p2', kind: 'paragraph', text: LOREM_SHORT },
  { id: 'img1', kind: 'image' },
  { id: 'h2', kind: 'heading', text: 'Tiêu đề phụ thứ hai' },
  { id: 'p3', kind: 'paragraph', text: LOREM_LONG },
  { id: 'p4', kind: 'paragraph', text: LOREM_SHORT },
  {
    id: 'quote1',
    kind: 'quote',
    text:
      'Một câu trích dẫn nổi bật trong bài. Khối này có vạch đậm bên trái và nền phụ để tách ' +
      'khỏi mạch đọc chính.',
  },
  { id: 'h3', kind: 'heading', text: 'Tiêu đề phụ thứ ba' },
  { id: 'p5', kind: 'paragraph', text: LOREM_LONG },
  {
    id: 'list1',
    kind: 'list',
    items: [
      'Ý thứ nhất trong danh sách gạch đầu dòng.',
      'Ý thứ hai, dài hơn một chút để thấy dòng thứ hai thụt vào đúng chỗ.',
      'Ý thứ ba.',
      'Ý thứ tư.',
    ],
  },
  { id: 'p6', kind: 'paragraph', text: LOREM_SHORT },
  { id: 'img2', kind: 'image' },
  { id: 'h4', kind: 'heading', text: 'Tiêu đề phụ thứ tư' },
  { id: 'p7', kind: 'paragraph', text: LOREM_LONG },
];

const PLACEHOLDER_RELATED = ['rp1', 'rp2', 'rp3'];

export default function BlogDetailPage() {
  return (
    <>
      <DraftBanner>Bản dựng bố cục — toàn bộ nội dung bài viết là văn bản mẫu.</DraftBanner>

      <ArticleHeader />
      <ArticleBody />
      <RelatedPosts />
      <Newsletter />
    </>
  );
}

function ArticleHeader() {
  return (
    <section className={styles.headerSection}>
      <div className="container grid">
        {/* Chặng "Chủ đề" chưa có `href`: trang lọc theo chủ đề chưa tồn tại, nên nó là chữ
            chứ không phải link dẫn tới 404. */}
        <Breadcrumb
          trail={[
            { label: 'Blog', href: '/blog' },
            { label: 'Chủ đề' },
            { label: 'Tiêu đề bài viết' },
          ]}
        />

        <p className={styles.topicRow}>
          <span className={`typeCaption ${styles.topicTag}`}>Chủ đề</span>
        </p>

        <h1 className={`typeH1 ${styles.title}`}>
          Tiêu đề bài viết sẽ hiển thị ở đây khi hệ thống blog được kết nối
        </h1>

        <p className={`typeBodySmall textSecondary ${styles.lead}`}>
          Đoạn tóm tắt ngắn nằm ngay dưới tiêu đề, nói cho người đọc biết bài này giải quyết chuyện
          gì trước khi họ quyết định đọc tiếp.
        </p>

        <p className={`typeCaption ${styles.meta}`}>
          <time dateTime="2026-05-15">15/05/2026</time>
          <span aria-hidden="true">·</span>
          <span>6 phút đọc</span>
        </p>

        {/* Ảnh bìa chiếm TRỌN hàng — rộng hơn cột chữ. Đây là điểm nhấn mở đầu bài. */}
        <div className={styles.cover}>
          <ImageIcon />
        </div>
      </div>
    </section>
  );
}

function ArticleBody() {
  return (
    <section className={styles.bodySection}>
      <div className="container grid">
        {/*
          `<article>` là ô lưới, và bên trong nó KHÔNG chia cột — thân bài là một mạch đọc
          dọc, nên nhịp dọc do flex lo (globals.css: lưới lo cột ngang, flex lo nhịp dọc).
        */}
        <article className={styles.article}>
          {PLACEHOLDER_BLOCKS.map((block) => (
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

function RelatedPosts() {
  return (
    <section className="section">
      <div className="container grid">
        <h2 className={`typeH2 ${styles.relatedHeading}`}>Bài viết liên quan</h2>

        <ul className="gridRow">
          {PLACEHOLDER_RELATED.map((id) => (
            <li key={id} className={styles.relatedItem}>
              <ArticleCard href="/blog/bai-viet-mau" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
