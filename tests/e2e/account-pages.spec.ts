import { expect, type Page, test } from '@playwright/test';
import { BASE_URL } from '../../playwright.config';
import {
  attachSession,
  closeSessionFixtureDb,
  createLoggedInSession,
} from './support/session-fixture';

/**
 * Khu `/account` — 5 trang theo mockup của chủ dự án.
 *
 * BA THỨ BỘ TEST NÀY GIỮ, theo đúng thứ tự quan trọng:
 *
 * 1. **Điều khiển đánh dấu "chưa hoạt động" phải THẬT SỰ `disabled`.** Đây là chốt chặn
 *    chính. Một công tắc bật/tắt được nhưng không lưu là kiểu hỏng tệ nhất: người dùng tin
 *    là đã đổi, tải lại thì mất, và không có lỗi nào để lần ra. Nếu ai đó gỡ `disabled` để
 *    "cho đẹp", test này phải đỏ.
 *
 * 2. **Không tràn ngang ở cả ba viewport.** Lỗi vừa phải vá ở `/admin` hôm 2026-07-31 (ba
 *    tầng CSS lồng nhau) — khu này cũng có bảng và sidebar nên áp cùng phép đo từ đầu.
 *
 * 3. **Khung chung có mặt ở mọi trang.** Layout mới là thứ dễ vỡ khi thêm trang thứ sáu.
 */

/** Cả TRANG không được cuộn ngang. `+ 1` cho sai số subpixel — cùng ngưỡng `admin-tables.spec.ts`. */
async function expectNoPageOverflow(page: Page): Promise<void> {
  const measured = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    measured.scrollWidth,
    `tràn ngang: scrollWidth ${measured.scrollWidth} > clientWidth ${measured.clientWidth}`,
  ).toBeLessThanOrEqual(measured.clientWidth + 1);
}

const PAGES = [
  { path: '/vi/account', heading: 'Tài khoản' },
  { path: '/vi/account/saved-tools', heading: 'Công cụ đã lưu' },
  { path: '/vi/account/notifications', heading: 'Thông báo' },
  { path: '/vi/account/security', heading: 'Bảo mật' },
  { path: '/vi/account/help', heading: 'Trung tâm trợ giúp' },
] as const;

test.describe('/account — 5 trang', () => {
  test.afterAll(async () => {
    await closeSessionFixtureDb();
  });

  for (const target of PAGES) {
    test(`${target.path} — mở được, có khung chung, không tràn ngang`, async ({ browser }) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const session = await createLoggedInSession(crypto.randomUUID());
      await attachSession(context, session, BASE_URL);

      const page = await context.newPage();
      await page.goto(target.path);

      await expect(page.getByRole('heading', { name: target.heading, level: 1 })).toBeVisible();

      // Khung chung: điều hướng tài khoản + breadcrumb phải có ở MỌI trang.
      await expect(page.getByRole('navigation', { name: 'Điều hướng tài khoản' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Đường dẫn phân cấp' })).toBeVisible();

      await expectNoPageOverflow(page);

      await context.close();
    });
  }

  test('mục đang mở được đánh dấu bằng aria-current, không chỉ bằng màu', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const session = await createLoggedInSession(crypto.randomUUID());
    await attachSession(context, session, BASE_URL);

    const page = await context.newPage();
    await page.goto('/vi/account/notifications');

    const nav = page.getByRole('navigation', { name: 'Điều hướng tài khoản' });
    // Đúng MỘT mục được đánh dấu — nhiều hơn nghĩa là phép so khớp đang dùng `startsWith`.
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('[aria-current="page"]')).toHaveText('Thông báo');

    await context.close();
  });

  test('MỌI điều khiển của Notifications đều disabled — không có công tắc giả', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const session = await createLoggedInSession(crypto.randomUUID());
    await attachSession(context, session, BASE_URL);

    const page = await context.newPage();
    await page.goto('/vi/account/notifications');
    await expect(page.getByRole('heading', { name: 'Thông báo', level: 1 })).toBeVisible();

    const switches = page.locator('input[type="checkbox"]');
    const count = await switches.count();
    expect(count, 'phải có công tắc để kiểm — 0 nghĩa là bài test không đo gì cả').toBeGreaterThan(
      0,
    );

    for (let i = 0; i < count; i += 1) {
      await expect(switches.nth(i)).toBeDisabled();
    }

    await context.close();
  });

  test('Security: nút đổi mật khẩu disabled, nhưng hiện/ẩn và kiểm khớp vẫn chạy', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const session = await createLoggedInSession(crypto.randomUUID());
    await attachSession(context, session, BASE_URL);

    const page = await context.newPage();
    await page.goto('/vi/account/security');

    await expect(page.getByRole('button', { name: 'Đổi mật khẩu' })).toBeDisabled();

    // Phần chạy được thì phải chạy thật — nếu không, "chưa nối" biến thành "trang chết".
    const newPassword = page.getByLabel('Mật khẩu mới', { exact: true });
    await newPassword.fill('mat-khau-du-dai');
    await page.getByLabel('Xác nhận mật khẩu mới').fill('khong-khop');
    // Khẳng định theo ĐÚNG câu chữ chứ không theo `role="alert"`: trang có nhiều vùng
    // `alert` (quá ngắn, không khớp), và một selector khớp nhiều phần tử là selector chưa
    // nói rõ nó đang kiểm cái gì.
    await expect(page.getByText('Hai mật khẩu mới không khớp.')).toBeVisible();

    await context.close();
  });

  test('Help Center: accordion mở được KHI TẮT JavaScript', async ({ browser }) => {
    // `<details>/<summary>` là lý do trang này chọn HTML thuần thay vì accordion tự viết.
    // Tắt JS là cách duy nhất chứng minh điều đó, thay vì tin vào lời khai trong comment.
    const context = await browser.newContext({ baseURL: BASE_URL, javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/vi/account/help');

    const answer = page.getByText('Bấm biểu tượng dấu trang trên thẻ của công cụ.', {
      exact: false,
    });
    await expect(answer).toBeHidden();

    await page.getByText('Làm sao để lưu một công cụ?').click();
    await expect(answer).toBeVisible();

    await context.close();
  });
});
