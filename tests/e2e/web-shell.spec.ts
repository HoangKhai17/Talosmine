import { expect, test } from '@playwright/test';

/**
 * Web smoke — phase-1 mục 14.
 *
 * P1 là shell rỗng, nên các test này KHÔNG kiểm business feature (chưa có cái nào).
 * Chúng kiểm đúng những gì exit gate P1 mục 18 điều 6 yêu cầu.
 */

/**
 * Mọi trang công khai. Hai phép kiểm chạy trên TỪNG trang: vi phạm CSP và tràn ngang đều là
 * lỗi cục bộ của một trang, nên trang chủ sạch không chứng minh gì cho trang mới.
 *
 * THÊM TRANG MỚI THÌ THÊM VÀO ĐÂY. Đây là cách rẻ nhất để một trang vừa dựng không lặng lẽ
 * bỏ qua hai lớp bảo vệ này.
 */
/** Ngôn ngữ hỗ trợ — khớp `LOCALES` ở `apps/web/i18n/locale.ts` (DEC-B15). */
const LOCALES = ['vi', 'en'] as const;

/** Trang thuộc nhánh `(user)`: có prefix locale, phải kiểm ở CẢ HAI ngôn ngữ. */
const LOCALIZED_PAGES = ['/', '/tools', '/blog', '/blog/bai-viet-mau'] as const;

/**
 * Trang NGOÀI vùng locale (DEC-T25). `/auth` một ngôn ngữ; gắn prefix vào chúng sẽ ra 404.
 */
const UNLOCALIZED_PAGES = ['/auth', '/auth/sign-up', '/auth/check-email'] as const;

const PUBLIC_PAGES = [
  ...LOCALES.flatMap((locale) =>
    LOCALIZED_PAGES.map((path) => (path === '/' ? `/${locale}` : `/${locale}${path}`)),
  ),
  ...UNLOCALIZED_PAGES,
  // Đường dẫn KHÔNG tồn tại — trang 404 cũng là một trang, và nó từng là trang tĩnh duy
  // nhất còn lại nên dính đúng lỗi nonce/CSP mà cả bộ test này sinh ra để bắt.
  '/vi/khong-ton-tai-abc',
] as const;

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

/**
 * Header — nút ba gạch ở mobile.
 *
 * Ba bài dưới đây khoá đúng ba thứ dễ hỏng khi ai đó sửa CSS header: nút phải BIẾN MẤT ở
 * desktop, menu phải KHÔNG nằm trong luồng Tab khi đang đóng, và `aria-expanded` phải nói
 * đúng trạng thái.
 */
test.describe('header responsive', () => {
  const toggle = (page: import('@playwright/test').Page) =>
    page.getByRole('button', { name: /mở menu|open menu|đóng menu|close menu/i });

  test('nút ba gạch chỉ hiện ở mobile', async ({ page }, testInfo) => {
    await page.goto('/vi');

    if (testInfo.project.name === 'mobile') {
      await expect(toggle(page)).toBeVisible();
    } else {
      await expect(toggle(page)).toBeHidden();
    }
  });

  test('menu đóng thì KHÔNG nằm trong luồng Tab', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'chỉ mobile mới có trạng thái đóng');
    await page.goto('/vi');

    // `display: none` chứ không phải ẩn bằng màu/độ mờ: link ẩn mà vẫn Tab tới được là bẫy
    // kinh điển cho người dùng bàn phím — họ focus vào thứ không nhìn thấy.
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeHidden();
  });

  test('bấm nút thì menu hiện ra và aria-expanded đổi theo', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'chỉ mobile mới có nút');
    await page.goto('/vi');

    const button = toggle(page);
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();

    // Esc là đường thoát chuẩn của mọi lớp phủ.
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});

/**
 * Khảo sát onboarding.
 *
 * KHÔNG tự động hoá được chặng "đăng ký thật rồi bị chuyển sang khảo sát" — nó cần đăng nhập
 * qua Logto, thứ chặn automation (xem pending-work A9). Bù lại, bài dưới đây khoá tính chất
 * QUAN TRỌNG NHẤT của màn hình này: **không ai bị kẹt ở đó.**
 *
 * Khách vãng lai không có phiên → `readOnboarding` trả `required: false` → chuyển về trang
 * chủ. Cùng đường đi với người đã trả lời, đã bỏ qua, và với trường hợp Control Plane không
 * phản hồi (fail-open có chủ đích).
 */
test.describe('onboarding', () => {
  for (const locale of LOCALES) {
    test(`/${locale}/onboarding chuyển về trang chủ khi không có phiên`, async ({ page }) => {
      await page.goto(`/${locale}/onboarding`);
      await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    });
  }
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

  // Chạy trên MỌI trang công khai, không chỉ trang chủ: vi phạm CSP là lỗi của TỪNG trang,
  // nên trang chủ sạch không nói gì về trang mới thêm vào.
  for (const path of PUBLIC_PAGES) {
    test(`KHÔNG có vi phạm CSP nào khi render ${path}`, async ({ page }) => {
      // Vì sao cần: các test CSP khác chỉ đọc HEADER — chúng chứng minh chính sách được gửi
      // đi, chứ không chứng minh trang tuân thủ nó. Một `style={{ }}` inline vẫn lọt qua
      // typecheck, lint và mọi test hiện có, rồi im lặng bị chặn ở production.
      //
      // Đó là chuyện đã xảy ra thật (2026-07-21): icon dùng inline transform nên mũi tên FAQ
      // không xoay ở production build, và không test nào bắt được.
      const violations: string[] = [];
      page.on('console', (message) => {
        if (/Content Security Policy/i.test(message.text())) {
          violations.push(message.text());
        }
      });

      await page.goto(path);
      await expect(page.locator('main')).toHaveCount(1);

      /*
       * NGOẠI LỆ DUY NHẤT, chỉ tồn tại trên môi trường http.
       *
       * `/auth` và `/auth/sign-up` redirect sang Logto, nên test này thực chất đo cả trang
       * `apps/logto-ui`. Trang đó tải logo CMS qua `{APP_URL}/api/brand/logo`; CSP của LOGTO
       * (không phải của ta) chỉ cho ảnh `https:`, nên trên dev http ảnh bị chặn và trang rơi
       * về logo chữ — đúng thiết kế fail-open, không phải lỗi. Trên production (https) ảnh
       * được phép. Lọc ĐÍCH DANH vi phạm đó; mọi vi phạm khác vẫn làm test đỏ.
       */
      const real = violations.filter((v) => !v.includes('/api/brand/logo'));

      expect(real, ['Vi phạm CSP:', ...real].join('\n')).toEqual([]);
    });
  }

  test('có header an toàn cơ bản', async ({ request }) => {
    const response = await request.get('/');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  });
});

test.describe('responsive và bàn phím', () => {
  for (const path of PUBLIC_PAGES) {
    test(`không tràn ngang ở ${path}`, async ({ page }) => {
      await page.goto(path);

      // Tràn ngang là lỗi responsive kinh điển và nó im lặng: trang vẫn "chạy",
      // chỉ là người dùng mobile phải cuộn ngang. Test chạy ở cả 3 project viewport.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow).toBe(false);
    });
  }

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
    // Đường dẫn không mang prefix locale bị proxy chuẩn hoá trước (DEC-T25), nên 404 nằm ở
    // URL ĐÃ gắn locale. Kiểm thẳng ở đó để test nói đúng một chuyện.
    const response = await request.get('/vi/khong-ton-tai-abcxyz', { maxRedirects: 0 });
    expect(response.status()).toBe(404);
  });

  test('đường dẫn trần được chuẩn hoá về locale rồi mới 404', async ({ request }) => {
    const redirect = await request.get('/khong-ton-tai-abcxyz', { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);

    const location = redirect.headers().location;
    expect(location, 'redirect phải có header Location').toBeDefined();
    expect(new URL(location as string, 'http://localhost').pathname).toBe(
      '/vi/khong-ton-tai-abcxyz',
    );
  });
});

/**
 * Định tuyến theo ngôn ngữ (DEC-T25).
 *
 * Nhóm test này tồn tại vì prefix locale đụng vào ĐÚNG chỗ mà guard admin dựa vào để hoạt
 * động. Xem test `/vi/admin` bên dưới — nó là lý do chính của cả nhóm.
 */
test.describe('i18n routing (DEC-T25)', () => {
  test('`/` chuyển hướng 307 về locale mặc định', async ({ request }) => {
    const response = await request.get('/', { maxRedirects: 0 });
    expect(response.status()).toBe(307);

    const location = response.headers().location;
    expect(location, 'redirect phải có header Location').toBeDefined();
    expect(new URL(location as string, 'http://localhost').pathname).toBe('/vi');
  });

  test('`Accept-Language: en` đưa về `/en`', async ({ request }) => {
    const response = await request.get('/', {
      maxRedirects: 0,
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location as string, 'http://localhost').pathname).toBe('/en');
  });

  test('cookie thắng Accept-Language', async ({ request }) => {
    // Cookie là lựa chọn TƯỜNG MINH của người dùng; `Accept-Language` chỉ là cấu hình OS.
    const response = await request.get('/', {
      maxRedirects: 0,
      headers: { 'accept-language': 'en-US,en;q=0.9', cookie: 'talos_locale=vi' },
    });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location as string, 'http://localhost').pathname).toBe('/vi');
  });

  for (const locale of LOCALES) {
    test(`\`<html lang>\` khớp prefix ở /${locale}`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
    });

    /**
     * LÝ DO AN NINH, không phải chuyện định tuyến.
     *
     * `isAdminPath` so khớp tiền tố `/admin` CHÍNH XÁC. Nếu ai đó "sửa cho nhất quán" bằng
     * cách cho `/admin` vào vùng locale, thì `/vi/admin` sẽ không khớp guard ở proxy —
     * lớp chặn admin thứ nhất biến mất mà không có lỗi nào nổi lên. Test này biến việc đó
     * thành CI đỏ.
     */
    test(`/${locale}/admin không tồn tại — 404, không phải trang admin`, async ({ request }) => {
      const response = await request.get(`/${locale}/admin`, { maxRedirects: 0 });
      expect(response.status()).toBe(404);

      const body = (await response.text()).toLowerCase();
      expect(body).not.toContain('quản trị');
    });

    /**
     * hreflang: cùng nội dung ở hai URL thì phải khai quan hệ giữa chúng, nếu không công cụ
     * tìm kiếm coi đây là hai trang trùng lặp cạnh tranh nhau.
     */
    test(`/${locale} khai canonical và hreflang cho cả hai ngôn ngữ`, async ({ page }) => {
      await page.goto(`/${locale}`);

      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);

      for (const other of LOCALES) {
        await expect(page.locator(`link[rel="alternate"][hreflang="${other}"]`)).toHaveCount(1);
      }
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);
    });
  }

  /**
   * Chống hồi quy cho việc dịch NỘI DUNG (không chỉ vỏ header/footer).
   *
   * Trước khi dịch xong, `/en` render vỏ tiếng Anh nhưng thân trang vẫn tiếng Việt. Hai bài
   * dưới đây khoá trạng thái đó lại: mỗi trang phải nói đúng MỘT thứ tiếng.
   */
  /**
   * `innerText` chứ KHÔNG phải `textContent`.
   *
   * `textContent` gồm cả nội dung bên trong `<script>`, mà RSC payload của Next là một
   * `<script>` chứa nguyên văn cây React — kể cả nhánh `not-found` chưa hề hiển thị. Dùng
   * `textContent` thì bài này báo đỏ vì chữ mà người dùng KHÔNG BAO GIỜ nhìn thấy.
   * `innerText` chỉ trả về chữ đã render ra màn hình.
   */
  /**
   * Đọc thân trang SAU KHI nội dung thật đã render.
   *
   * `page.goto` trả về ở sự kiện `load`, nhưng layout `(user)` là async (nó đọc điều hướng
   * từ Control Plane), nên Next stream `loading.tsx` trước rồi mới tới nội dung. Đọc ngay
   * sau `goto` sẽ bắt được đúng khoảnh khắc "Đang tải…" — và đó là một lần test đỏ ngẫu
   * nhiên đã xảy ra thật.
   *
   * Chờ `h1` là mốc đúng: nó chỉ tồn tại ở nội dung thật, không có trong `loading.tsx`.
   */
  async function readSettledBody(page: import('@playwright/test').Page, path: string) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    return page.locator('body').innerText();
  }

  test('/en không còn sót chữ tiếng Việt trong thân trang', async ({ page }) => {
    const body = await readSettledBody(page, '/en');

    // Dấu phụ tiếng Việt chỉ tồn tại trong bản dịch `vi` — thấy chúng ở `/en` nghĩa là có
    // chuỗi chưa đi qua message catalog.
    expect(body).not.toMatch(/[ăâđêôơưĂÂĐÊÔƠƯ]/);
  });

  test('/vi và /en render nội dung khác nhau', async ({ page }) => {
    const viBody = await readSettledBody(page, '/vi');
    const enBody = await readSettledBody(page, '/en');

    expect(viBody).not.toBe(enBody);
    expect(enBody).toContain('Discover the best tools');
    expect(viBody).toContain('Khám phá công cụ tốt nhất');
  });
});
