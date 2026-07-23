import { describe, expect, it } from 'vitest';
import { safeReturnTo } from '../../apps/web/server/oidc';

/**
 * Chống OPEN REDIRECT ở `returnTo`.
 *
 * Bối cảnh: rà soát bảo mật 2026-07-23 phát hiện bản chỉ-so-chuỗi (`startsWith('//')`) bị
 * bypass. Bộ phân giải URL của trình duyệt — và `new URL` mà callback dùng để redirect —
 * XOÁ tab/newline (`\t \n \r`) và ĐỔI `\` thành `/` TRƯỚC khi phân giải. Nên `/\t/evil.com`
 * và `/\evil.com` lọt qua kiểm chuỗi rồi thành origin ngoài.
 *
 * Các case ESCAPE dưới đây PHẢI trả `/`. Nếu ai đó rút gọn `safeReturnTo` về so-chuỗi, test
 * này đỏ ngay.
 */
const BASE = 'http://localhost:3000';

describe('safeReturnTo — chặn open redirect', () => {
  it('giữ nguyên đường dẫn nội bộ hợp lệ', () => {
    expect(safeReturnTo('/dashboard', BASE)).toBe('/dashboard');
    expect(safeReturnTo('/tools?q=ai#top', BASE)).toBe('/tools?q=ai#top');
  });

  it('mặc định về `/` khi trống hoặc không bắt đầu bằng `/`', () => {
    expect(safeReturnTo(null, BASE)).toBe('/');
    expect(safeReturnTo('', BASE)).toBe('/');
    expect(safeReturnTo('https://evil.com', BASE)).toBe('/');
    expect(safeReturnTo('dashboard', BASE)).toBe('/');
  });

  it('chặn protocol-relative `//evil.com`', () => {
    expect(safeReturnTo('//evil.com', BASE)).toBe('/');
  });

  it('CHẶN bypass bằng tab (đây là lỗ hổng đã tìm ra)', () => {
    // `/` + TAB + `/evil.com` — new URL xoá tab thành `//evil.com` → evil.com
    const escaped = safeReturnTo('/\t/evil.com', BASE);
    expect(escaped).toBe('/');
    // Chứng minh KẾT QUẢ thật sự ở lại nội bộ: dựng URL như callback rồi so origin
    expect(new URL(escaped, BASE).origin).toBe(BASE);
  });

  it('CHẶN bypass bằng newline / carriage return', () => {
    expect(safeReturnTo('/\n/evil.com', BASE)).toBe('/');
    expect(safeReturnTo('/\r/evil.com', BASE)).toBe('/');
  });

  it('CHẶN bypass bằng backslash', () => {
    expect(safeReturnTo('/\\evil.com', BASE)).toBe('/');
    expect(safeReturnTo('/\\/evil.com', BASE)).toBe('/');
  });

  it('mọi payload đều KHÔNG dẫn ra origin ngoài sau khi dựng URL', () => {
    const payloads = [
      '/\t/evil.com',
      '/\n//evil.com',
      '/\\evil.com',
      '/%2F%2Fevil.com',
      '//evil.com',
      '/legit',
    ];
    for (const p of payloads) {
      const safe = safeReturnTo(p, BASE);
      expect(new URL(safe, BASE).origin, `payload ${JSON.stringify(p)}`).toBe(BASE);
    }
  });
});
