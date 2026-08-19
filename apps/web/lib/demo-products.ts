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

export interface DemoProduct {
  /** Đi vào URL `/tools/<key>`. Chữ thường, gạch ngang. */
  key: string;
  title: string;
  description: string;
  category: string;
  /**
   * Đường dẫn ảnh trong `public/`. **Tab 3 (GPT) cung cấp tên file** rồi Tab 1 điền vào đây.
   * Để chuỗi rỗng nghĩa là chưa có ảnh — giao diện phải chịu được trường hợp đó.
   */
  image: string;
  /** BẮT BUỘC dùng dạng `/embed/<slug>` — xem phát hiện số 1 và 2 ở đầu file. */
  iframeSrc: string;
}

const OMNI = 'https://www.omnicalculator.com/embed';

/**
 * Bảy công cụ, chọn theo MỘT tệp người dùng: người bán hàng online.
 *
 * Cố ý không lấy máy tính BMI hay công cụ tổng quát: lưu lượng chúng kéo về là đám đông không
 * liên quan. Bảy mục dưới đây đều nằm trong quy trình thật của một người bán hàng — tính giá,
 * tính chiết khấu, tính hoà vốn, tính hoa hồng.
 */
export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    key: 'tinh-bien-loi-nhuan',
    title: 'Tính biên lợi nhuận',
    description: 'Biết chính xác bạn lãi bao nhiêu phần trăm trên mỗi đơn hàng.',
    category: 'Kinh doanh',
    image: '',
    iframeSrc: `${OMNI}/finance/margin`,
  },
  {
    key: 'tinh-diem-hoa-von',
    title: 'Tính điểm hoà vốn',
    description: 'Cần bán bao nhiêu sản phẩm để bù hết chi phí cố định.',
    category: 'Kinh doanh',
    image: '',
    iframeSrc: `${OMNI}/finance/break-even`,
  },
  {
    key: 'tinh-chiet-khau',
    title: 'Tính chiết khấu',
    description: 'Giá sau khi giảm, và số tiền thực sự tiết kiệm được.',
    category: 'Bán hàng',
    image: '',
    iframeSrc: `${OMNI}/finance/discount`,
  },
  {
    key: 'tinh-thue-gtgt',
    title: 'Tính thuế giá trị gia tăng',
    description: 'Tách phần thuế khỏi giá bán, hoặc cộng thuế vào giá gốc.',
    category: 'Thuế',
    image: '',
    iframeSrc: `${OMNI}/finance/vat`,
  },
  {
    key: 'tinh-hoa-hong',
    title: 'Tính hoa hồng',
    description: 'Hoa hồng cho cộng tác viên hoặc phí sàn theo phần trăm doanh thu.',
    category: 'Bán hàng',
    image: '',
    iframeSrc: `${OMNI}/finance/commission`,
  },
  {
    key: 'tinh-hieu-qua-dau-tu',
    title: 'Tính hiệu quả đầu tư',
    description: 'Đo ROI của một khoản chi — ví dụ ngân sách chạy quảng cáo.',
    category: 'Marketing',
    image: '',
    iframeSrc: `${OMNI}/finance/roi`,
  },
  {
    key: 'tinh-phan-tram',
    title: 'Tính phần trăm',
    description: 'Phép tính phần trăm hằng ngày: tăng, giảm, và tỉ lệ giữa hai số.',
    category: 'Tiện ích',
    image: '',
    iframeSrc: `${OMNI}/math/percentage`,
  },
];

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
