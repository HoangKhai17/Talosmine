import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Talosmine — Khám phá công cụ để xây dựng và phát triển',
};

/**
 * Trang chủ — bố cục thô theo wireframe Figma của chủ dự án.
 *
 * KIẾN TRÚC LƯỚI: mọi section theo đúng một khuôn
 *
 *     <section className="section">
 *       <div className="container grid">      ← lưới 4/8/12 cột
 *         <div className={styles.xxx}>        ← con TRỰC TIẾP, khai số cột chiếm
 *         <ul className="gridRow">            ← danh sách: chiếm cả hàng rồi chia lại cột
 *       </div>
 *     </section>
 *
 * Không khối nào bị giới hạn bằng `max-width` px — bề ngang luôn đến từ số cột. Xem
 * globals.css để hiểu ba luật của lưới.
 *
 * TRẠNG THÁI: đây là BẢN DỰNG BỐ CỤC. Mọi nội dung trong các lưới là dữ liệu mẫu, đúng
 * như wireframe ("Tool name", "Lorem ipsum"). Nguồn dữ liệu thật là Catalog — thuộc P3,
 * và còn chờ DEC-B01 (danh sách ứng dụng của Hub).
 *
 * Dữ liệu mẫu đặt tên `PLACEHOLDER_*` và dùng nhãn trung tính ("Tên công cụ") thay vì bịa
 * tên thương hiệu, để không ai nhầm nó là dữ liệu thật. Khi Catalog sẵn sàng, thay các
 * mảng đó bằng lời gọi API là xong; bố cục không phải sửa.
 *
 * Trang này là Server Component thuần: không đọc phiên đăng nhập. Trạng thái đăng nhập do
 * header trong `layout.tsx` xử lý.
 */

const PLACEHOLDER_POPULAR = ['Từ khoá 1', 'Từ khoá 2', 'Từ khoá 3', 'Từ khoá 4', 'Từ khoá 5'];

const PLACEHOLDER_TOOLS = [
  { id: 't1', name: 'Tên công cụ' },
  { id: 't2', name: 'Tên công cụ' },
  { id: 't3', name: 'Tên công cụ' },
];

// Bảy ô = đúng MỘT chu kỳ nhịp xen kẽ (3+5+4 rồi 3+4+3+2), tức hai hàng đầy.
const PLACEHOLDER_CATEGORIES = [
  { id: 'c1', name: 'Danh mục' },
  { id: 'c2', name: 'Danh mục' },
  { id: 'c3', name: 'Danh mục' },
  { id: 'c4', name: 'Danh mục' },
  { id: 'c5', name: 'Danh mục' },
  { id: 'c6', name: 'Danh mục' },
  { id: 'c7', name: 'Danh mục' },
];

const PLACEHOLDER_NEWS = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'];

const PLACEHOLDER_PARTNERS = ['p1', 'p2', 'p3', 'p4', 'p5'];

const PLACEHOLDER_FAQ = [
  'Talosmine là gì và hoạt động thế nào?',
  'Làm sao để gửi công cụ của tôi lên đây?',
  'Danh mục được kiểm duyệt như thế nào?',
  'Tôi có cần tài khoản để sử dụng không?',
];

export default function UserHomePage() {
  return (
    <>
      <div className={styles.draftBanner}>
        <p className="container typeBodySmall">
          Bản dựng bố cục — nội dung trong các lưới là dữ liệu mẫu, chưa nối danh mục thật.
        </p>
      </div>

      <Hero />
      <PartnerMarquee />
      <ToolsSection />
      <CategoriesSection />
      <WhatsNewSection />
      <BlogSection />
      <FaqSection />
      <Newsletter />
    </>
  );
}

function Hero() {
  return (
    <section className="section">
      {/* `container grid`: container lo bề ngang + gutter, grid lo cột. */}
      <div className="container grid">
        <h1 className={`typeHero ${styles.heroHeading}`}>
          Khám phá công cụ tốt nhất để xây dựng và phát triển
        </h1>

        <p className={`typeBodyLarge textSecondary ${styles.heroLead}`}>
          Danh mục được tuyển chọn gồm những công cụ và tài nguyên tốt nhất dành cho người sáng tạo,
          lập trình viên và đội ngũ đang tăng trưởng.
        </p>

        {/*
          Form tìm kiếm chưa có đích đến: Catalog thuộc P3. Không đặt `action` thì trình
          duyệt gửi về chính trang này thay vì báo lỗi — vô hại cho bản dựng.

          `<search>` là landmark chuẩn, tương đương role="search" nhưng bằng thẻ thật. Nó
          cũng chính là ô lưới, nên bề ngang đến từ số cột chứ không phải max-width.
        */}
        <search className={styles.heroSearch}>
          <form className={styles.searchForm}>
            <SearchIcon />
            <input
              className={`typeBody ${styles.searchInput}`}
              type="search"
              name="q"
              placeholder="Tìm công cụ, danh mục hoặc từ khoá…"
              aria-label="Tìm kiếm công cụ"
            />
            <button type="submit" className={`typeBodySmall ${styles.searchSubmit}`}>
              Tìm
            </button>
          </form>
        </search>

        <div className={styles.heroPopular}>
          <span className={`typeBodySmall ${styles.popularLabel}`}>Tìm nhiều:</span>
          {PLACEHOLDER_POPULAR.map((term) => (
            <button key={term} type="button" className={`typeBodySmall ${styles.chip}`}>
              {term}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function PartnerMarquee() {
  return (
    // TRÀN VIỀN: không bọc `.container` — xem ghi chú ở page.module.css.
    <section className={styles.marquee} aria-label="Đối tác">
      <div className={styles.marqueeTrack}>
        {/*
          Danh sách render HAI LẦN, phẳng trong cùng một track. Animation dịch đúng -50%,
          nên khi bản sao trôi tới vị trí bản gốc thì hình ảnh trùng khít — vòng lặp không
          có điểm nối nhìn thấy được.

          Bản sao mang `aria-hidden` để trình đọc màn hình không đọc lặp toàn bộ nội dung.
        */}
        {PLACEHOLDER_PARTNERS.map((id) => (
          <PartnerItem key={id} />
        ))}
        {PLACEHOLDER_PARTNERS.map((id) => (
          <PartnerItem key={`${id}-copy`} duplicate />
        ))}
      </div>
    </section>
  );
}

function PartnerItem({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <div className={styles.marqueeItem} {...(duplicate ? { 'aria-hidden': true } : {})}>
      <span className={styles.marqueeLogo}>
        <ImageIcon />
      </span>
      <p className={`typeH3 ${styles.marqueeName}`}>Logo</p>
      <p className={`typeBodySmall ${styles.marqueeText}`}>
        Mô tả ngắn về đối tác sẽ hiển thị ở đây khi có nội dung thật.
      </p>
    </div>
  );
}

function ToolsSection() {
  return (
    <section className="section">
      <div className="container grid">
        <div className={styles.statsRow}>
          <p className={`typeBodySmall ${styles.statsChip}`}>
            <span>10.000+ công cụ</span>
            <span className={styles.statsDivider}>·</span>
            <span>500+ danh mục</span>
            <span className={styles.statsDivider}>·</span>
            <span>Cập nhật mỗi ngày</span>
          </p>
        </div>

        <div className={styles.sectionHeaderCenter}>
          <h2 className="typeH2">Tìm đúng công cụ cho mọi công việc</h2>
          <p className="typeBody textSecondary">
            Khám phá, tìm kiếm và chọn ra công cụ phù hợp cho công việc, học tập, sáng tạo và phát
            triển sản phẩm.
          </p>
        </div>

        <ul className="gridRow">
          {PLACEHOLDER_TOOLS.map((tool) => (
            <li key={tool.id} className={styles.colCard}>
              <article className={styles.card}>
                <div className={styles.thumb}>
                  <ImageIcon />
                </div>
                <div className={styles.cardBody}>
                  <h3 className="typeCardTitle">{tool.name}</h3>
                  <p className="typeBodySmall textSecondary">
                    Mô tả ngắn về công cụ sẽ hiển thị ở đây khi danh mục được kết nối.
                  </p>
                  <p className={`typeCaption ${styles.cardMeta}`}>Danh mục · Lượt dùng</p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CategoriesSection() {
  return (
    <section className="section">
      <div className="container grid">
        <div className={styles.sectionHeaderRow}>
          <h2 className="typeH2">Khám phá danh mục</h2>
          <Link className={`typeBodySmall ${styles.viewAll}`} href="/categories">
            Xem tất cả →
          </Link>
        </div>

        <ul className="gridRow">
          {PLACEHOLDER_CATEGORIES.map((category) => (
            <li key={category.id} className={styles.categoryItem}>
              <div className={styles.categoryCard}>
                <div className={styles.categoryThumb}>
                  <ImageIcon />
                </div>
                <h3 className="typeBodySmall">{category.name}</h3>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function WhatsNewSection() {
  return (
    <section className="section">
      <div className="container grid">
        <div className={styles.sectionHeaderCenter}>
          <h2 className="typeH2">Có gì mới</h2>
          <p className="typeBody textSecondary">
            Mỗi ngày chúng tôi bổ sung công cụ và nền tảng mới để bạn không bỏ lỡ thứ đáng thử.
          </p>
        </div>

        <ul className="gridRow">
          {PLACEHOLDER_NEWS.map((id) => (
            <li key={id} className={styles.colCard}>
              <article className={styles.card}>
                <div className={styles.thumb}>
                  <ImageIcon />
                </div>
                <div className={styles.cardBody}>
                  <span className={`typeCaption ${styles.tag}`}>Nhãn</span>
                  <h3 className="typeBodySmall">
                    Tiêu đề bài viết sẽ hiển thị ở đây khi có nội dung thật
                  </h3>
                  <p className={`typeCaption ${styles.cardMeta}`}>Ngày đăng · Tác giả</p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BlogSection() {
  return (
    <section className="section">
      <div className="container grid">
        <div className={styles.sectionHeaderRow}>
          <h2 className="typeH2">Blog</h2>
          <Link className={`typeBodySmall ${styles.viewAll}`} href="/blog">
            Xem tất cả →
          </Link>
        </div>

        {/* Chia 6/6 cột — hai khối là con trực tiếp của lưới. */}
        <article className={`${styles.blogCard} ${styles.blogFeature}`}>
          <div className={styles.blogCardBody}>
            <p className="typeCaption textTertiary">Ngày đăng</p>
            <h3 className="typeCardTitle">
              Tiêu đề bài viết nổi bật sẽ hiển thị ở đây khi có nội dung thật
            </h3>
            <p className="typeBodySmall textSecondary">
              Đoạn mở đầu của bài viết. Nội dung này đến từ hệ thống blog, sẽ được kết nối ở giai
              đoạn sau.
            </p>
          </div>
        </article>

        <div className={styles.blogSide}>
          {['b1', 'b2'].map((id) => (
            <article key={id} className={`${styles.blogCard} ${styles.blogSideCard}`}>
              <div className={styles.blogCardBody}>
                <p className="typeCaption textTertiary">Ngày đăng</p>
                <h3 className="typeCardTitle">
                  Tiêu đề bài viết sẽ hiển thị ở đây khi có nội dung thật
                </h3>
                <p className="typeBodySmall textSecondary">
                  Đoạn mở đầu của bài viết sẽ hiển thị ở đây.
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="section">
      {/* Bất đối xứng 5/7 cột. */}
      <div className="container grid">
        <div className={styles.faqIntro}>
          <h2 className="typeH2">Câu hỏi thường gặp</h2>
          <p className="typeBody textSecondary">
            Giải đáp nhanh những thắc mắc phổ biến, tập hợp ở một nơi.
          </p>
          <button type="button" className={`typeBody ${styles.askButton}`}>
            Đặt câu hỏi
          </button>
        </div>

        <div className={styles.faqList}>
          {PLACEHOLDER_FAQ.map((question, index) => (
            // Mục đầu mở sẵn (theo wireframe) để thấy ngay dạng câu trả lời.
            <details key={question} className={styles.faqItem} open={index === 0}>
              <summary className={`typeBody ${styles.faqQuestion}`}>
                {question}
                <ChevronIcon direction="down" className={styles.faqMarker} />
              </summary>
              <p className={`typeBodySmall ${styles.faqAnswer}`}>
                Nội dung trả lời sẽ được biên soạn khi hệ thống có đủ tính năng. Phần này hiện chỉ
                minh hoạ bố cục.
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Newsletter() {
  return (
    <section className="section">
      <div className="container grid">
        <div className={styles.newsletter}>
          <EnvelopeIcon />

          <h2 className={`typeH2 ${styles.newsletterTitle}`}>
            Đăng ký bản tin và cập nhật mỗi tuần
          </h2>

          <p className={`typeBodySmall ${styles.newsletterText}`}>
            Nhận tổng hợp công cụ mới, bài viết đáng đọc và thay đổi đáng chú ý của nền tảng — mỗi
            tuần một lần, không spam.
          </p>

          {/*
            Chưa có đích đến: hệ thống bản tin thuộc giai đoạn sau. Không đặt `action` thì
            trình duyệt gửi về chính trang này thay vì báo lỗi.
          */}
          <form className={styles.newsletterForm}>
            <label className="visuallyHidden" htmlFor="newsletter-email">
              Địa chỉ thư điện tử
            </label>
            <input
              id="newsletter-email"
              className={`typeBody ${styles.newsletterInput}`}
              type="email"
              name="email"
              placeholder="Địa chỉ thư điện tử của bạn…"
              autoComplete="email"
            />
            <button type="submit" className={`typeBodySmall ${styles.newsletterSubmit}`}>
              Đăng ký
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

/* ── Icon ───────────────────────────────────────────────────────────────────
 * SVG viết thẳng tại chỗ thay vì cài thư viện: chỉ cần ba hình, và mọi thư viện icon đều
 * nằm ngoài bảng D của decision register.
 *
 * `currentColor` để icon ăn theo màu chữ của phần tử cha — đổi token màu là icon đổi theo.
 */

function SearchIcon() {
  return (
    <svg
      className={styles.searchIcon}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 17 5-5 4 4 3-2 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg
      className={styles.newsletterIcon}
      width="64"
      height="48"
      viewBox="0 0 64 48"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 0h56a4 4 0 0 1 4 4v40a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4Zm28 27.5L5.6 6.2A2 2 0 0 0 4 6v1.3l26.7 21.6a2 2 0 0 0 2.6 0L60 7.3V6a2 2 0 0 0-1.6.2L32 27.5Z" />
    </svg>
  );
}

function ChevronIcon({
  direction,
  className,
}: {
  direction: 'left' | 'right' | 'down';
  // `| undefined` tường minh: tsconfig bật `exactOptionalPropertyTypes`, nên "có thể bỏ
  // qua" và "có thể là undefined" là hai chuyện khác nhau.
  className?: string | undefined;
}) {
  const rotation = direction === 'left' ? 90 : direction === 'right' ? -90 : 0;

  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
