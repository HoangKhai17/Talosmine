import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { type Locale, localeHref } from '../../../i18n/locale';
import { format, type Messages } from '../../../i18n/messages';
import { localeAlternates, type PageLocaleParams } from '../../../i18n/params';
import { DEMO_PRODUCTS, demoCategories, pick } from '../../../lib/demo-products';
import { resolvePageContent } from '../../../server/site-content';
import { ChevronIcon, ImageIcon, SearchIcon } from './icons';
import { Newsletter } from './newsletter';
import styles from './page.module.css';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t, slots } = await resolvePageContent(params);
  const description = slots['seo.description.home'];
  return {
    title: t.meta.home,
    ...(description !== undefined ? { description } : {}),
    alternates: localeAlternates(locale, '/'),
  };
}

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
 * như wireframe. Nguồn dữ liệu thật là Catalog — thuộc P3, và còn chờ DEC-B01 (danh sách
 * ứng dụng của Hub).
 *
 * Dữ liệu mẫu chỉ còn là ID/số lượng; CHỮ của nó nằm trong message catalog (`i18n/messages`)
 * cùng chỗ với mọi chữ khác. Nhờ vậy trang tiếng Anh không bị lẫn tiếng Việt, và khi CMS ra
 * đời thì các khoá đó thành giá trị dự phòng (DEC-T26).
 *
 * Trang này không đọc phiên đăng nhập. Trạng thái đăng nhập do header trong `layout.tsx` xử lý.
 */

/** Chỉ còn là SỐ LƯỢNG và ID — nhãn lấy từ catalog. */
const POPULAR_COUNT = 5;

// Bảy ô = đúng MỘT chu kỳ nhịp xen kẽ (3+5+4 rồi 3+4+3+2), tức hai hàng đầy.

const NEWS_IDS = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'];
const PARTNER_IDS = ['p1', 'p2', 'p3', 'p4', 'p5'];

export default async function UserHomePage({ params }: PageLocaleParams) {
  // `t` đã merge chữ CMS (nếu có) đè lên message catalog — component bên dưới không đổi.
  const { locale, t } = await resolvePageContent(params);

  return (
    <>
      <Hero t={t} />
      <PartnerMarquee t={t} />
      <ToolsSection locale={locale} t={t} />
      <CategoriesSection locale={locale} t={t} />
      <WhatsNewSection t={t} />
      <BlogSection locale={locale} t={t} />
      <FaqSection t={t} />
      <Newsletter locale={locale} />
    </>
  );
}

function Hero({ t }: { t: Messages }) {
  const popular = Array.from({ length: POPULAR_COUNT }, (_, i) =>
    format(t.home.popularTerm, { n: i + 1 }),
  );

  return (
    <section className="section">
      {/* `container grid`: container lo bề ngang + gutter, grid lo cột. */}
      <div className="container grid">
        <h1 className={`typeHero ${styles.heroHeading}`}>{t.home.heroTitle}</h1>

        <p className={`typeBodyLarge textSecondary ${styles.heroLead}`}>{t.home.heroLead}</p>

        {/*
          Form tìm kiếm chưa có đích đến: Catalog thuộc P3. Không đặt `action` thì trình
          duyệt gửi về chính trang này thay vì báo lỗi — vô hại cho bản dựng.

          `<search>` là landmark chuẩn, tương đương role="search" nhưng bằng thẻ thật. Nó
          cũng chính là ô lưới, nên bề ngang đến từ số cột chứ không phải max-width.
        */}
        <search className={styles.heroSearch}>
          <form className={styles.searchForm}>
            <SearchIcon className={styles.searchIcon} />
            <input
              className={`typeBody ${styles.searchInput}`}
              type="search"
              name="q"
              placeholder={t.home.searchPlaceholder}
              aria-label={t.a11y.searchTools}
            />
            <button type="submit" className={`typeBodySmall ${styles.searchSubmit}`}>
              {t.home.searchSubmit}
            </button>
          </form>
        </search>

        <div className={styles.heroPopular}>
          <span className={`typeBodySmall ${styles.popularLabel}`}>{t.home.popularLabel}</span>
          {popular.map((term) => (
            <button key={term} type="button" className={`typeBodySmall ${styles.chip}`}>
              {term}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function PartnerMarquee({ t }: { t: Messages }) {
  return (
    // TRÀN VIỀN: không bọc `.container` — xem ghi chú ở page.module.css.
    <section className={styles.marquee} aria-label={t.a11y.partners}>
      <div className={styles.marqueeTrack}>
        {/*
          Danh sách render HAI LẦN, phẳng trong cùng một track. Animation dịch đúng -50%,
          nên khi bản sao trôi tới vị trí bản gốc thì hình ảnh trùng khít — vòng lặp không
          có điểm nối nhìn thấy được.

          Bản sao mang `aria-hidden` để trình đọc màn hình không đọc lặp toàn bộ nội dung.
        */}
        {PARTNER_IDS.map((id) => (
          <PartnerItem key={id} t={t} />
        ))}
        {PARTNER_IDS.map((id) => (
          <PartnerItem key={`${id}-copy`} t={t} duplicate />
        ))}
      </div>
    </section>
  );
}

function PartnerItem({ t, duplicate = false }: { t: Messages; duplicate?: boolean }) {
  return (
    <div className={styles.marqueeItem} {...(duplicate ? { 'aria-hidden': true } : {})}>
      <span className={styles.marqueeLogo}>
        <ImageIcon />
      </span>
      <p className={`typeH3 ${styles.marqueeName}`}>{t.home.partnerName}</p>
      <p className={`typeBodySmall ${styles.marqueeText}`}>{t.home.partnerText}</p>
    </div>
  );
}

function ToolsSection({ locale, t }: { locale: Locale; t: Messages }) {
  return (
    <section className="section">
      <div className="container grid">
        <div className={styles.statsRow}>
          {/*
            Số liệu ĐẾM TỪ DỮ LIỆU THẬT, không phải chữ cố định.

            Trước đây chỗ này ghi "10.000+ công cụ · 500+ danh mục" trong khi lưới ngay bên
            dưới hiện đúng bảy thẻ. Một con số tự mâu thuẫn với chính trang đang hiện là thứ
            người chấm hồ sơ nhận ra ngay, và nó làm hỏng độ tin của mọi con số khác trong hồ
            sơ. Đếm thật thì nhỏ nhưng đúng — và tự lớn lên khi danh mục lớn lên.
          */}
          <p className={`typeBodySmall ${styles.statsChip}`}>
            <span>{format(t.home.statToolCount, { count: DEMO_PRODUCTS.length })}</span>
            <span className={styles.statsDivider}>·</span>
            <span>{format(t.home.statCategoryCount, { count: demoCategories().length })}</span>
            <span className={styles.statsDivider}>·</span>
            <span>{t.home.statUpdated}</span>
          </p>
        </div>

        <div className={styles.sectionHeaderCenter}>
          <h2 className="typeH2">{t.home.toolsTitle}</h2>
          <p className="typeBody textSecondary">{t.home.toolsLead}</p>
        </div>

        {/*
          BẢY SẢN PHẨM THẬT, mỗi thẻ mở thẳng công cụ chạy được ở `/tools/<key>`.

          Trước đây đây là ba thẻ giữ chỗ mang CÙNG MỘT tiêu đề. Với người xem hồ sơ, một lưới
          thẻ giống hệt nhau và bấm không vào đâu đọc ra là "chưa có gì" — dù bên trong đã có
          bảy công cụ chạy được. Đường từ trang chủ tới công cụ chỉ dài một cú bấm, và đó là
          thứ cần chứng minh.
        */}
        <ul className="gridRow">
          {DEMO_PRODUCTS.map((product) => (
            <li key={product.key} className={styles.colCard}>
              <article className={styles.card}>
                <Link
                  className={styles.cardLink}
                  href={localeHref(locale, `/tools/${product.key}`)}
                >
                  <div className={styles.thumb}>
                    {/*
                      `alt=""` có chủ đích: tiêu đề ngay bên dưới đã nói đúng nội dung.
                    
                      `unoptimized` vì ảnh là SVG. Bộ tối ưu ảnh của Next không xử lý SVG trừ khi bật
                      `dangerouslyAllowSVG` — một công tắc mở cho MỌI nguồn ảnh, trong khi ở đây chỉ có
                      vài file tĩnh của chính ta. SVG vốn đã nhẹ và co giãn vô cấp, nên đi qua bộ tối ưu
                      cũng không được gì. `width`/`height` giữ đúng 640×400 để khung không nhảy.
                    */}
                    <Image
                      className={styles.thumbImage}
                      src={product.image}
                      alt=""
                      width={640}
                      height={400}
                      unoptimized
                    />
                  </div>
                  <div className={styles.cardBody}>
                    <h3 className="typeCardTitle">{pick(product.title, locale)}</h3>
                    <p className="typeBodySmall textSecondary">
                      {pick(product.description, locale)}
                    </p>
                    <p className={`typeCaption ${styles.cardMeta}`}>
                      {pick(product.category, locale)}
                    </p>
                  </div>
                </Link>
              </article>
            </li>
          ))}
        </ul>

        <p className={`typeBodySmall ${styles.toolsMore}`}>
          <Link href={localeHref(locale, '/tools')}>{t.common.viewAll}</Link>
        </p>
      </div>
    </section>
  );
}

function CategoriesSection({ locale, t }: { locale: Locale; t: Messages }) {
  return (
    <section className="section">
      <div className="container grid">
        <div className={styles.sectionHeaderRow}>
          <h2 className="typeH2">{t.home.categoriesTitle}</h2>
          <Link
            className={`typeBodySmall ${styles.viewAll}`}
            href={localeHref(locale, '/categories')}
          >
            {t.common.viewAll}
          </Link>
        </div>

        {/*
          Danh mục cũng suy ra từ sản phẩm thật (`demoCategories()`), kèm số công cụ trong mỗi
          mục.

          CỐ Ý KHÔNG BẤM ĐƯỢC: bộ lọc theo danh mục ở `/tools` chưa nối (taxonomy chưa tồn tại
          — xem `pending-work`). Một thẻ trông bấm được mà bấm không đi đâu còn tệ hơn một thẻ
          rõ ràng là nhãn. Khi bộ lọc có thật thì bọc `<Link>` vào đây là xong.
        */}
        <ul className="gridRow">
          {demoCategories().map((category) => (
            <li key={category.label.vi} className={styles.categoryItem}>
              <div className={styles.categoryCard}>
                <div className={styles.categoryThumb}>
                  <ImageIcon />
                </div>
                <h3 className="typeBodySmall">{pick(category.label, locale)}</h3>
                <p className={`typeCaption ${styles.categoryCount}`}>
                  {format(t.home.categoryCount, { count: category.count })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function WhatsNewSection({ t }: { t: Messages }) {
  return (
    <section className="section">
      <div className="container grid">
        <div className={styles.sectionHeaderCenter}>
          <h2 className="typeH2">{t.home.whatsNewTitle}</h2>
          <p className="typeBody textSecondary">{t.home.whatsNewLead}</p>
        </div>

        <ul className="gridRow">
          {NEWS_IDS.map((id) => (
            <li key={id} className={styles.colCard}>
              <article className={styles.card}>
                <div className={styles.thumb}>
                  <ImageIcon />
                </div>
                <div className={styles.cardBody}>
                  <span className={`typeCaption ${styles.tag}`}>{t.common.tag}</span>
                  <h3 className="typeBodySmall">{t.home.articleTitle}</h3>
                  <p className={`typeCaption ${styles.cardMeta}`}>{t.home.articleMeta}</p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BlogSection({ locale, t }: { locale: Locale; t: Messages }) {
  return (
    <section className="section">
      <div className="container grid">
        <div className={styles.sectionHeaderRow}>
          <h2 className="typeH2">{t.home.blogTitle}</h2>
          <Link className={`typeBodySmall ${styles.viewAll}`} href={localeHref(locale, '/blog')}>
            {t.common.viewAll}
          </Link>
        </div>

        {/* Chia 6/6 cột — hai khối là con trực tiếp của lưới. */}
        <article className={`${styles.blogCard} ${styles.blogFeature}`}>
          <div className={styles.blogCardBody}>
            <p className="typeCaption textTertiary">{t.common.publishDate}</p>
            <h3 className="typeCardTitle">{t.home.featuredArticleTitle}</h3>
            <p className="typeBodySmall textSecondary">{t.home.articleLead}</p>
          </div>
        </article>

        <div className={styles.blogSide}>
          {['b1', 'b2'].map((id) => (
            <article key={id} className={`${styles.blogCard} ${styles.blogSideCard}`}>
              <div className={styles.blogCardBody}>
                <p className="typeCaption textTertiary">{t.common.publishDate}</p>
                <h3 className="typeCardTitle">{t.home.articleTitle}</h3>
                <p className="typeBodySmall textSecondary">{t.home.articleLeadShort}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqSection({ t }: { t: Messages }) {
  const questions = [
    t.home.faqQuestion1,
    t.home.faqQuestion2,
    t.home.faqQuestion3,
    t.home.faqQuestion4,
  ];

  return (
    <section className="section">
      {/* Bất đối xứng 5/7 cột. */}
      <div className="container grid">
        <div className={styles.faqIntro}>
          <h2 className="typeH2">{t.home.faqTitle}</h2>
          <p className="typeBody textSecondary">{t.home.faqLead}</p>
          <button type="button" className={`typeBody ${styles.askButton}`}>
            {t.home.faqAsk}
          </button>
        </div>

        <div className={styles.faqList}>
          {questions.map((question, index) => (
            // Mục đầu mở sẵn (theo wireframe) để thấy ngay dạng câu trả lời.
            <details key={question} className={styles.faqItem} open={index === 0}>
              <summary className={`typeBody ${styles.faqQuestion}`}>
                {question}
                <ChevronIcon className={styles.faqMarker} />
              </summary>
              <p className={`typeBodySmall ${styles.faqAnswer}`}>{t.home.faqAnswer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
