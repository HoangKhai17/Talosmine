import { expect, test } from '@playwright/test';
import { BASE_URL } from '../../playwright.config';
import {
  attachSession,
  closeSessionFixtureDb,
  createAdminSession,
  createLoggedInSession,
} from './support/session-fixture';

/**
 * Phần còn lại của B2 (`pending-work.md`): `authenticated.spec.ts` chỉ mở khoá cơ chế fixture
 * qua 5 case đại diện (`/account`, `/admin`, `/admin/audit`) — file này phủ NỐT ba trang còn
 * lại theo §17: `/account/sessions`, `/admin/roles`, `/admin/catalog`, mỗi trang gồm cả
 * accessibility (bàn phím) và responsive (không tràn ngang), dùng lại đúng
 * `tests/e2e/support/session-fixture.ts`.
 *
 * Pattern responsive/bàn phím giống hệt `web-shell.spec.ts`, chỉ khác: các trang ở đây cần
 * một phiên đăng nhập trước khi `page.goto` nên không dùng chung `PUBLIC_PAGES`.
 */

test.describe('B2 — /account/sessions, /admin/roles, /admin/catalog', () => {
  test.afterAll(async () => {
    await closeSessionFixtureDb();
  });

  test.describe('/account/sessions — chỉ cần đăng nhập, không cần quyền admin', () => {
    test('hiện đúng phiên hiện tại, đánh dấu "Thiết bị này"', async ({ browser }) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const session = await createLoggedInSession(crypto.randomUUID());
      await attachSession(context, session, BASE_URL);

      const page = await context.newPage();
      await page.goto('/vi/account/sessions');

      await expect(page.getByRole('heading', { name: 'Phiên đăng nhập', level: 1 })).toBeVisible();
      // Request gọi `/me/account/sessions` CHÍNH LÀ phiên vừa gắn cookie — nó phải tự xuất
      // hiện trong bảng, đánh dấu "Thiết bị này" thay vì có nút thu hồi. `exact: true` để
      // không khớp nhầm câu mô tả "Bao gồm cả thiết bị này…" ở nút "đăng xuất mọi nơi".
      await expect(page.getByText('Thiết bị này', { exact: true })).toBeVisible();

      await context.close();
    });

    test('không tràn ngang', async ({ browser }) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const session = await createLoggedInSession(crypto.randomUUID());
      await attachSession(context, session, BASE_URL);

      const page = await context.newPage();
      await page.goto('/vi/account/sessions');
      await expect(page.getByRole('heading', { name: 'Phiên đăng nhập', level: 1 })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow).toBe(false);

      await context.close();
    });

    test('focus nhìn thấy được khi tab', async ({ browser }) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const session = await createLoggedInSession(crypto.randomUUID());
      await attachSession(context, session, BASE_URL);

      const page = await context.newPage();
      await page.goto('/vi/account/sessions');
      await expect(page.getByRole('heading', { name: 'Phiên đăng nhập', level: 1 })).toBeVisible();

      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
      });

      // Khác `web-shell.spec.ts`: trang này CHẮC CHẮN có nội dung tương tác (điều hướng +
      // nút thu hồi), nên không nới lỏng cho trường hợp `focused === null`.
      expect(focused).not.toBeNull();
      const visible =
        (focused?.outline !== 'none' && focused?.width !== '0px') || focused?.shadow !== 'none';
      expect(visible).toBe(true);

      await context.close();
    });
  });

  test.describe('/admin/roles — cần `admin_role:manage`', () => {
    test('hiện vai trò và assignment vừa tạo bằng fixture', async ({ browser }) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const subject = crypto.randomUUID();
      const session = await createAdminSession(subject, ['admin_role:manage']);
      await attachSession(context, session, BASE_URL);

      const page = await context.newPage();
      const response = await page.goto('/admin/roles');

      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole('heading', { name: 'Vai trò & phân quyền', level: 1 }),
      ).toBeVisible();
      // `createAdminSession` tự tạo một role tên `e2e-${subject}` và gán cho chính account
      // đó — role này phải tự xuất hiện trong bảng "Vai trò", không cần setup gì thêm. Tên
      // role còn lặp lại ở option của select "Cấp vai trò" và ở bảng "Đã cấp" — chỉ cần khớp
      // MỘT trong số đó là đủ chứng minh dữ liệu đã tới nơi, không cần phân biệt bảng nào.
      await expect(page.getByText(`e2e-${subject}`).first()).toBeVisible();

      await context.close();
    });

    test('không tràn ngang', async ({ browser }) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const session = await createAdminSession(crypto.randomUUID(), ['admin_role:manage']);
      await attachSession(context, session, BASE_URL);

      const page = await context.newPage();
      await page.goto('/admin/roles');
      await expect(
        page.getByRole('heading', { name: 'Vai trò & phân quyền', level: 1 }),
      ).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow).toBe(false);

      await context.close();
    });

    test('focus nhìn thấy được khi tab', async ({ browser }) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const session = await createAdminSession(crypto.randomUUID(), ['admin_role:manage']);
      await attachSession(context, session, BASE_URL);

      const page = await context.newPage();
      await page.goto('/admin/roles');
      await expect(
        page.getByRole('heading', { name: 'Vai trò & phân quyền', level: 1 }),
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

  test.describe('/admin/catalog — cần `catalog:read`', () => {
    test('trạng thái RỖNG hiện đúng thông báo (A4: CATALOG_ALLOWED_HOSTS chưa có nội dung)', async ({
      browser,
    }) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const session = await createAdminSession(crypto.randomUUID(), ['catalog:read']);
      await attachSession(context, session, BASE_URL);

      const page = await context.newPage();
      const response = await page.goto('/admin/catalog');

      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole('heading', { name: 'Danh mục ứng dụng', level: 1 }),
      ).toBeVisible();
      // KHÔNG giả định có dữ liệu: A4 (pending-work.md) ghi rõ `CATALOG_ALLOWED_HOSTS` đang
      // rỗng nên chưa tạo được ứng dụng nào — đây là hành vi ĐÚNG theo thiết kế, không phải
      // lỗi cần né tránh trong test.
      await expect(
        page.getByText('Chưa có ứng dụng nào. Danh sách ứng dụng của Hub còn chờ chủ dự án chốt.'),
      ).toBeVisible();

      await context.close();
    });

    test('không tràn ngang', async ({ browser }) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const session = await createAdminSession(crypto.randomUUID(), ['catalog:read']);
      await attachSession(context, session, BASE_URL);

      const page = await context.newPage();
      await page.goto('/admin/catalog');
      await expect(
        page.getByRole('heading', { name: 'Danh mục ứng dụng', level: 1 }),
      ).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow).toBe(false);

      await context.close();
    });

    test('focus nhìn thấy được khi tab', async ({ browser }) => {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const session = await createAdminSession(crypto.randomUUID(), ['catalog:read']);
      await attachSession(context, session, BASE_URL);

      const page = await context.newPage();
      await page.goto('/admin/catalog');
      await expect(
        page.getByRole('heading', { name: 'Danh mục ứng dụng', level: 1 }),
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
});
