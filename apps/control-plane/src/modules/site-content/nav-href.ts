import { checkUrlSyntax, type UrlPolicyOptions } from '../../shared/url-policy.js';

/**
 * Kiểm `href` của một mục điều hướng.
 *
 * ĐÂY LÀ BỀ MẶT OPEN REDIRECT. Ô nhập này để người biên tập gõ vào, rồi giá trị đó thành
 * `<a href>` trên header của MỌI trang. Cùng loại lỗ hổng đã vá ở commit `61871cd` cho
 * `returnTo`, quay lại dưới một hình dạng khác.
 *
 * HAI DẠNG ĐƯỢC PHÉP, không có dạng thứ ba:
 *
 *   1. Đường dẫn NỘI BỘ — bắt đầu bằng `/`, không phải `//`.
 *   2. URL NGOÀI — `https:` và host nằm trong allowlist (đi qua `checkUrlSyntax`).
 *
 * VÌ SAO KHÔNG TỰ VIẾT PHẦN URL NGOÀI: `checkUrlSyntax` đã có 31 test, đã xử lý userinfo
 * (`https://talosmine.vn@evil.com`), scheme lạ (`javascript:`, `data:`) và allowlist khớp
 * chính xác. Viết lại ở đây là tạo ra chỗ thứ hai để hai luật lệch nhau.
 *
 * VÌ SAO PHẦN NỘI BỘ PHẢI TỰ VIẾT: `checkUrlSyntax` nhận URL tuyệt đối, còn `/tools` thì
 * không phải URL. Luật cho nó ngắn nhưng có ba cái bẫy đã biết — xem bên dưới.
 */

export type NavHrefRejection =
  | 'EMPTY'
  | 'PROTOCOL_RELATIVE'
  | 'BACKSLASH'
  | 'CONTROL_CHARACTER'
  | 'NOT_ABSOLUTE_PATH'
  | 'EXTERNAL_REJECTED';

export interface NavHrefResult {
  ok: boolean;
  /** Giá trị để LƯU. Với URL ngoài là dạng đã canonicalize. Chỉ có khi `ok`. */
  value?: string;
  code?: NavHrefRejection;
  message?: string;
}

/**
 * Ký tự điều khiển mà bộ phân giải URL của trình duyệt XOÁ trước khi phân giải: tab,
 * newline, carriage return.
 *
 * Vì sao phải chặn: `/\t/evil.com` trông như đường dẫn nội bộ với phép kiểm chuỗi, nhưng
 * trình duyệt xoá tab rồi đi tới `//evil.com` — tức origin ngoài. Đây chính là cách bypass
 * đã được ghi lại ở `tests/unit/safe-return-to.test.ts`.
 */
const CONTROL_CHARACTERS = /[\t\n\r]/;

export function checkNavHref(raw: string, options: UrlPolicyOptions): NavHrefResult {
  const trimmed = raw.trim();

  if (trimmed === '') {
    return reject('EMPTY', 'Đường dẫn không được để trống.');
  }

  if (CONTROL_CHARACTERS.test(trimmed)) {
    return reject(
      'CONTROL_CHARACTER',
      'Đường dẫn chứa ký tự điều khiển (tab/xuống dòng) — trình duyệt sẽ xoá chúng rồi đi tới một địa chỉ khác.',
    );
  }

  // Backslash: trình duyệt đổi `\` thành `/` trước khi phân giải, nên `/\evil.com` thành
  // `//evil.com`. Chặn trước khi nghĩ tới chuyện gì khác.
  if (trimmed.includes('\\')) {
    return reject('BACKSLASH', 'Đường dẫn không được chứa dấu `\\`.');
  }

  if (trimmed.startsWith('/')) {
    // `//host` là URL PROTOCOL-RELATIVE, không phải đường dẫn nội bộ: trình duyệt hiểu nó
    // là `https://host`. Đây là bẫy kinh điển của mọi bộ kiểm "bắt đầu bằng `/` là an toàn".
    if (trimmed.startsWith('//')) {
      return reject(
        'PROTOCOL_RELATIVE',
        'Đường dẫn bắt đầu bằng `//` trỏ ra ngoài trang. Dùng một dấu `/` cho đường dẫn nội bộ.',
      );
    }
    return { ok: true, value: trimmed };
  }

  // Không bắt đầu bằng `/` → chỉ còn khả năng là URL tuyệt đối. Đường dẫn tương đối
  // (`tools`) bị từ chối: nó phụ thuộc trang hiện tại, nên cùng một mục menu sẽ trỏ đi
  // những nơi khác nhau tuỳ người dùng đang đứng ở đâu.
  if (!trimmed.includes('://')) {
    return reject(
      'NOT_ABSOLUTE_PATH',
      'Đường dẫn nội bộ phải bắt đầu bằng `/`. URL ngoài phải bắt đầu bằng `https://`.',
    );
  }

  const external = checkUrlSyntax(trimmed, options);
  if (!external.ok || !external.canonical) {
    return reject('EXTERNAL_REJECTED', external.message ?? 'URL ngoài không hợp lệ.');
  }

  // LƯU DẠNG CHUẨN HOÁ — cùng lý do với `launchUrl` của catalog.
  return { ok: true, value: external.canonical };
}

function reject(code: NavHrefRejection, message: string): NavHrefResult {
  return { ok: false, code, message };
}
