import { expect, test } from '@playwright/test';
import { BASE_URL } from '../../playwright.config';
import {
  attachSession,
  closeSessionFixtureDb,
  createAdminSession,
  createLoggedInSession,
} from './support/session-fixture';

/**
 * Màn hình cần đăng nhập thật — B2 của pending-work.md.
 *
 * TRƯỚC ĐÂY KHÔNG THỂ TEST: không có cách dựng phiên hợp lệ trong Playwright mà không đi
 * qua OIDC thật (Google/Logto chặn automation). `session-fixture.ts` giải quyết việc đó
 * bằng cách ghi thẳng một phiên THẬT vào `web_sessions` — xem giải thích đầy đủ ở đó.
 *
 * MỞ KHOÁ, KHÔNG PHỦ HẾT: file này chứng minh cơ chế fixture chạy đúng qua năm case đại
 * diện (đăng nhập thường, chưa đăng nhập, quyền admin chung, quyền một trang cụ thể, đăng
 * nhập nhưng không có quyền admin nào). Phủ accessibility/responsive đầy đủ cho TỪNG trang
 * quản trị (§17) là việc tiếp theo, dùng lại đúng fixture này.
 *
 * YÊU CẦU CHẠY: Docker (`talosmine-db`, `talosmine-pooler`) đã bật VÀ Control Plane đang
 * chạy, tới được từ `apps/web/.env.local` (`CONTROL_PLANE_BASE_URL`). Đây là điều kiện có
 * chủ đích, không phải thiếu sót: `webServer` của Playwright chỉ tự quản lý tiến trình
 * `next start`, còn Control Plane + database là hạ tầng chia sẻ mà `scripts/dev.ps1` đã coi
 * là tiền đề — file này giữ đúng quy ước đó thay vì dựng thêm một cơ chế khác.
 */

test.describe('Phiên đăng nhập thật (fixture ghi thẳng DB)', () => {
  test.afterAll(async () => {
    await closeSessionFixtureDb();
  });

  test('người dùng đã đăng nhập thấy đúng dữ liệu tài khoản của mình', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const session = await createLoggedInSession(crypto.randomUUID());
    await attachSession(context, session, BASE_URL);

    const page = await context.newPage();
    await page.goto('/vi/account');

    await expect(page.getByRole('heading', { name: 'Tài khoản', level: 1 })).toBeVisible();
    // Account mới tạo mặc định `active` (DEC-B04a) — chứng minh dữ liệu THẬT được đọc qua
    // BFF, không phải một trang tĩnh tình cờ hiện đúng tiêu đề.
    await expect(page.getByText('Đang hoạt động')).toBeVisible();

    await context.close();
  });

  test('CHƯA đăng nhập → /account tự đưa về trang đăng nhập, không lộ khung dữ liệu', async ({
    page,
  }) => {
    await page.goto('/vi/account');

    /*
     * `account-view.tsx`: 401 từ BFF → `window.location.href = signInHref`
     * (`/auth?returnTo=...`) → `/auth/page.tsx` (KHÔNG có `error`) redirect thẳng sang
     * `/auth/login` → dựng URL OIDC rồi redirect tiếp sang Logto. Cả chuỗi là NHIỀU redirect
     * HTTP nối liền — trình duyệt gộp chúng thành một lần điều hướng, nên URL trung gian
     * `/auth?returnTo=...` không bao giờ "đứng yên" đủ để `waitForURL` khớp một mẫu cụ thể.
     * Kiểm ĐÍCH thay vì kiểm CHẶNG: chỉ cần rời khỏi `/account` — đủ để chứng minh không có
     * dữ liệu tài khoản nào lộ ra cho người chưa đăng nhập.
     */
    await page.waitForURL((url) => !url.pathname.includes('/account'), { timeout: 15_000 });
    expect(page.url()).not.toContain('/account');
  });

  test('có `account:read` → /admin (Tài khoản) trả 200, không phải 404', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const session = await createAdminSession(crypto.randomUUID(), ['account:read']);
    await attachSession(context, session, BASE_URL);

    const page = await context.newPage();
    const response = await page.goto('/admin');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Tài khoản', level: 1 })).toBeVisible();

    await context.close();
  });

  test('có `audit:read` → /admin/audit trả 200 — quyền RIÊNG cho TỪNG trang, không chỉ vào được /admin', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const session = await createAdminSession(crypto.randomUUID(), ['audit:read']);
    await attachSession(context, session, BASE_URL);

    const page = await context.newPage();
    const response = await page.goto('/admin/audit');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Nhật ký kiểm toán', level: 1 })).toBeVisible();

    await context.close();
  });

  test('đã đăng nhập nhưng KHÔNG có permission quản trị nào → /admin bị chặn (403)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const session = await createLoggedInSession(crypto.randomUUID());
    await attachSession(context, session, BASE_URL);

    const page = await context.newPage();
    const response = await page.goto('/admin');

    /*
     * Chặn NGAY TẠI SERVER, không phải client redirect. Cụ thể là 403 chứ không phải 404:
     * `proxy.ts` (lớp chặn admin thứ nhất) phân biệt "chưa đăng nhập" (redirect về trang chủ
     * — để `/admin` không phân biệt được với URL không tồn tại đối với khách vãng lai) và
     * "đã đăng nhập nhưng không có quyền" (403 tường minh, vì phiên đã xác thực nên không
     * còn lý do che giấu sự tồn tại của khu quản trị nữa). 404 chỉ xuất hiện ở lớp phòng thủ
     * thứ hai (`app/admin/layout.tsx` gọi `notFound()`) nếu lớp thứ nhất bị bỏ qua.
     */
    expect(response?.status()).toBe(403);

    await context.close();
  });
});
