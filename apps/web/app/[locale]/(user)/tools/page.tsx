import type { Metadata } from 'next';
import { Breadcrumb } from '../breadcrumb';
import { DraftBanner } from '../draft-banner';
import { ChevronIcon, ImageIcon, SearchIcon } from '../icons';
import { Newsletter } from '../newsletter';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Talosmine — Duyệt công cụ theo danh mục',
};

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
const PLACEHOLDER_CATEGORY_TABS = [
  'Danh mục 1',
  'Danh mục 2',
  'Danh mục 3',
  'Danh mục 4',
  'Danh mục 5',
  'Danh mục 6',
];

/**
 * Bộ lọc theo tính năng. Giữ nhãn mang nghĩa (không phải "Tính năng 1") vì ĐỘ DÀI NHÃN là
 * thứ đang cần xem: nhãn dài quyết định cột trái có bị vỡ hay không.
 */
const PLACEHOLDER_FEATURE_FILTERS = [
  'Có API',
  'Không cần code',
  'Mã nguồn mở',
  'Tiện ích trình duyệt',
];

/** Wireframe liệt kê tên thương hiệu ở đây. Đánh số thay vì bịa — danh sách thật chờ DEC-B01. */
const PLACEHOLDER_MODEL_FILTERS = [
  'Mô hình 1',
  'Mô hình 2',
  'Mô hình 3',
  'Mô hình 4',
  'Mô hình 5',
  'Mô hình 6',
];

/** Đây là hành vi giao diện, không phải dữ liệu — nên giữ nhãn thật. */
const SORT_OPTIONS = ['Phổ biến nhất', 'Mới nhất', 'Đánh giá cao nhất'];

/** Chín thẻ = ba hàng đầy ở desktop, đủ để thấy nhịp dọc giữa các hàng. */
const PLACEHOLDER_RESULTS = [
  { id: 'r1', price: 'Miễn phí' },
  { id: 'r2', price: 'Miễn phí + Trả phí' },
  { id: 'r3', price: 'Miễn phí' },
  { id: 'r4', price: 'Miễn phí + Trả phí' },
  { id: 'r5', price: 'Miễn phí' },
  { id: 'r6', price: 'Miễn phí + Trả phí' },
  { id: 'r7', price: 'Miễn phí' },
  { id: 'r8', price: 'Miễn phí + Trả phí' },
  { id: 'r9', price: 'Miễn phí' },
];

export default function ToolsPage() {
  return (
    <>
      <DraftBanner>
        Bản dựng bố cục — bộ lọc và danh sách công cụ là dữ liệu mẫu, chưa nối danh mục thật.
      </DraftBanner>

      <BrowseHeader />
      <BrowseBody />
      <Newsletter />
    </>
  );
}

function BrowseHeader() {
  return (
    <section className={styles.headerSection}>
      <div className="container grid">
        <Breadcrumb trail={[{ label: 'Công cụ' }]} />

        <h1 className={`typeH1 ${styles.pageTitle}`}>Duyệt công cụ AI theo danh mục</h1>

        <p className={`typeBodySmall textSecondary ${styles.pageLead}`}>
          Khám phá bộ sưu tập công cụ AI đang lớn dần, so sánh khả năng và tìm đúng giải pháp cho
          từng dự án, từng quy trình làm việc.
        </p>

        <CategoryStrip />
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
function CategoryStrip() {
  return (
    <div className={styles.categoryStrip}>
      <button type="button" className={styles.stripArrow} aria-label="Danh mục trước">
        <ChevronIcon className={styles.stripArrowPrev} />
      </button>

      <ul className={styles.stripList}>
        {PLACEHOLDER_CATEGORY_TABS.map((label) => (
          <li key={label}>
            <button type="button" className={`typeBodySmall ${styles.stripTab}`}>
              {label}
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className={styles.stripArrow} aria-label="Danh mục sau">
        <ChevronIcon className={styles.stripArrowNext} />
      </button>
    </div>
  );
}

function BrowseBody() {
  return (
    <section className={styles.bodySection}>
      <div className="container grid">
        <FilterSidebar />

        <ul className={styles.results} aria-label="Kết quả">
          {PLACEHOLDER_RESULTS.map((tool) => (
            <li key={tool.id} className={styles.resultItem}>
              <ToolCard price={tool.price} />
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
            Xem thêm
          </button>
        </div>
      </div>
    </section>
  );
}

function FilterSidebar() {
  return (
    <aside className={styles.sidebar} aria-label="Bộ lọc">
      <div className={styles.filterField}>
        <label className="typeBodySmall" htmlFor="filter-name">
          Tên công cụ
        </label>
        <div className={styles.filterSearch}>
          <SearchIcon className={styles.filterSearchIcon} />
          <input
            id="filter-name"
            className={`typeBodySmall ${styles.filterSearchInput}`}
            type="search"
            name="q"
            placeholder="Tìm kiếm…"
          />
        </div>
      </div>

      <div className={styles.filterField}>
        <label className="typeBodySmall" htmlFor="filter-price">
          Giá
        </label>
        {/*
          `<select>` gốc chứ không dựng dropdown riêng: nó đã đúng trên di động, đúng với
          bàn phím và đúng với trình đọc màn hình mà không cần một dòng JS nào.
        */}
        <select id="filter-price" className={`typeBodySmall ${styles.filterSelect}`} name="price">
          <option value="">Tất cả</option>
          <option value="free">Miễn phí</option>
          <option value="paid">Trả phí</option>
        </select>
      </div>

      {/*
        Ba nhóm còn lại nằm chung MỘT khung viền theo wireframe. Mỗi nhóm là `<fieldset>` +
        `<legend>` — đó là cách chuẩn để trình đọc màn hình biết "Có API" thuộc nhóm nào.
      */}
      <div className={styles.filterCard}>
        <fieldset className={styles.filterGroup}>
          <legend className="typeBodySmall">Tính năng</legend>
          {PLACEHOLDER_FEATURE_FILTERS.map((label) => (
            <label key={label} className={`typeCaption ${styles.checkRow}`}>
              <input type="checkbox" name="feature" value={label} />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset className={styles.filterGroup}>
          <legend className="typeBodySmall">Mô hình</legend>
          {PLACEHOLDER_MODEL_FILTERS.map((label) => (
            <label key={label} className={`typeCaption ${styles.checkRow}`}>
              <input type="checkbox" name="model" value={label} />
              {label}
            </label>
          ))}
        </fieldset>

        {/* Radio chứ không checkbox: chỉ sắp xếp được theo MỘT tiêu chí tại một thời điểm. */}
        <fieldset className={styles.filterGroup}>
          <legend className="typeBodySmall">Sắp xếp theo</legend>
          {SORT_OPTIONS.map((label, index) => (
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

function ToolCard({ price }: { price: string }) {
  return (
    <article className={styles.card}>
      <div className={styles.thumb}>
        <ImageIcon />
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardTitleRow}>
          <h2 className="typeCardTitle">Tên công cụ</h2>
          <span className={`typeCaption ${styles.priceBadge}`}>{price}</span>
        </div>

        <p className="typeBodySmall textSecondary">
          Mô tả ngắn về công cụ sẽ hiển thị ở đây khi danh mục được kết nối.
        </p>
        <p className="typeBodySmall textSecondary">
          Đoạn thứ hai giữ chỗ để thấy chiều cao thật của thẻ khi mô tả dài hơn một dòng.
        </p>

        <ul className={styles.tagList}>
          <li className={`typeCaption ${styles.tag}`}>Nhãn 1</li>
          <li className={`typeCaption ${styles.tag}`}>Nhãn 2</li>
        </ul>
      </div>
    </article>
  );
}
