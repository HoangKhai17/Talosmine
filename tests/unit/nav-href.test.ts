import { describe, expect, it } from 'vitest';
import { checkNavHref } from '../../apps/control-plane/src/modules/site-content/nav-href';
import { parseAllowedHosts } from '../../apps/control-plane/src/shared/url-policy';

/**
 * Kiểm `href` của mục điều hướng — BỀ MẶT OPEN REDIRECT.
 *
 * Bối cảnh: ô nhập này để người biên tập gõ vào, rồi giá trị đó thành `<a href>` trên header
 * của MỌI trang. Đây là cùng loại lỗ hổng đã vá cho `returnTo` ở commit `61871cd`, quay lại
 * dưới hình dạng khác — nên bộ test này sao chép đúng các case escape đã biết ở
 * `safe-return-to.test.ts`.
 *
 * Phần lớn là NEGATIVE test. Một hàm kiểm URL viết vội sẽ pass hết phần positive.
 */

const OPTIONS = { allowedHosts: parseAllowedHosts('app.talosmine.vn') };

describe('checkNavHref — đường dẫn nội bộ', () => {
  it('chấp nhận đường dẫn tuyệt đối', () => {
    for (const path of ['/tools', '/blog/bai-viet', '/', '/tools?q=ai#top']) {
      const result = checkNavHref(path, OPTIONS);
      expect(result.ok, path).toBe(true);
      expect(result.value).toBe(path);
    }
  });

  it('cắt khoảng trắng thừa', () => {
    expect(checkNavHref('  /tools  ', OPTIONS).value).toBe('/tools');
  });

  it('TỪ CHỐI chuỗi rỗng', () => {
    expect(checkNavHref('   ', OPTIONS)).toMatchObject({ ok: false, code: 'EMPTY' });
  });

  it('TỪ CHỐI đường dẫn tương đối', () => {
    // `tools` phụ thuộc trang hiện tại, nên cùng một mục menu sẽ trỏ đi những nơi khác nhau
    // tuỳ người dùng đang đứng ở đâu.
    expect(checkNavHref('tools', OPTIONS)).toMatchObject({
      ok: false,
      code: 'NOT_ABSOLUTE_PATH',
    });
  });
});

describe('checkNavHref — các cách qua mặt đã biết', () => {
  /**
   * `//host` là URL PROTOCOL-RELATIVE: trình duyệt hiểu là `https://host`. Đây là bẫy của
   * mọi phép kiểm "bắt đầu bằng `/` là an toàn".
   */
  it('TỪ CHỐI `//` (protocol-relative)', () => {
    for (const href of ['//evil.com', '//evil.com/path', '///evil.com']) {
      expect(checkNavHref(href, OPTIONS), href).toMatchObject({
        ok: false,
        code: 'PROTOCOL_RELATIVE',
      });
    }
  });

  /**
   * Trình duyệt đổi `\` thành `/` TRƯỚC khi phân giải, nên `/\evil.com` thành `//evil.com`.
   */
  it('TỪ CHỐI dấu backslash', () => {
    for (const href of ['/\\evil.com', '\\\\evil.com', '/path\\..\\x']) {
      expect(checkNavHref(href, OPTIONS), href).toMatchObject({ ok: false, code: 'BACKSLASH' });
    }
  });

  /**
   * Tab/newline/CR bị bộ phân giải URL XOÁ trước khi phân giải. `/\t/evil.com` lọt qua phép
   * kiểm chuỗi rồi thành `//evil.com` ở trình duyệt.
   */
  it('TỪ CHỐI ký tự điều khiển', () => {
    for (const href of ['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', 'https:/\t/evil.com']) {
      expect(checkNavHref(href, OPTIONS), JSON.stringify(href)).toMatchObject({
        ok: false,
        code: 'CONTROL_CHARACTER',
      });
    }
  });

  it('TỪ CHỐI scheme nguy hiểm', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
      const result = checkNavHref(href, OPTIONS);
      expect(result.ok, href).toBe(false);
    }
  });
});

describe('checkNavHref — URL ngoài', () => {
  it('chấp nhận https trong allowlist và trả dạng chuẩn hoá', () => {
    const result = checkNavHref('HTTPS://App.Talosmine.VN:443/x#frag', OPTIONS);
    expect(result.ok).toBe(true);
    // Hạ chữ thường host, bỏ cổng mặc định, bỏ fragment — xem `docs/url-policy.md` mục 10.
    expect(result.value).toBe('https://app.talosmine.vn/x');
  });

  it('TỪ CHỐI host ngoài allowlist', () => {
    expect(checkNavHref('https://evil.com/x', OPTIONS)).toMatchObject({
      ok: false,
      code: 'EXTERNAL_REJECTED',
    });
  });

  it('TỪ CHỐI http (không phải https)', () => {
    expect(checkNavHref('http://app.talosmine.vn/x', OPTIONS)).toMatchObject({
      ok: false,
      code: 'EXTERNAL_REJECTED',
    });
  });

  /** `https://app.talosmine.vn@evil.com` đọc lướt thấy đúng host, nhưng đi tới `evil.com`. */
  it('TỪ CHỐI userinfo giả mạo', () => {
    expect(checkNavHref('https://app.talosmine.vn@evil.com/', OPTIONS)).toMatchObject({
      ok: false,
      code: 'EXTERNAL_REJECTED',
    });
  });

  it('allowlist rỗng thì từ chối mọi URL ngoài', () => {
    const empty = { allowedHosts: parseAllowedHosts('') };
    expect(checkNavHref('https://app.talosmine.vn/x', empty).ok).toBe(false);
    // Nhưng đường dẫn nội bộ vẫn phải chạy — chúng không đi qua allowlist.
    expect(checkNavHref('/tools', empty).ok).toBe(true);
  });
});
