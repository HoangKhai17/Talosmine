import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { vi as messages } from '../../apps/web/i18n/messages/vi';
import { BASE_URL } from '../../playwright.config';
import {
  attachSession,
  closeSessionFixtureDb,
  createLoggedInSession,
} from './support/session-fixture';

async function openOnboarding(
  browser: Browser,
  returnTo: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const session = await createLoggedInSession(crypto.randomUUID());
  await attachSession(context, session, BASE_URL);

  const page = await context.newPage();
  await page.goto(`/vi/onboarding?returnTo=${encodeURIComponent(returnTo)}`);
  // Đọc tiêu đề TỪ CHÍNH CATALOG i18n thay vì viết cứng chuỗi.
  //
  // Bài test này từng đỏ khi thương hiệu đổi tên (Talosmine → KOLO): chuỗi trong test là bản
  // sao của một giá trị sống ở nơi khác, nên nó lỗi thời ngay lần đổi chữ đầu tiên. Đọc từ
  // nguồn thì đổi tên bao nhiêu lần cũng không phải sửa test — mà vẫn bắt được đúng cái đáng
  // bắt: tiêu đề h1 có render ra hay không.
  await expect(
    page.getByRole('heading', { name: messages.onboarding.title, level: 1 }),
  ).toBeVisible();
  return { context, page };
}

async function satisfyCurrentQuestion(page: Page): Promise<void> {
  const fieldset = page.locator('fieldset');
  const forward = page.getByRole('button', {
    name: new RegExp(`${messages.onboarding.next}|${messages.onboarding.complete}`),
  });
  const choices = fieldset.locator('label:has(input[type="radio"], input[type="checkbox"])');

  // BẤM VÀO `<label>`, KHÔNG PHẢI `.check()` LÊN `<input>`.
  //
  // Input ở đây là `.visuallyHidden` (1×1px, absolute) nằm trong label — cố ý, để bàn phím
  // vẫn tới được nó. `check()` của Playwright bấm vào TOẠ ĐỘ của input, và bị chính label
  // phủ lên: "<label …> intercepts pointer events". Người dùng thật bấm label, nên test cũng
  // phải bấm label — đo đúng thứ người ta làm.
  for (let index = 0; index < (await choices.count()) && (await forward.isDisabled()); index += 1) {
    await choices.nth(index).click();
  }
  await expect(forward).toBeEnabled();
}

test.describe('/onboarding — survey wizard', () => {
  test.afterAll(async () => {
    await closeSessionFixtureDb();
  });

  test('giữ lựa chọn và focus khi đi tới/lùi', async ({ browser }) => {
    const { context, page } = await openOnboarding(browser, '/vi/contact');

    await expect(page.locator('fieldset')).toHaveCount(1);
    const progress = page.getByRole('progressbar');
    await expect(progress).toHaveAttribute('value', '1');
    const total = Number(await progress.getAttribute('max'));
    expect(total).toBeGreaterThan(1);

    const firstChoice = page
      .locator('fieldset input[type="radio"], fieldset input[type="checkbox"]')
      .first();
    const firstValue = await firstChoice.getAttribute('value');
    expect(firstValue).not.toBeNull();
    await satisfyCurrentQuestion(page);

    await page.getByRole('button', { name: 'Tiếp theo' }).click();
    await expect(progress).toHaveAttribute('value', '2');
    await expect(page.locator('fieldset')).toHaveCount(1);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('legend') !== null))
      .toBe(true);

    await page.getByRole('button', { name: 'Quay lại' }).click();
    await expect(progress).toHaveAttribute('value', '1');
    await expect(page.locator(`fieldset input[value="${firstValue}"]`)).toBeChecked();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('legend') !== null))
      .toBe(true);

    await context.close();
  });

  test('chặn bước chưa hợp lệ và hoàn tất gửi đủ đáp án rồi về returnTo nội bộ', async ({
    browser,
  }) => {
    const { context, page } = await openOnboarding(browser, '/vi/contact');
    const progress = page.getByRole('progressbar');
    const total = Number(await progress.getAttribute('max'));
    const next = page.getByRole('button', { name: 'Tiếp theo' });
    await expect(next).toBeDisabled();

    let submittedBody: unknown;
    await page.route('**/api/bff/me/onboarding', async (route) => {
      submittedBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    for (let step = 1; step <= total; step += 1) {
      await satisfyCurrentQuestion(page);
      await page
        .getByRole('button', { name: step === total ? 'Hoàn tất thiết lập' : 'Tiếp theo' })
        .click();
    }

    await page.waitForURL('**/vi/contact');
    expect(submittedBody).toMatchObject({ status: 'completed', locale: 'vi' });
    const answers = (submittedBody as { answers: Array<{ optionKeys: string[] }> }).answers;
    expect(answers).toHaveLength(total);
    expect(answers.every((answer) => answer.optionKeys.length > 0)).toBe(true);

    await context.close();
  });

  test('bỏ qua luôn khả dụng và không chuyển hướng tới origin bên ngoài', async ({ browser }) => {
    const { context, page } = await openOnboarding(browser, 'https://evil.example/steal');

    await page.route('**/api/bff/me/onboarding', async (route) => {
      expect(route.request().postDataJSON()).toEqual({ status: 'skipped', locale: 'vi' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    const skip = page.getByRole('button', { name: 'Bỏ qua bước này' });
    await expect(skip).toBeEnabled();
    await skip.click();

    await page.waitForURL((url) => url.pathname !== '/vi/onboarding');
    expect(new URL(page.url()).origin).toBe(BASE_URL);

    await context.close();
  });
});
