import { expect, type Page, test } from '@playwright/test';
import { BASE_URL } from '../../playwright.config';
import {
  attachSession,
  closeSessionFixtureDb,
  createAdminSession,
  createAuditEvent,
} from './support/session-fixture';

/**
 * Phần CÒN DƯ của B2 (`pending-work.md`): ba trang quản trị cuối cùng dùng cùng một pattern
 * `.tableWrap` mà `admin/roles` và `admin/catalog` đã phải vá hôm 2026-07-30 —
 * `/admin` (tra cứu tài khoản), `/admin/audit`, `/admin/accounts/[accountId]`.
 *
 * Ghi chú cũ ở B2 nói thẳng lý do chưa vá: "RẤT có thể có cùng lỗ hổng tiềm ẩn… nhưng chưa
 * test mobile cho ba trang đó nên không tự vá mà không kiểm chứng trước." File này chính là
 * bước kiểm chứng đó — ĐO trước, sửa sau, không sửa mò.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ĐIỂM KHÁC BIỆT SO VỚI `admin-pages.spec.ts`, và vì sao nó quan trọng
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Cả ba trang ở đây chỉ render `.tableWrap` KHI CÓ DỮ LIỆU — `/admin` phải tìm ra kết quả,
 * `/admin/audit` phải có sự kiện, trang chi tiết phải có phiên. Một bài test chỉ `goto` rồi
 * đo `scrollWidth` sẽ XANH trên trạng thái rỗng mà không hề chạm tới cái bảng cần đo. Nên
 * mỗi test dưới đây BẮT BUỘC bảng phải hiện ra trước khi đo, và trên viewport mobile còn
 * khẳng định thêm rằng bảng THẬT SỰ rộng hơn khung chứa nó (`expectTableUnderPressure`) —
 * nếu không, phép đo "không tràn ngang" chỉ đang chứng minh một bảng nhỏ thì không tràn.
 */

/** Khớp `mobile` trong `playwright.config.ts` — nơi duy nhất bảng bị ép hẹp hơn `min-width`. */
function isMobile(): boolean {
  return test.info().project.name === 'mobile';
}

/**
 * Cả TRANG không được cuộn ngang. `+ 1` chừa cho sai số làm tròn subpixel của Chromium khi
 * viewport lẻ — cùng ngưỡng `admin-pages.spec.ts` và `grid.spec.ts` đang dùng, không phải
 * một biên độ nới riêng cho nhóm test này.
 */
async function expectNoPageOverflow(page: Page): Promise<void> {
  const measured = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    measured.scrollWidth,
    `trang tràn ngang: scrollWidth ${measured.scrollWidth} > clientWidth ${measured.clientWidth}`,
  ).toBeLessThanOrEqual(measured.clientWidth + 1);
}

/**
 * Khẳng định bảng RỘNG HƠN khung `.tableWrap` chứa nó, tức khung đang thật sự phải cuộn
 * trong lòng nó thay vì đẩy trang.
 *
 * Đây là phần làm cho `expectNoPageOverflow` có ý nghĩa: hai phép đo cùng xanh nghĩa là
 * "bảng quá rộng NHƯNG trang vẫn không tràn" — đúng hành vi mong muốn. Thiếu phép đo này,
 * một thay đổi vô tình làm bảng co lại (mất `min-width`, đổi layout) sẽ khiến test vẫn xanh
 * dù cơ chế chống tràn đã hỏng.
 *
 * Không viết cứng `.tableWrap`: tên class do CSS Modules băm ra lúc build, không đoán được
 * từ test. Khung chính là phần tử CHA của `<table>` — quan hệ này là thứ ba trang đều giữ.
 */
async function expectTableUnderPressure(page: Page): Promise<void> {
  const measured = await page.evaluate(() => {
    const table = document.querySelector('table');
    const wrap = table?.parentElement;
    if (!table || !wrap) return null;
    return { table: Math.round(table.getBoundingClientRect().width), wrap: wrap.clientWidth };
  });

  expect(measured, 'không tìm thấy <table> hoặc khung chứa nó').not.toBeNull();
  expect(
    measured?.table ?? 0,
    'bảng KHÔNG rộng hơn khung của nó — phép đo tràn ngang ở trên không chứng minh được gì',
  ).toBeGreaterThan(measured?.wrap ?? 0);
}

test.describe('B2 — ba bảng quản trị còn lại', () => {
  test.afterAll(async () => {
    await closeSessionFixtureDb();
  });

  test.describe('/admin — bảng kết quả tra cứu tài khoản', () => {
    test('bảng kết quả hiện ra và trang không tràn ngang', async ({ browser }) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const session = await createAdminSession(crypto.randomUUID(), ['account:read']);
      await attachSession(context, session, BASE_URL);

      const page = await context.newPage();
      await page.goto('/admin');
      await expect(page.getByRole('heading', { name: 'Tài khoản', level: 1 })).toBeVisible();

      // Tra chính account của fixture theo ID: `searchAccounts` nhận UUID là phép so khớp
      // CHÍNH XÁC (`accounts.id = $1::uuid`), nên kết quả đúng một dòng và không phụ thuộc
      // dữ liệu sẵn có trong database dev.
      await page
        .getByLabel('Tìm theo email, tên hiển thị hoặc ID tài khoản')
        .fill(session.accountId);
      await page.getByRole('button', { name: 'Tìm' }).click();

      await expect(page.getByRole('table')).toBeVisible();
      await expect(page.getByText('1 kết quả')).toBeVisible();

      await expectNoPageOverflow(page);
      if (isMobile()) await expectTableUnderPressure(page);

      await context.close();
    });
  });

  test.describe('/admin/audit — bảng nhật ký kiểm toán', () => {
    test('bảng sự kiện hiện ra và trang không tràn ngang', async ({ browser }) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const session = await createAdminSession(crypto.randomUUID(), ['audit:read']);
      await createAuditEvent(session.accountId);
      await attachSession(context, session, BASE_URL);

      const page = await context.newPage();
      await page.goto('/admin/audit');

      await expect(
        page.getByRole('heading', { name: 'Nhật ký kiểm toán', level: 1 }),
      ).toBeVisible();
      await expect(page.getByRole('table')).toBeVisible();

      await expectNoPageOverflow(page);
      if (isMobile()) await expectTableUnderPressure(page);

      await context.close();
    });
  });

  test.describe('/admin/accounts/[accountId] — bảng phiên đăng nhập', () => {
    test('bảng phiên hiện ra và trang không tràn ngang', async ({ browser }) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      // Hai permission RIÊNG BIỆT, đúng như controller đòi: `account:read` cho chi tiết
      // account, `session:revoke` cho danh sách phiên (`admin.controller.ts:83-87`). Thiếu
      // cái thứ hai thì trang vẫn 200 nhưng phần phiên trống — và bảng cần đo không tồn tại.
      const session = await createAdminSession(crypto.randomUUID(), [
        'account:read',
        'session:revoke',
      ]);
      await attachSession(context, session, BASE_URL);

      const page = await context.newPage();
      await page.goto(`/admin/accounts/${session.accountId}`);

      await expect(
        page.getByRole('heading', { name: 'Chi tiết tài khoản', level: 1 }),
      ).toBeVisible();
      // Chính phiên vừa gắn cookie là một phiên còn hiệu lực của account này, nên bảng chắc
      // chắn có ít nhất một dòng — không cần dựng thêm dữ liệu.
      await expect(page.getByRole('table')).toBeVisible();

      await expectNoPageOverflow(page);
      if (isMobile()) await expectTableUnderPressure(page);

      await context.close();
    });
  });
});
