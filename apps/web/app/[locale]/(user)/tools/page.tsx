import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { Locale } from '../../../../i18n/locale';
import { localeHref } from '../../../../i18n/locale';
import { format, type Messages } from '../../../../i18n/messages';
import { localeAlternates, type PageLocaleParams } from '../../../../i18n/params';
import { DEMO_PRODUCTS, type DemoProduct, pick } from '../../../../lib/demo-products';
import { resolvePageContent } from '../../../../server/site-content';
import { Breadcrumb } from '../breadcrumb';
import { ChevronIcon, SearchIcon } from '../icons';
import { Newsletter } from '../newsletter';
import styles from './page.module.css';

export async function generateMetadata({ params }: PageLocaleParams): Promise<Metadata> {
  const { locale, t, slots } = await resolvePageContent(params);
  const description = slots['seo.description.tools'];
  return {
    title: t.meta.tools,
    ...(description !== undefined ? { description } : {}),
    alternates: localeAlternates(locale, '/tools'),
  };
}

/**
 * Trang duyệt công cụ — bố cục thô theo wireframe Figma của chủ dự án.
 *
 * VÌ SAO Ở `/tools` CHỨ KHÔNG PHẢI `/categories`: chính wireframe nói vậy — breadcrumb ghi
 * "Home > Tools" và mục "Tools" trên header đang được gạch chân. Tiêu đề "duyệt theo danh
 * mục" mô tả CÁCH lọc, không phải route.
 *
 * KIẾN TRÚC LƯỚI — giống trang chủ, mọi khối là con TRỰC TIẾP của `.container.grid`:
 *
 *   Breadcrumb        4 /  8 / 12
 *   Tiêu đề           4 /  8 /  8
 *   Mô tả             4 /  8 /  4
 *   Dải danh mục      trọn hàng (1 / -1)
 *   Bộ lọc (aside)    4 /  8 /  3
 *   Lưới kết quả      4 /  8 /  9   ← subgrid, xem page.module.css
 *   Nút "Xem thêm"    4 /  8 /  9 (bắt đầu từ cột 4, thẳng hàng với lưới kết quả)
 *
 * TRẠNG THÁI: BẢN DỰNG BỐ CỤC. Mọi nội dung là dữ liệu mẫu, đúng như wireframe. Nguồn thật
 * là Catalog (P3) và còn chờ DEC-B01 chốt danh sách ứng dụng của Hub.
 *
 * Các bộ lọc là form TĨNH: chưa có `action`, chưa gắn state. Chúng ở đây để thấy bố cục và
 * nhịp dọc của cột trái. Khi nối API, chuyển sang `searchParams` (lọc nằm trên URL thì chia
 * sẻ được link và không cần client component).
 */

/** Nhãn danh mục sẽ đến từ Catalog. Đánh số để không ai nhầm là taxonomy đã chốt. */
const CATEGORY_TAB_COUNT = 6;

/** Wireframe liệt kê tên thương hiệu ở đây. Đánh số thay vì bịa — danh sách thật chờ DEC-B01. */
const MODEL_FILTER_COUNT = 6;

export default async function ToolsPage({ params }: PageLocaleParams) {
  const { locale, t } = await resolvePageContent(params);

  return (
    <>
      <BrowseHeader locale={locale} t={t} />
      <BrowseBody t={t} locale={locale} />
      <Newsletter locale={locale} />
    </>
  );
}

function BrowseHeader({ locale, t }: { locale: Locale; t: Messages }) {
  return (
    <section className={styles.headerSection}>
      <div className="container grid">
        <Breadcrumb locale={locale} trail={[{ label: t.tools.breadcrumb }]} />

        <h1 className={`typeH1 ${styles.pageTitle}`}>{t.tools.title}</h1>

        <p className={`typeBodySmall textSecondary ${styles.pageLead}`}>{t.tools.lead}</p>

        <CategoryStrip t={t} />
      </div>
    </section>
  );
}

/**
 * Dải danh mục cuộn ngang.
 *
 * Hai nút mũi tên là ĐIỀU KHIỂN THẬT chứ không phải hình trang trí, nên chúng là `<button>`
 * có nhãn — nhưng chưa gắn hành vi cuộn (cần client component).
 *
 * Trong lúc đó không ai bị kẹt: chuột và cảm ứng cuộn được nhờ `overflow-x: auto`, còn bàn
 * phím thì Tab tới từng pill và trình duyệt TỰ cuộn pill đang focus vào tầm nhìn. Vì thế
 * KHÔNG đặt `tabindex` lên `<ul>` — nó chỉ thêm một chặng dừng thừa trong luồng Tab mà
 * không mở thêm được nội dung nào.
 */
function CategoryStrip({ t }: { t: Messages }) {
  const tabs = Array.from({ length: CATEGORY_TAB_COUNT }, (_, i) =>
    format(t.tools.categoryTab, { n: i + 1 }),
  );

  return (
    <div className={styles.categoryStrip}>
      <button type="button" className={styles.stripArrow} aria-label={t.a11y.prevCategory}>
        <ChevronIcon className={styles.stripArrowPrev} />
      </button>

      <ul className={styles.stripList}>
        {tabs.map((label) => (
          <li key={label}>
            <button type="button" className={`typeBodySmall ${styles.stripTab}`}>
              {label}
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className={styles.stripArrow} aria-label={t.a11y.nextCategory}>
        <ChevronIcon className={styles.stripArrowNext} />
      </button>
    </div>
  );
}

function BrowseBody({ t, locale }: { t: Messages; locale: Locale }) {
  return (
    <section className={styles.bodySection}>
      <div className="container grid">
        <FilterSidebar t={t} />

        {/*
          Dữ liệu THẬT từ `lib/demo-products.ts`, thay cho mảng `RESULT_IDS` giữ chỗ trước đây.
          Bố cục, lưới và bộ lọc giữ NGUYÊN — đúng ghi chú D2 của `pending-work.md`: sang giai
          đoạn có dữ liệu thì chỉ thay nguồn, không dựng lại layout.

          Bộ lọc bên trái vẫn chưa nối (chúng lọc theo taxonomy chưa tồn tại) — đó là giới hạn
          đã biết, không phải mới phát sinh ở đây.
        */}
        <ul className={styles.results} aria-label={t.a11y.results}>
          {DEMO_PRODUCTS.map((product) => (
            <li key={product.key} className={styles.resultItem}>
              <ToolCard product={product} locale={locale} t={t} />
            </li>
          ))}
        </ul>

        {/*
          Nút nằm ở ô lưới RIÊNG chứ không nhét vào `<ul>`: nó không phải một kết quả, và
          trình đọc màn hình không nên nghe nó là mục thứ 10 của danh sách.

          Ở desktop nó bắt đầu từ cột 4 để căn giữa theo LƯỚI KẾT QUẢ, không phải giữa trang
          — đúng như wireframe.
        */}
        <div className={styles.loadMoreRow}>
          <button type="button" className={`typeBodySmall ${styles.loadMore}`}>
            {t.common.loadMore}
          </button>
        </div>
      </div>
    </section>
  );
}

function FilterSidebar({ t }: { t: Messages }) {
  /**
   * Bộ lọc theo tính năng. Giữ nhãn mang nghĩa (không phải "Tính năng 1") vì ĐỘ DÀI NHÃN là
   * thứ đang cần xem: nhãn dài quyết định cột trái có bị vỡ hay không.
   */
  const features = [
    t.tools.featureApi,
    t.tools.featureNoCode,
    t.tools.featureOpenSource,
    t.tools.featureExtension,
  ];

  const models = Array.from({ length: MODEL_FILTER_COUNT }, (_, i) =>
    format(t.tools.modelName, { n: i + 1 }),
  );

  /** Đây là hành vi giao diện, không phải dữ liệu — nên giữ nhãn thật. */
  const sortOptions = [t.tools.sortPopular, t.tools.sortNewest, t.tools.sortTopRated];

  return (
    <aside className={styles.sidebar} aria-label={t.a11y.filters}>
      <div className={styles.filterField}>
        <label className="typeBodySmall" htmlFor="filter-name">
          {t.tools.filterNameLabel}
        </label>
        <div className={styles.filterSearch}>
          <SearchIcon className={styles.filterSearchIcon} />
          <input
            id="filter-name"
            className={`typeBodySmall ${styles.filterSearchInput}`}
            type="search"
            name="q"
            placeholder={t.tools.filterSearchPlaceholder}
          />
        </div>
      </div>

      <div className={styles.filterField}>
        <label className="typeBodySmall" htmlFor="filter-price">
          {t.tools.filterPriceLabel}
        </label>
        {/*
          `<select>` gốc chứ không dựng dropdown riêng: nó đã đúng trên di động, đúng với
          bàn phím và đúng với trình đọc màn hình mà không cần một dòng JS nào.
        */}
        <select id="filter-price" className={`typeBodySmall ${styles.filterSelect}`} name="price">
          {/* `value` là mã máy đọc — KHÔNG dịch. Chỉ nhãn hiển thị mới đổi theo ngôn ngữ. */}
          <option value="">{t.tools.priceAll}</option>
          <option value="free">{t.tools.priceFree}</option>
          <option value="paid">{t.tools.pricePaid}</option>
        </select>
      </div>

      {/*
        Ba nhóm còn lại nằm chung MỘT khung viền theo wireframe. Mỗi nhóm là `<fieldset>` +
        `<legend>` — đó là cách chuẩn để trình đọc màn hình biết "Có API" thuộc nhóm nào.
      */}
      <div className={styles.filterCard}>
        <fieldset className={styles.filterGroup}>
          <legend className="typeBodySmall">{t.tools.featureLegend}</legend>
          {features.map((label) => (
            <label key={label} className={`typeCaption ${styles.checkRow}`}>
              <input type="checkbox" name="feature" value={label} />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset className={styles.filterGroup}>
          <legend className="typeBodySmall">{t.tools.modelLegend}</legend>
          {models.map((label) => (
            <label key={label} className={`typeCaption ${styles.checkRow}`}>
              <input type="checkbox" name="model" value={label} />
              {label}
            </label>
          ))}
        </fieldset>

        {/* Radio chứ không checkbox: chỉ sắp xếp được theo MỘT tiêu chí tại một thời điểm. */}
        <fieldset className={styles.filterGroup}>
          <legend className="typeBodySmall">{t.tools.sortLegend}</legend>
          {sortOptions.map((label, index) => (
            <label key={label} className={`typeCaption ${styles.checkRow}`}>
              <input type="radio" name="sort" value={label} defaultChecked={index === 0} />
              {label}
            </label>
          ))}
        </fieldset>
      </div>
    </aside>
  );
}

function ToolCard({ product, locale, t }: { product: DemoProduct; locale: Locale; t: Messages }) {
  return (
    <article className={styles.card}>
      <Link className={styles.cardLink} href={localeHref(locale, `/tools/${product.key}`)}>
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
          <div className={styles.cardTitleRow}>
            <h2 className="typeCardTitle">{pick(product.title, locale)}</h2>
            <span className={`typeCaption ${styles.priceBadge}`}>{t.tools.priceFree}</span>
          </div>

          <p className="typeBodySmall textSecondary">{pick(product.description, locale)}</p>

          <ul className={styles.tagList}>
            <li className={`typeCaption ${styles.tag}`}>{pick(product.category, locale)}</li>
          </ul>
        </div>
      </Link>
    </article>
  );
}
