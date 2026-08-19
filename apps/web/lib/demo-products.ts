/**
 * Sản phẩm demo cho hồ sơ Catalyst — TĨNH, không qua database.
 *
 * TẠI SAO TĨNH: xem `docs/build-plan/catalyst-demo.md`. Bản demo cố ý không phụ thuộc
 * Control Plane hay Postgres, nhờ vậy deploy chỉ là một app Next. Đây là NỢ CÓ CHỦ ĐÍCH —
 * sản phẩm thật sẽ đi qua bảng `applications` và url-policy như thiết kế ban đầu.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * BA PHÁT HIỆN KHI DỰNG FILE NÀY — đọc trước khi sửa, nếu không sẽ mất thời gian lặp lại
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * 1. **URL thường của Omni Calculator KHÔNG nhúng được.** Mọi trang `/finance/vat` kiểu đó
 *    trả header `x-frame-options: SAMEORIGIN`, nên trình duyệt từ chối hiển thị trong iframe
 *    từ origin khác — bất kể CSP phía ta cho phép hay không.
 *
 * 2. **Đường nhúng đúng là `/embed/<slug>`.** Đã đo: trả 200, có nội dung calculator thật, và
 *    KHÔNG có `x-frame-options`. Đó là lý do mọi `iframeSrc` dưới đây đều có tiền tố `/embed/`.
 *
 * 3. **Không phải slug nào cũng có bản embed.** `finance/profit-margin` trả 404 ở `/embed/`
 *    (URL thường thì 307 sang chỗ khác) — dùng `finance/margin` thay. Thêm mục mới thì PHẢI
 *    kiểm `curl -sI https://www.omnicalculator.com/embed/<slug>` trước, đừng đoán từ URL trình
 *    duyệt.
 *
 * GIẤY PHÉP: Omni có chương trình nhúng nhưng yêu cầu xin phép qua `embed@omnicalculator.com`.
 * Dùng cho bản demo nộp hồ sơ thì chấp nhận được; trước khi phát hành công khai phải xin phép,
 * hoặc tự viết công cụ. Đã ghi ở mục 7 của `catalyst-demo.md`.
 */

/** Chuỗi có hai bản dịch. Sản phẩm là DỮ LIỆU nên bản dịch đi kèm dữ liệu, không nằm ở
 *  catalog i18n — cùng cách `survey_question_translations` làm với bộ câu hỏi khảo sát. */
export interface Localized {
  vi: string;
  en: string;
}

export interface DemoProduct {
  /** Đi vào URL `/tools/<key>`. Chữ thường, gạch ngang. */
  key: string;
  title: Localized;
  description: Localized;
  category: Localized;
  /**
   * Ảnh minh hoạ, đường dẫn tuyệt đối tính từ `apps/web/public/` — xem `IMG` ở dưới.
   *
   * Ảnh là SVG 640×400 (đúng tỉ lệ 16:10 của `.thumb`), nên khung không bị nhảy khi ảnh tải
   * xong. Giao diện dùng `alt=""` vì tiêu đề nằm ngay dưới ảnh đã nói đủ — thêm chữ thay thế
   * lặp lại tiêu đề chỉ khiến trình đọc màn hình đọc hai lần.
   */
  image: string;
  /** BẮT BUỘC dùng dạng `/embed/<slug>` — xem phát hiện số 1 và 2 ở đầu file. */
  iframeSrc: string;
}

const OMNI = 'https://www.omnicalculator.com/embed';

/**
 * Thư mục ảnh minh hoạ, phục vụ tĩnh từ `apps/web/public/`.
 *
 * PHẢI nằm trong `apps/web/public`, không phải `public/` ở gốc repo — Next chỉ phục vụ thư
 * mục `public` NGANG HÀNG với `app/`. Đặt sai chỗ thì ảnh vẫn có trong repo mà mọi đường dẫn
 * đều 404, và không có gì báo lỗi cả. Đã dính đúng lỗi này một lần.
 *
 * `apps/web/public` được loại khỏi biome (`biome.json`): quy tắc a11y đòi mỗi `<svg>` có
 * `<title>`, nhưng các file này chỉ dùng qua `<img alt>` — nội dung bên trong SVG không tới
 * được trình đọc màn hình, nên thẻ đó không giúp ai. Chữ thay thế nằm ở `alt` của `<img>`.
 */
const IMG = '/demo-tools';

/**
 * Mười lăm công cụ, chọn theo MỘT tệp người dùng: người bán hàng và doanh nghiệp nhỏ.
 *
 * Cố ý không lấy máy tính BMI hay công cụ tổng quát — Omni CÓ những thứ đó và chúng nhúng
 * được, nhưng lưu lượng chúng kéo về là đám đông không liên quan tới thứ Hub bán. Mọi mục
 * dưới đây đều nằm trong quy trình thật của một người bán hàng hoặc chủ doanh nghiệp nhỏ:
 * định giá, chiết khấu, hoà vốn, hoa hồng, vay vốn, trả lương.
 *
 * MỖI `iframeSrc` PHẢI ĐƯỢC KIỂM TRƯỚC KHI THÊM — xem phát hiện số 3 ở đầu file. Cả mười lăm
 * mục đã đo `curl -sI .../embed/<slug>` trả 200 và không có `x-frame-options`.
 */
export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    key: 'tinh-bien-loi-nhuan',
    title: { vi: 'Tính biên lợi nhuận', en: 'Profit margin' },
    description: {
      vi: 'Biết chính xác bạn lãi bao nhiêu phần trăm trên mỗi đơn hàng.',
      en: 'See exactly what percentage you earn on each order.',
    },
    category: { vi: 'Kinh doanh', en: 'Business' },
    image: `${IMG}/tinh-bien-loi-nhuan.svg`,
    iframeSrc: `${OMNI}/finance/margin`,
  },
  {
    key: 'tinh-diem-hoa-von',
    title: { vi: 'Tính điểm hoà vốn', en: 'Break-even point' },
    description: {
      vi: 'Cần bán bao nhiêu sản phẩm để bù hết chi phí cố định.',
      en: 'How many units you must sell to cover fixed costs.',
    },
    category: { vi: 'Kinh doanh', en: 'Business' },
    image: `${IMG}/tinh-diem-hoa-von.svg`,
    iframeSrc: `${OMNI}/finance/break-even`,
  },
  {
    key: 'tinh-chiet-khau',
    title: { vi: 'Tính chiết khấu', en: 'Discount' },
    description: {
      vi: 'Giá sau khi giảm, và số tiền thực sự tiết kiệm được.',
      en: 'The price after a discount, and what you actually save.',
    },
    category: { vi: 'Bán hàng', en: 'Sales' },
    image: `${IMG}/tinh-chiet-khau.svg`,
    iframeSrc: `${OMNI}/finance/discount`,
  },
  {
    key: 'tinh-thue-gtgt',
    title: { vi: 'Tính thuế giá trị gia tăng', en: 'VAT' },
    description: {
      vi: 'Tách phần thuế khỏi giá bán, hoặc cộng thuế vào giá gốc.',
      en: 'Split tax out of a price, or add it on top.',
    },
    category: { vi: 'Thuế', en: 'Tax' },
    image: `${IMG}/tinh-thue-gtgt.svg`,
    iframeSrc: `${OMNI}/finance/vat`,
  },
  {
    key: 'tinh-hoa-hong',
    title: { vi: 'Tính hoa hồng', en: 'Commission' },
    description: {
      vi: 'Hoa hồng cho cộng tác viên hoặc phí sàn theo phần trăm doanh thu.',
      en: 'Affiliate commission or marketplace fees as a share of revenue.',
    },
    category: { vi: 'Bán hàng', en: 'Sales' },
    image: `${IMG}/tinh-hoa-hong.svg`,
    iframeSrc: `${OMNI}/finance/commission`,
  },
  {
    key: 'tinh-hieu-qua-dau-tu',
    title: { vi: 'Tính hiệu quả đầu tư', en: 'Return on investment' },
    description: {
      vi: 'Đo ROI của một khoản chi — ví dụ ngân sách chạy quảng cáo.',
      en: 'Measure the ROI of a spend — an ad budget, for example.',
    },
    category: { vi: 'Marketing', en: 'Marketing' },
    image: `${IMG}/tinh-hieu-qua-dau-tu.svg`,
    iframeSrc: `${OMNI}/finance/roi`,
  },
  {
    key: 'tinh-phan-tram',
    title: { vi: 'Tính phần trăm', en: 'Percentage' },
    description: {
      vi: 'Phép tính phần trăm hằng ngày: tăng, giảm, và tỉ lệ giữa hai số.',
      en: 'Everyday percentages: increase, decrease, and ratio between two numbers.',
    },
    category: { vi: 'Tiện ích', en: 'Utilities' },
    image: `${IMG}/tinh-phan-tram.svg`,
    iframeSrc: `${OMNI}/math/percentage`,
  },

  {
    key: 'tinh-gia-ban',
    title: { vi: 'Tính giá bán theo mức lãi', en: 'Markup' },
    description: {
      vi: 'Từ giá vốn và mức lãi mong muốn, ra giá niêm yết.',
      en: 'Turn cost price and target markup into a list price.',
    },
    category: { vi: 'Kinh doanh', en: 'Business' },
    image: `${IMG}/tinh-gia-ban.svg`,
    iframeSrc: `${OMNI}/finance/markup`,
  },
  {
    key: 'tinh-loi-nhuan',
    title: { vi: 'Tính lợi nhuận', en: 'Profit' },
    description: {
      vi: 'Doanh thu trừ chi phí — số tiền thực sự còn lại.',
      en: 'Revenue minus costs — what you actually keep.',
    },
    category: { vi: 'Kinh doanh', en: 'Business' },
    image: `${IMG}/tinh-loi-nhuan.svg`,
    iframeSrc: `${OMNI}/finance/profit`,
  },
  {
    key: 'tinh-khoan-vay',
    title: { vi: 'Tính khoản vay trả góp', en: 'Loan' },
    description: {
      vi: 'Số tiền phải trả mỗi kỳ cho một khoản vay kinh doanh.',
      en: 'The repayment due each period on a business loan.',
    },
    category: { vi: 'Tài chính', en: 'Finance' },
    image: `${IMG}/tinh-khoan-vay.svg`,
    iframeSrc: `${OMNI}/finance/loan`,
  },
  {
    key: 'tinh-lai-kep',
    title: { vi: 'Tính lãi kép', en: 'Compound interest' },
    description: {
      vi: 'Một khoản vốn lớn lên thế nào khi lãi được nhập gốc.',
      en: 'How a balance grows when interest is reinvested.',
    },
    category: { vi: 'Tài chính', en: 'Finance' },
    image: `${IMG}/tinh-lai-kep.svg`,
    iframeSrc: `${OMNI}/finance/compound-interest`,
  },
  {
    key: 'tinh-tiet-kiem',
    title: { vi: 'Lập kế hoạch tiết kiệm', en: 'Savings' },
    description: {
      vi: 'Cần để dành bao nhiêu mỗi tháng để đạt một mục tiêu.',
      en: 'How much to set aside each month to hit a goal.',
    },
    category: { vi: 'Tài chính', en: 'Finance' },
    image: `${IMG}/tinh-tiet-kiem.svg`,
    iframeSrc: `${OMNI}/finance/savings`,
  },
  {
    key: 'tinh-luong',
    title: { vi: 'Quy đổi lương', en: 'Salary' },
    description: {
      vi: 'Đổi qua lại giữa lương giờ, lương tháng và lương năm.',
      en: 'Convert between hourly, monthly and yearly pay.',
    },
    category: { vi: 'Nhân sự', en: 'People' },
    image: `${IMG}/tinh-luong.svg`,
    iframeSrc: `${OMNI}/finance/salary`,
  },
  {
    key: 'tinh-gio-cong',
    title: { vi: 'Tính giờ công', en: 'Time card' },
    description: {
      vi: 'Cộng giờ làm trong kỳ để tính công cho nhân viên.',
      en: 'Add up hours worked in a period to calculate pay.',
    },
    category: { vi: 'Nhân sự', en: 'People' },
    image: `${IMG}/tinh-gio-cong.svg`,
    iframeSrc: `${OMNI}/everyday-life/time-card`,
  },
  {
    key: 'tinh-thay-doi-phan-tram',
    title: { vi: 'Tính mức thay đổi phần trăm', en: 'Percentage change' },
    description: {
      vi: 'Doanh số tháng này so tháng trước tăng hay giảm bao nhiêu.',
      en: 'How much this month rose or fell against the last.',
    },
    category: { vi: 'Tiện ích', en: 'Utilities' },
    image: `${IMG}/tinh-thay-doi-phan-tram.svg`,
    iframeSrc: `${OMNI}/math/percentage-change`,
  },
];

/** Một danh mục cùng số công cụ thuộc về nó. */
export interface DemoCategory {
  label: Localized;
  count: number;
}

/**
 * Danh sách danh mục, SUY RA TỪ chính `DEMO_PRODUCTS` chứ không khai riêng.
 *
 * Cùng lý do với `DEMO_FRAME_ORIGINS`: một danh sách khai tay sẽ lệch khỏi dữ liệu ngay lần
 * thêm sản phẩm đầu tiên mà không có gì báo. Suy ra thì hai thứ không rời nhau được.
 *
 * Khoá gộp lấy theo bản tiếng Việt vì đó là bản gốc — mỗi mục đều có đủ hai thứ tiếng nên
 * chọn bản nào làm khoá cũng cho cùng cách nhóm.
 */
export function demoCategories(): DemoCategory[] {
  const seen = new Map<string, DemoCategory>();

  for (const product of DEMO_PRODUCTS) {
    const existing = seen.get(product.category.vi);
    if (existing === undefined) {
      seen.set(product.category.vi, { label: product.category, count: 1 });
    } else {
      existing.count += 1;
    }
  }

  return Array.from(seen.values());
}

/**
 * Lọc danh sách theo danh mục và từ khoá.
 *
 * SO KHỚP DANH MỤC BẰNG KHOÁ TIẾNG VIỆT, vì đó là khoá gộp mà `demoCategories()` dùng. Nhờ
 * vậy một link `?category=Kinh doanh` chia sẻ được giữa hai ngôn ngữ: mở ở `/en` vẫn ra đúng
 * nhóm đó, chỉ nhãn hiển thị đổi. Nếu khớp theo nhãn đang hiển thị thì link sẽ chết ngay khi
 * người nhận xem ở ngôn ngữ khác.
 *
 * TÌM KIẾM SO KHỚP CẢ HAI NGÔN NGỮ, không chỉ ngôn ngữ đang xem: người Việt gõ "vat" hay
 * "margin" là chuyện thường, và chặn họ lại chẳng được lợi gì.
 *
 * BỎ DẤU TRƯỚC KHI SO KHỚP. Người Việt gõ không dấu là chuyện bình thường — "luong", "hoa
 * hong", "thue" — và trước khi có bước này thì "luong" trả về RỖNG trong khi "lương" trả về
 * hai kết quả. Bỏ dấu cả hai vế làm hai cách gõ cho cùng một kết quả.
 */

/**
 * Bỏ dấu tiếng Việt để so khớp.
 *
 * `NFD` tách nguyên âm khỏi dấu thanh rồi xoá phần dấu — xử lý được à/á/ả/ã/ạ, ă, â, ê, ô, ơ, ư.
 * NHƯNG `đ` KHÔNG PHẢI nguyên âm có dấu phụ: nó là một chữ cái riêng trong Unicode và `NFD`
 * không tách nó ra. Phải thay tay, nếu không "dong ho" sẽ không khớp "đồng hồ".
 */
function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
/** Hạ chữ theo locale rồi bỏ dấu — dùng cho CẢ hai vế của phép so khớp. */
function normalize(value: string): string {
  return stripDiacritics(value.trim().toLocaleLowerCase());
}

export function filterDemoProducts(input: {
  category?: string | undefined;
  query?: string | undefined;
}): DemoProduct[] {
  const category = input.category?.trim();
  const query = input.query === undefined ? undefined : normalize(input.query);

  return DEMO_PRODUCTS.filter((product) => {
    if (category !== undefined && category !== '' && product.category.vi !== category) {
      return false;
    }

    if (query === undefined || query === '') return true;

    const haystack = normalize(
      [
        product.title.vi,
        product.title.en,
        product.description.vi,
        product.description.en,
        product.category.vi,
        product.category.en,
      ].join(' '),
    );

    return haystack.includes(query);
  });
}

/** Tra một sản phẩm theo `key`. Trả `undefined` nếu không có — caller tự quyết 404. */
export function findDemoProduct(key: string): DemoProduct | undefined {
  return DEMO_PRODUCTS.find((product) => product.key === key);
}

/**
 * Các origin cần cho `frame-src` của CSP, SUY RA TỪ CHÍNH DANH SÁCH TRÊN.
 *
 * VÌ SAO KHÔNG DÙNG BIẾN MÔI TRƯỜNG: một biến env quên đặt trên Vercel sẽ khiến mọi iframe
 * trắng trang ở production trong khi local vẫn chạy tốt — đúng loại lỗi tốn nhiều giờ nhất để
 * tìm, vì trình duyệt chặn iframe mà không báo gì. Suy ra từ danh sách thì hai thứ không bao
 * giờ lệch nhau được.
 */
export const DEMO_FRAME_ORIGINS: string[] = Array.from(
  new Set(DEMO_PRODUCTS.map((product) => new URL(product.iframeSrc).origin)),
);

/** Đọc một trường song ngữ theo locale đang xem. */
export function pick(value: Localized, locale: string): string {
  return locale === 'en' ? value.en : value.vi;
}
