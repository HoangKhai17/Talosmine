import { expect, test } from '@playwright/test';

/**
 * Khung nhúng Omni Calculator — kiểm rằng công cụ THẬT SỰ HIỆN RA.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * VÌ SAO TEST NÀY TỒN TẠI
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Đây là lớp lỗi im lặng nhất đã gặp trong dự án. Khi khung hỏng thì MỌI dấu hiệu đều báo
 * "ổn": máy chủ trả 200, không có `x-frame-options`, không có `frame-ancestors`, script của
 * họ tải về đủ, console sạch trơn — mà khung vẫn trắng hoàn toàn. Không một phép kiểm nào
 * bằng `curl` phát hiện được, vì `curl` không chạy JavaScript và không bắt tay `postMessage`.
 *
 * Nội dung chỉ xuất hiện sau khi trang cha trả lời `CONFIG` cho thông điệp `LOADED` — xem
 * `apps/web/components/tools/omni-embed.tsx`. Bất kỳ thay đổi nào làm hỏng cuộc bắt tay đó
 * (đổi origin, đổi hash, gỡ listener, siết `sandbox`) đều cho lại đúng khung trắng ấy.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * TEST NÀY PHỤ THUỘC MẠNG NGOÀI — CÓ CHỦ ĐÍCH
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Nó gọi thẳng `omnicalculator.com`. Đó là điểm yếu thật: Omni sập hoặc đổi giao thức thì
 * test đỏ dù mã của ta không đổi. Vẫn giữ, vì đó CHÍNH LÀ thông tin cần biết — công cụ trên
 * trang lúc ấy cũng đang hỏng với người dùng thật.
 *
 * Vì vậy timeout đặt rộng và chỉ kiểm HAI công cụ, không phải cả mười lăm: đủ để bắt lỗi giao
 * thức (thứ hỏng thì hỏng toàn bộ), không đủ lâu để thành gánh nặng cho mỗi lần chạy.
 */

/** Rộng tay: iframe phải tải bundle của bên thứ ba rồi mới bắt tay xong. */
const RENDER_TIMEOUT_MS = 30_000;

/**
 * Hai công cụ, chọn ở hai đầu quang phổ: một cái ngắn và một cái dài.
 *
 * `tinh-gio-cong` cao hơn 1000px nên nó cũng kiểm luôn `CHANGE_HEIGHT` — khung không tự cao
 * lên thì nội dung bị cắt, một kiểu hỏng khác cũng lặng lẽ y như khung trắng.
 */
const CASES = [
  { key: 'tinh-chiet-khau', mustContain: 'Original price' },
  { key: 'tinh-gio-cong', mustContain: 'Monday' },
];

for (const { key, mustContain } of CASES) {
  test(`công cụ ${key} render được nội dung thật trong iframe`, async ({ page }) => {
    test.setTimeout(RENDER_TIMEOUT_MS * 2);

    await page.goto(`/vi/tools/${key}`);

    /**
     * KIỂM NỘI DUNG BÊN TRONG IFRAME, không phải sự tồn tại của thẻ `<iframe>`.
     *
     * Thẻ `<iframe>` luôn có mặt kể cả khi hỏng — đó đúng là lý do lỗi này lọt lưới bấy lâu.
     * Chỉ có văn bản do ứng dụng của họ vẽ ra mới chứng minh cuộc bắt tay đã thành công.
     */
    const body = page.frameLocator('iframe').locator('body');
    await expect(body).toContainText(mustContain, { timeout: RENDER_TIMEOUT_MS });

    // Chiều cao do iframe tự báo về. Còn nguyên giá trị khởi tạo nghĩa là `CHANGE_HEIGHT`
    // không tới nơi, và nội dung dài sẽ bị cắt mất phần dưới.
    const height = await page
      .locator('iframe')
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeGreaterThan(200);
  });
}

test('khung công cụ thẳng hàng với tiêu đề và không tràn ngang', async ({ page }) => {
  await page.goto('/vi/tools/tinh-chiet-khau');
  await expect(page.frameLocator('iframe').locator('body')).toContainText('Original price', {
    timeout: RENDER_TIMEOUT_MS,
  });

  const measure = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { left: box.left, width: box.width };
      });

  const heading = await measure('h1');
  const frame = await measure('iframe');

  /**
   * Cạnh trái phải trùng nhau. Sai số 2px để chừa cho đường viền 1px của khung và phép làm
   * tròn subpixel của trình duyệt.
   *
   * Con số này khoá hai hằng `max-width: 46rem` ở `page.module.css` và `omni-embed.module.css`
   * lại với nhau — sửa một bên mà quên bên kia là test đỏ ngay, thay vì lệch âm thầm.
   */
  expect(Math.abs(heading.left - frame.left)).toBeLessThan(2);
  expect(Math.abs(heading.width - frame.width)).toBeLessThan(4);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});
