import { expect, test } from '@playwright/test';

/**
 * Lưới cột — kiểm bằng ĐO ĐẠC THẬT, không phải đọc CSS.
 *
 * Vì sao cần test này: bố cục "trông có vẻ đúng" là thứ trôi lệch âm thầm nhất. Một khối
 * bị ghim bằng `max-width: 720px` vẫn trông ổn trên máy người viết, rồi lệch cột ở màn
 * khác mà không ai biết. Test này đo `getBoundingClientRect()` thật rồi so với vị trí cột
 * tính từ token — sai lệch quá 1.5px là fail.
 *
 * Quy tắc được kiểm nằm ở `docs/frontend-css-rules.md` mục 6 và phần LƯỚI CỘT trong
 * `globals.css`.
 */

/** Sai số cho phép. Trình duyệt làm tròn subpixel nên không thể so bằng nhau tuyệt đối. */
const TOLERANCE = 1.5;

/**
 * Mở trang chủ và CHỜ CSS được áp trước khi đo.
 *
 * Vì sao cần: Next chia CSS thành chunk và nạp bất đồng bộ. Sự kiện `load` có thể xảy ra
 * khi `.container.grid` vẫn còn là `display: block` — lúc đó `gridTemplateColumns` là
 * `none` và mọi phép đo đều sai. Trang càng dài thì cửa sổ race càng rộng, nên đây là lỗi
 * chỉ hiện ra khi nội dung nhiều lên.
 *
 * Chờ đúng điều kiện sẽ đo, thay vì chờ một khoảng thời gian đoán chừng.
 */
async function gotoHome(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForFunction(() => {
    const el = document.querySelector('.container.grid');
    if (!el) return false;
    const tracks = getComputedStyle(el).gridTemplateColumns;

    // Điều kiện là ĐÃ PHÂN GIẢI RA PIXEL, không phải "có nhiều hơn một mảnh".
    //
    // Khi phần tử chưa được layout, `getComputedStyle` trả lại giá trị KHAI BÁO
    // (`repeat(4, minmax(0, 1fr))`) chứ không phải giá trị dùng thật. Chuỗi đó tách bằng
    // dấu cách cho ra 3 mảnh — trông y hệt một lưới 3 cột. Đó chính là cái bẫy đã làm
    // test đỏ ngẫu nhiên.
    return tracks.includes('px') && !tracks.includes('repeat');
  });
}

/**
 * Đọc hình học lưới THỰC TẾ từ trang: bề ngang vùng nội dung của `.container`, số cột và
 * gap hiện hành. Lấy từ DOM chứ không hardcode — nếu token đổi, test vẫn đúng.
 */
async function readGridGeometry(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const container = document.querySelector('.container.grid');
    if (!container) throw new Error('Không tìm thấy phần tử `.container.grid` nào');

    const style = getComputedStyle(container);
    const rect = container.getBoundingClientRect();

    const paddingLeft = Number.parseFloat(style.paddingLeft);
    const paddingRight = Number.parseFloat(style.paddingRight);
    const contentLeft = rect.left + paddingLeft;
    const contentWidth = rect.width - paddingLeft - paddingRight;

    // Đếm cột bằng số track có đơn vị `px` — đây là số cột trình duyệt THỰC SỰ dùng.
    //
    // KHÔNG đếm số mảnh khi tách chuỗi: nếu phần tử chưa layout, giá trị trả về là
    // `repeat(4, minmax(0, 1fr))` và cách đếm đó cho ra 3 — một con số vô nghĩa nhưng
    // trông hợp lệ.
    const columns = style.gridTemplateColumns.split(' ').filter((t) => t.endsWith('px')).length;
    const gap = Number.parseFloat(style.columnGap);

    return { contentLeft, contentWidth, columns, gap };
  });
}

/** Bề ngang mà một khối chiếm `span` cột PHẢI có. */
function expectedWidth(
  geometry: { contentWidth: number; columns: number; gap: number },
  span: number,
): number {
  const columnWidth =
    (geometry.contentWidth - (geometry.columns - 1) * geometry.gap) / geometry.columns;
  return span * columnWidth + (span - 1) * geometry.gap;
}

test.describe('lưới cột trang chủ', () => {
  test('số cột đúng theo breakpoint (4 / 8 / 12)', async ({ page }, testInfo) => {
    await gotoHome(page);
    const geometry = await readGridGeometry(page);

    // Ánh xạ project → số cột mong đợi. Đây chính là quy chuẩn Figma.
    const expected = { desktop: 12, tablet: 8, mobile: 4 }[testInfo.project.name];
    expect(geometry.columns).toBe(expected);
  });

  test('hero KHÔNG bị ghim bằng max-width — bề ngang đến từ số cột', async ({ page }, testInfo) => {
    await gotoHome(page);
    const geometry = await readGridGeometry(page);

    // Bản đồ cột của hero heading, khớp comment trong page.module.css.
    const span = { desktop: 10, tablet: 6, mobile: 4 }[testInfo.project.name] as number;

    const heading = page.locator('h1').first();
    const box = await heading.boundingBox();
    if (!box) throw new Error('Không đo được hero heading');

    expect(box.width).toBeCloseTo(expectedWidth(geometry, span), 0);

    // Mép trái phải trùng mép trái vùng nội dung — tức là nó bắt đầu từ cột 1.
    expect(Math.abs(box.x - geometry.contentLeft)).toBeLessThan(TOLERANCE);
  });

  test('thẻ công cụ: 1 / 2 / 3 thẻ mỗi hàng và khít cột', async ({ page }, testInfo) => {
    await gotoHome(page);
    const geometry = await readGridGeometry(page);

    const cards = page.locator('ul.gridRow').first().locator('> li');
    await expect(cards).toHaveCount(3);

    const first = await cards.nth(0).boundingBox();
    if (!first) throw new Error('Không đo được thẻ đầu tiên');

    // `span 4` ở mọi breakpoint, nhưng ý nghĩa đổi vì số cột đổi:
    // 4/4 cả hàng (mobile) · 4/8 nửa (tablet) · 4/12 một phần ba (desktop).
    expect(first.width).toBeCloseTo(expectedWidth(geometry, 4), 0);

    // Số thẻ trên MỘT hàng = số thẻ có cùng toạ độ y với thẻ đầu.
    const boxes = await Promise.all(
      (await cards.all()).map(async (card) => await card.boundingBox()),
    );
    const perRow = boxes.filter((b) => b && Math.abs(b.y - first.y) < TOLERANCE).length;

    const expectedPerRow = { desktop: 3, tablet: 2, mobile: 1 }[testInfo.project.name];
    expect(perRow).toBe(expectedPerRow);
  });

  test('mọi ô lưới bắt đầu tại một mốc cột hợp lệ', async ({ page }) => {
    await gotoHome(page);
    const geometry = await readGridGeometry(page);

    const columnWidth =
      (geometry.contentWidth - (geometry.columns - 1) * geometry.gap) / geometry.columns;

    // Mốc trái hợp lệ của từng cột: contentLeft + i * (columnWidth + gap).
    const validStarts = Array.from(
      { length: geometry.columns },
      (_, i) => geometry.contentLeft + i * (columnWidth + geometry.gap),
    );

    // Con TRỰC TIẾP của mọi `.container.grid` — đây là các ô lưới thật.
    const items = page.locator('.container.grid > *');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      if (!(await item.isVisible())) continue;

      const box = await item.boundingBox();
      if (!box) continue;

      const nearest = Math.min(...validStarts.map((s) => Math.abs(box.x - s)));
      if (nearest > TOLERANCE) {
        const tag = await item.evaluate((el) => `${el.tagName}.${el.className}`);
        offenders.push(`${tag} lệch ${nearest.toFixed(1)}px khỏi mốc cột`);
      }
    }

    expect(offenders, `Có ô không nằm trên mốc cột:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('footer dùng chung lưới với trang', async ({ page }, testInfo) => {
    await gotoHome(page);
    const geometry = await readGridGeometry(page);

    const brand = page.locator('footer .container.grid > *').first();
    await brand.scrollIntoViewIfNeeded();
    const box = await brand.boundingBox();
    if (!box) throw new Error('Không đo được cột thương hiệu ở footer');

    const span = { desktop: 3, tablet: 8, mobile: 4 }[testInfo.project.name] as number;
    expect(box.width).toBeCloseTo(expectedWidth(geometry, span), 0);
  });
});
