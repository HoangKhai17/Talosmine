import { expect, test } from '@playwright/test';

/**
 * Web smoke — phase-1 mục 14.
 *
 * P1 là shell rỗng, nên các test này KHÔNG kiểm business feature (chưa có cái nào).
 * Chúng kiểm đúng những gì exit gate P1 mục 18 điều 6 yêu cầu.
 */

test.describe('(user) shell', () => {
  test('render được và có semantic landmark', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    // Landmark là nền của accessibility: screen reader dùng chúng để nhảy vùng.
    //
    // Kiểm ĐÚNG MỘT chứ không chỉ "có": `loading.tsx` cũng render `<main id="main">`, và
    // trong lúc Next streaming thì nó với trang thật có thể cùng nằm trong DOM chốc lát.
    // Trang càng dài, khoảnh khắc đó càng dễ bị bắt gặp — đây là nguồn gốc của một lần
    // test đỏ ngẫu nhiên.
    //
    // Ràng buộc này cũng đúng về mặt accessibility: một tài liệu chỉ nên có một landmark
    // `main`. Playwright tự thử lại tới khi trạng thái ổn định.
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('main')).toBeVisible();
  });

  test('không rò dữ liệu nghiệp vụ giả', async ({ page }) => {
    await page.goto('/');
    const body = (await page.textContent('body'))?.toLowerCase() ?? '';

    // P1 mục 5 cấm shell giả lập dữ liệu/quyền. Nếu một trong các từ này xuất hiện,
    // nhiều khả năng ai đó đã thêm demo data — thứ sẽ bị nhầm là tính năng thật.
    for (const forbidden of ['quota', 'subscription', 'premium', 'entitlement']) {
      expect(body).not.toContain(forbidden);
    }
  });
});

test.describe('admin bị deny tại server', () => {
  test('khách chưa đăng nhập bị đưa về trang chủ NGAY TẠI SERVER', async ({ request }) => {
    // Dùng `request` (HTTP thuần, không chạy JS) để chứng minh việc chặn xảy ra ở
    // SERVER. Nếu chỉ ẩn ở client thì request này sẽ trả 200 và test fail — đó chính
    // là điều cần bắt.
    //
    // Vì sao về `/` chứ không phải `/auth?returnTo=/admin`: đá sang trang đăng nhập là
    // xác nhận với người lạ rằng khu quản trị nằm đúng đường dẫn đó. Về trang chủ khiến
    // `/admin` không phân biệt được với một URL không tồn tại.
    //
    // Người ĐÃ đăng nhập nhưng thiếu permission nhận 403 — ca đó cần một phiên hợp lệ
    // nên được kiểm ở test integration, không phải ở đây.
    const response = await request.get('/admin', { maxRedirects: 0 });

    expect(response.status()).toBe(307);

    // `location` có kiểu `string | undefined`. Kiểm riêng thay vì ép kiểu: nếu redirect
    // thiếu header này thì đó là lỗi thật, và thông báo phải nói đúng điều đó.
    const location = response.headers().location;
    expect(location, 'redirect phải có header Location').toBeDefined();
    expect(new URL(location as string, 'http://localhost').pathname).toBe('/');
  });

  test('/admin không trả nội dung admin nào', async ({ request }) => {
    const response = await request.get('/admin', { maxRedirects: 0 });
    const body = (await response.text()).toLowerCase();

    // Trang deny không được lộ cấu trúc admin cho người chưa có quyền.
    expect(body).not.toContain('quản trị');
    expect(body).not.toContain('<nav');
  });
});

test.describe('CSP (DEC-T12)', () => {
  test('header có đủ directive baseline', async ({ request }) => {
    const response = await request.get('/');
    const csp = response.headers()['content-security-policy'] ?? '';

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  test('KHÔNG có wildcard hay unsafe-inline cho script ở production build', async ({ request }) => {
    const response = await request.get('/');
    const csp = response.headers()['content-security-policy'] ?? '';

    // DEC-T12 cấm nới CSP "cho tiện dev". `script-src` có nonce là thắt chặt,
    // nhưng 'unsafe-inline'/'unsafe-eval'/* thì không được lọt vào production.
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain('*');
  });

  test('có header an toàn cơ bản', async ({ request }) => {
    const response = await request.get('/');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  });
});

test.describe('responsive và bàn phím', () => {
  test('không tràn ngang ở viewport hiện tại', async ({ page }) => {
    await page.goto('/');

    // Tràn ngang là lỗi responsive kinh điển và nó im lặng: trang vẫn "chạy",
    // chỉ là người dùng mobile phải cuộn ngang. Test chạy ở cả 3 project viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test('focus nhìn thấy được khi tab', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');

    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
    });

    // Nếu không có element nào focus được thì shell chưa có nội dung tương tác —
    // chấp nhận ở P1. Nhưng nếu CÓ, focus bắt buộc phải nhìn thấy.
    if (focused !== null) {
      const visible =
        (focused.outline !== 'none' && focused.width !== '0px') || focused.shadow !== 'none';
      expect(visible).toBe(true);
    }
  });
});

test.describe('not-found', () => {
  test('route không tồn tại trả 404', async ({ request }) => {
    const response = await request.get('/khong-ton-tai-abcxyz', { maxRedirects: 0 });
    expect(response.status()).toBe(404);
  });
});
