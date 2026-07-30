import { expect, test } from '@playwright/test';
import { BASE_URL } from '../../playwright.config';
import {
  attachSession,
  closeSessionFixtureDb,
  createCompletedSurveyResponse,
  createLoggedInSession,
  createSkippedSurveyResponse,
} from './support/session-fixture';

/**
 * `/account/survey` — DEC-B11 câu 2 (2026-07-30): người dùng tự xem/xoá câu trả lời khảo
 * sát onboarding của chính mình. Dùng lại đúng cơ chế fixture của B2
 * (`tests/e2e/support/session-fixture.ts`), mở rộng thêm hai hàm ghi thẳng
 * `survey_responses`/`survey_answers` để dựng cả ba trạng thái (chưa trả lời, đã hoàn tất,
 * đã bỏ qua) mà không cần đi qua màn hình khảo sát thật.
 */
test.describe('/account/survey — xem/xoá câu trả lời khảo sát', () => {
  test.afterAll(async () => {
    await closeSessionFixtureDb();
  });

  test('CHƯA đăng nhập → tự đưa về trang đăng nhập, không lộ khung dữ liệu', async ({ page }) => {
    await page.goto('/vi/account/survey');
    await page.waitForURL((url) => !url.pathname.includes('/account/survey'), {
      timeout: 15_000,
    });
    expect(page.url()).not.toContain('/account/survey');
  });

  test('chưa trả lời khảo sát → hiện trạng thái rỗng, không lỗi', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const session = await createLoggedInSession(crypto.randomUUID());
    await attachSession(context, session, BASE_URL);

    const page = await context.newPage();
    await page.goto('/vi/account/survey');

    await expect(
      page.getByRole('heading', { name: 'Câu trả lời khảo sát', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Bạn chưa trả lời khảo sát này.')).toBeVisible();
    // 404 là trạng thái BÌNH THƯỜNG ở đây — không được hiện khối lỗi kèm nút "Thử lại".
    // (Không kiểm bằng `getByRole('alert')` toàn trang: Next.js tự gắn một route announcer
    // ẩn cho mọi trang, không liên quan tới khối lỗi của component này.)
    await expect(page.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);

    await context.close();
  });

  test('đã bỏ qua khảo sát → hiện đúng thông báo, xoá được', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const session = await createLoggedInSession(crypto.randomUUID());
    await createSkippedSurveyResponse(session.accountId);
    await attachSession(context, session, BASE_URL);

    const page = await context.newPage();
    page.on('dialog', (dialog) => void dialog.accept());
    await page.goto('/vi/account/survey');

    await expect(page.getByText('Bạn đã chọn bỏ qua khảo sát này.')).toBeVisible();

    await page.getByRole('button', { name: 'Xoá câu trả lời' }).click();
    await expect(page.getByText('Bạn chưa trả lời khảo sát này.')).toBeVisible();

    await context.close();
  });

  test('đã hoàn tất khảo sát → hiện đúng câu hỏi/lựa chọn đã chọn, xoá được', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const session = await createLoggedInSession(crypto.randomUUID());
    await createCompletedSurveyResponse(session.accountId);
    await attachSession(context, session, BASE_URL);

    const page = await context.newPage();
    page.on('dialog', (dialog) => void dialog.accept());
    await page.goto('/vi/account/survey');

    // Không viết cứng tên câu hỏi/lựa chọn (nội dung khảo sát sửa được ở CMS) — chỉ chứng
    // minh có ÍT NHẤT một khối câu hỏi kèm ít nhất một lựa chọn hiển thị, và không phải
    // trạng thái rỗng/bỏ qua.
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expect(page.getByText('Bạn chưa trả lời khảo sát này.')).toHaveCount(0);
    await expect(page.getByText('Bạn đã chọn bỏ qua khảo sát này.')).toHaveCount(0);

    await page.getByRole('button', { name: 'Xoá câu trả lời' }).click();
    await expect(page.getByText('Bạn chưa trả lời khảo sát này.')).toBeVisible();

    await context.close();
  });

  test('không tràn ngang', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const session = await createLoggedInSession(crypto.randomUUID());
    await createCompletedSurveyResponse(session.accountId);
    await attachSession(context, session, BASE_URL);

    const page = await context.newPage();
    await page.goto('/vi/account/survey');
    await expect(
      page.getByRole('heading', { name: 'Câu trả lời khảo sát', level: 1 }),
    ).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);

    await context.close();
  });

  test('focus nhìn thấy được khi tab', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const session = await createLoggedInSession(crypto.randomUUID());
    await createCompletedSurveyResponse(session.accountId);
    await attachSession(context, session, BASE_URL);

    const page = await context.newPage();
    await page.goto('/vi/account/survey');
    await expect(
      page.getByRole('heading', { name: 'Câu trả lời khảo sát', level: 1 }),
    ).toBeVisible();

    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
    });

    expect(focused).not.toBeNull();
    const visible =
      (focused?.outline !== 'none' && focused?.width !== '0px') || focused?.shadow !== 'none';
    expect(visible).toBe(true);

    await context.close();
  });
});
