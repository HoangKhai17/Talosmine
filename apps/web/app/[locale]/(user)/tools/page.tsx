import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { Locale } from '../../../../i18n/locale';
import { localeHref } from '../../../../i18n/locale';
import { format, type Messages } from '../../../../i18n/messages';
import { localeAlternates, type PageLocaleParams } from '../../../../i18n/params';
import {
  DEMO_PRODUCTS,
  type DemoProduct,
  demoCategories,
  filterDemoProducts,
  pick,
} from '../../../../lib/demo-products';
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

/** Wireframe liệt kê tên thương hiệu ở đây. Đánh số thay vì bịa — danh sách thật chờ DEC-B01. */
const MODEL_FILTER_COUNT = 6;

/** Bộ lọc nằm trên URL nên link chia sẻ được và nút Back của trình duyệt hoạt động đúng. */
export interface ToolsSearch {
  /** Khoá danh mục — LUÔN là nhãn tiếng Việt, xem `filterDemoProducts`. */
  category?: string;
  /** Từ khoá tìm kiếm. */
  q?: string;
}

export default async function ToolsPage({
  params,
  searchParams,
}: PageLocaleParams & { searchParams: Promise<ToolsSearch> }) {
  const { locale, t } = await resolvePageContent(params);
  const { category, q } = await searchParams;

  /**
   * LỌC Ở SERVER, không phải ở trình duyệt.
   *
   * Bộ lọc nằm trong query string nên: link chia sẻ được, nút Back đi đúng bước, và trang
   * vẫn lọc được khi JavaScript chưa tải xong hoặc bị chặn. Đổi lại là mỗi lần lọc phải đi
   * một vòng mạng — với danh mục mười lăm mục thì đó là cái giá rẻ hơn nhiều so với việc đẩy
   * cả danh sách xuống client rồi tự dựng lại state, URL và lịch sử duyệt.
   */
  const results = filterDemoProducts({ category, query: q });

  return (
    <>
      <BrowseHeader locale={locale} t={t} category={category} query={q} />
      <BrowseBody t={t} locale={locale} results={results} category={category} query={q} />
      <Newsletter locale={locale} />
    </>
  );
}

function BrowseHeader({
  locale,
  t,
  category,
  query,
}: {
  locale: Locale;
  t: Messages;
  category: string | undefined;
  query: string | undefined;
}) {
  return (
    <section className={styles.headerSection}>
      <div className="container grid">
        <Breadcrumb locale={locale} trail={[{ label: t.tools.breadcrumb }]} />

        <h1 className={`typeH1 ${styles.pageTitle}`}>{t.tools.title}</h1>

        <p className={`typeBodySmall textSecondary ${styles.pageLead}`}>{t.tools.lead}</p>

        <CategoryStrip locale={locale} t={t} active={category} query={query} />
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
function CategoryStrip({
  locale,
  t,
  active,
  query,
}: {
  locale: Locale;
  t: Messages;
  active: string | undefined;
  query: string | undefined;
}) {
  /**
   * `<Link>` CHỨ KHÔNG PHẢI `<button>`.
   *
   * Mỗi danh mục là một địa chỉ thật, nên nó phải là một link: mở tab mới được, chép link
   * được, và bộ máy tìm kiếm đi theo được. Một `<button>` gắn `onClick` trông giống hệt trên
   * màn hình nhưng mất cả ba thứ đó.
   *
   * Ô tìm kiếm hiện tại được GIỮ LẠI khi đổi danh mục — người dùng vừa gõ từ khoá mà bấm một
   * danh mục rồi thấy từ khoá biến mất sẽ tưởng mình bấm nhầm.
   */
  const link = (category: string | null) => {
    const params = new URLSearchParams();
    if (category !== null) params.set('category', category);
    if (query !== undefined && query !== '') params.set('q', query);
    const suffix = params.size === 0 ? '' : `?${params.toString()}`;
    return `${localeHref(locale, '/tools')}${suffix}`;
  };

  const tabs = [
    { key: null, label: t.tools.categoryAll, count: DEMO_PRODUCTS.length },
    ...demoCategories().map((category) => ({
      key: category.label.vi,
      label: pick(category.label, locale),
      count: category.count,
    })),
  ];

  return (
    <div className={styles.categoryStrip}>
      <button type="button" className={styles.stripArrow} aria-label={t.a11y.prevCategory}>
        <ChevronIcon className={styles.stripArrowPrev} />
      </button>

      <ul className={styles.stripList}>
        {tabs.map((tab) => {
          const selected = (active ?? null) === tab.key || (active === '' && tab.key === null);
          return (
            <li key={tab.key ?? '__tat-ca__'}>
              {/*
                `aria-current` chứ không chỉ đổi màu nền: người dùng trình đọc màn hình không
                thấy màu, nên nếu không có thuộc tính này thì họ không biết mình đang lọc gì.
              */}
              <Link
                className={`typeBodySmall ${styles.stripTab}`}
                href={link(tab.key)}
                aria-current={selected ? 'true' : undefined}
                data-selected={selected || undefined}
              >
                {tab.label} ({tab.count})
              </Link>
            </li>
          );
        })}
      </ul>

      <button type="button" className={styles.stripArrow} aria-label={t.a11y.nextCategory}>
        <ChevronIcon className={styles.stripArrowNext} />
      </button>
    </div>
  );
}

function BrowseBody({
  t,
  locale,
  results,
  category,
  query,
}: {
  t: Messages;
  locale: Locale;
  results: DemoProduct[];
  category: string | undefined;
  query: string | undefined;
}) {
  return (
    <section className={styles.bodySection}>
      <div className="container grid">
        <FilterSidebar t={t} locale={locale} category={category} query={query} />

        {/*
          Kết quả ĐÃ LỌC theo danh mục và từ khoá trên URL. Bố cục và lưới giữ NGUYÊN — đúng
          ghi chú D2 của `pending-work.md`: sang giai đoạn có dữ liệu thì chỉ thay nguồn, không
          dựng lại layout.
        */}
        {results.length === 0 ? (
          <p className={`typeBody ${styles.emptyState}`}>{t.tools.noResults}</p>
        ) : (
          <ul className={styles.results} aria-label={t.a11y.results}>
            {results.map((product) => (
              <li key={product.key} className={styles.resultItem}>
                <ToolCard product={product} locale={locale} t={t} />
              </li>
            ))}
          </ul>
        )}

        {/*
          SỐ KẾT QUẢ, KHÔNG PHẢI NÚT "XEM THÊM".

          Trước đây chỗ này là nút "Xem thêm" không gắn hành vi. Với danh mục mười lăm mục thì
          toàn bộ đã hiện sẵn — một nút "Xem thêm" ở đó nói dối rằng còn thứ chưa hiện, và
          người bấm sẽ tưởng trang hỏng. Khi danh mục đủ lớn để cần phân trang thì nút quay
          lại, kèm `?page=` trên URL cho đúng khuôn với bộ lọc.

          Ô lưới giữ NGUYÊN vị trí cũ để nhịp dọc của trang không đổi.
        */}
        <div className={styles.loadMoreRow}>
          <p className={`typeBodySmall textSecondary ${styles.resultCount}`}>
            {format(t.tools.resultCount, { count: results.length })}
          </p>
        </div>
      </div>
    </section>
  );
}

function FilterSidebar({
  t,
  locale,
  category,
  query,
}: {
  t: Messages;
  locale: Locale;
  category: string | undefined;
  query: string | undefined;
}) {
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
      {/*
        FORM GET THẬT, không phải ô nhập trang trí.

        `method="get"` gửi thẳng lên chính URL này dạng `?q=...`, nên ô tìm kiếm CHẠY ĐƯỢC KHI
        KHÔNG CÓ JAVASCRIPT — không cần một dòng JS nào, không cần client component. Đây cũng
        là lý do bộ lọc nằm trên query string chứ không trong state.

        `<input type="hidden" name="category">` giữ danh mục đang chọn: thiếu nó thì mỗi lần
        gõ tìm kiếm, danh mục người dùng vừa chọn lại âm thầm bị xoá.
      */}
      <form className={styles.filterField} method="get" action={localeHref(locale, '/tools')}>
        {category !== undefined && category !== '' && (
          <input type="hidden" name="category" value={category} />
        )}

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
            defaultValue={query ?? ''}
            placeholder={t.tools.filterSearchPlaceholder}
          />
        </div>

        {/*
          Nút gửi ẨN KHỎI TẦM NHÌN nhưng vẫn tồn tại: nhấn Enter trong ô tìm kiếm cần một nút
          submit để gửi form. Không hiện nút vì wireframe không có, và Enter là thao tác mà ai
          cũng làm sẵn trong một ô tìm kiếm.
        */}
        <button type="submit" className="visuallyHidden">
          {t.tools.filterSubmit}
        </button>
      </form>

      {/*
        CÁC BỘ LỌC DƯỚI ĐÂY CHƯA NỐI, và vì thế chúng THẬT SỰ `disabled`.

        Chúng lọc theo taxonomy của công cụ AI (mô hình, có API, mã nguồn mở) — thứ không áp
        dụng được cho máy tính tài chính, và danh sách thật còn chờ DEC-B01. Để chúng bấm được
        rồi không có gì xảy ra là kiểu hỏng khó chịu nhất: người dùng tưởng mình lọc sai chứ
        không nghĩ là tính năng chưa có.
      */}
      <p className={`typeCaption textSecondary ${styles.filterNote}`}>{t.tools.filterComingSoon}</p>

      <div className={styles.filterField}>
        <label className="typeBodySmall" htmlFor="filter-price">
          {t.tools.filterPriceLabel}
        </label>
        <select
          id="filter-price"
          className={`typeBodySmall ${styles.filterSelect}`}
          name="price"
          disabled
        >
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
              <input type="checkbox" name="feature" value={label} disabled />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset className={styles.filterGroup}>
          <legend className="typeBodySmall">{t.tools.modelLegend}</legend>
          {models.map((label) => (
            <label key={label} className={`typeCaption ${styles.checkRow}`}>
              <input type="checkbox" name="model" value={label} disabled />
              {label}
            </label>
          ))}
        </fieldset>

        {/* Radio chứ không checkbox: chỉ sắp xếp được theo MỘT tiêu chí tại một thời điểm. */}
        <fieldset className={styles.filterGroup}>
          <legend className="typeBodySmall">{t.tools.sortLegend}</legend>
          {sortOptions.map((label, index) => (
            <label key={label} className={`typeCaption ${styles.checkRow}`}>
              <input type="radio" name="sort" value={label} defaultChecked={index === 0} disabled />
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
