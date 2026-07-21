import { isIP } from 'node:net';

/**
 * Chính sách URL cho catalog (P3, DEC-T12).
 *
 * VÌ SAO Ở APPLICATION LAYER chứ không phải CHECK trong database (modular.md mục 5.4):
 * kiểm tra này cần DNS resolution và một danh sách cấu hình — hai thứ CHECK constraint
 * không làm được. Database cố ý chấp nhận `http://127.0.0.1/admin`; chặn nó là việc ở đây.
 *
 * File này THUẦN: không phụ thuộc Nest, không đọc env trực tiếp. Nhờ vậy test được từng
 * hàm mà không phải dựng cả ứng dụng.
 */

/** Lý do một URL bị từ chối. Máy đọc được — UI map sang thông điệp cho người. */
export type UrlRejectionCode =
  | 'MALFORMED'
  | 'SCHEME_NOT_ALLOWED'
  | 'USERINFO_NOT_ALLOWED'
  | 'HOST_NOT_ALLOWED'
  | 'PRIVATE_ADDRESS'
  | 'DNS_FAILED';

export interface UrlPolicyResult {
  ok: boolean;
  /** URL đã chuẩn hoá — chỉ có khi `ok`. Đây mới là giá trị được lưu vào database. */
  canonical?: string;
  code?: UrlRejectionCode;
  message?: string;
}

/** Một host được phép, kèm việc nó có phải hạ tầng nội bộ của chính dự án hay không. */
export interface AllowedHost {
  /** Hostname khớp CHÍNH XÁC, đã hạ chữ thường. Không wildcard. */
  host: string;
  /**
   * `true` = hạ tầng của chính dự án, được phép nằm trên địa chỉ nội bộ.
   *
   * Ví dụ Supabase Storage chạy trong private network (DEC-T12). Kiểm địa chỉ nội bộ tồn
   * tại để chặn URL LẠ, còn hạ tầng của mình thì ta biết nó ở đâu.
   *
   * Đánh dấu sai ở đây là mở lại đúng lỗ SSRF — nên nó phải là quyết định tường minh
   * trong cấu hình, không phải suy đoán từ tên host.
   */
  internal?: boolean;
}

export interface UrlPolicyOptions {
  allowedHosts: readonly AllowedHost[];
  /**
   * Cho phép `http:` khi hostname là loopback. CHỈ dùng ở dev.
   *
   * Điều kiện là HOSTNAME chứ không phải `NODE_ENV`: một `.env` production trỏ nhầm sang
   * `http://` của host khác vẫn phải bị chặn.
   */
  allowInsecureLoopback?: boolean;
}

/**
 * Kiểm cú pháp, scheme, userinfo và allowlist. KHÔNG chạm mạng.
 *
 * Tách khỏi phần DNS vì hai lý do: phần này chạy được ở mọi nơi kể cả test không có mạng,
 * và nó là cửa rẻ tiền nên nên chạy trước.
 */
export function checkUrlSyntax(raw: string, options: UrlPolicyOptions): UrlPolicyResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return reject('MALFORMED', 'URL không đọc được.');
  }

  // Userinfo là công cụ lừa đảo kinh điển: `https://talosmine.vn@evil.com` hiển thị như
  // thật ở đầu chuỗi nhưng trình duyệt đi tới `evil.com`.
  if (url.username !== '' || url.password !== '') {
    return reject('USERINFO_NOT_ALLOWED', 'URL không được chứa tên đăng nhập hoặc mật khẩu.');
  }

  const hostname = url.hostname.toLowerCase();
  const insecureLoopbackOk = options.allowInsecureLoopback === true && isLoopbackHostname(hostname);

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && insecureLoopbackOk)) {
    return reject('SCHEME_NOT_ALLOWED', 'URL phải dùng https.');
  }

  const allowed = findAllowedHost(hostname, options.allowedHosts);
  if (!allowed) {
    // Danh sách rỗng thì MỌI host đều bị từ chối. Mặc định nghiêng về an toàn: chưa cấu
    // hình allowlist không có nghĩa là cho phép tất cả.
    return reject('HOST_NOT_ALLOWED', 'Tên miền chưa nằm trong danh sách được phép.');
  }

  return { ok: true, canonical: canonicalize(url) };
}

/**
 * Kiểm địa chỉ IP mà hostname phân giải ra.
 *
 * `resolve` được tiêm vào thay vì gọi thẳng `node:dns` — để test kiểm được cả những
 * trường hợp không dựng được thật (host trả về nhiều bản ghi, IPv4 nhúng trong IPv6…).
 *
 * TRẢ VỀ danh sách địa chỉ đã kiểm: caller nên kết nối bằng CHÍNH địa chỉ đó thay vì để
 * hệ thống phân giải lại. Phân giải hai lần là mở cửa cho DNS rebinding — kiểm lúc T1 ra
 * IP công cộng, kết nối lúc T2 ra `127.0.0.1`.
 */
export async function checkResolvedAddresses(
  hostname: string,
  options: UrlPolicyOptions,
  resolve: (host: string) => Promise<string[]>,
): Promise<UrlPolicyResult & { addresses?: string[] }> {
  const host = hostname.toLowerCase();
  const allowed = findAllowedHost(host, options.allowedHosts);

  if (!allowed) {
    return reject('HOST_NOT_ALLOWED', 'Tên miền chưa nằm trong danh sách được phép.');
  }

  // Host của chính dự án được phép nằm trên địa chỉ nội bộ — xem ghi chú ở `AllowedHost`.
  if (allowed.internal === true) {
    return { ok: true };
  }

  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    return reject('DNS_FAILED', 'Không phân giải được tên miền.');
  }

  if (addresses.length === 0) {
    return reject('DNS_FAILED', 'Tên miền không có địa chỉ nào.');
  }

  // Kiểm MỌI địa chỉ, không phải địa chỉ đầu tiên. Một host trả về cả IP công cộng lẫn
  // 127.0.0.1 sẽ lọt nếu chỉ kiểm cái đầu.
  for (const address of addresses) {
    if (isPrivateAddress(address)) {
      return reject('PRIVATE_ADDRESS', 'Tên miền trỏ tới địa chỉ nội bộ.');
    }
  }

  return { ok: true, addresses };
}

/**
 * Địa chỉ có thuộc dải KHÔNG được phép hay không.
 *
 * Danh sách dựa trên dải dành riêng của IANA, không phải "những gì nhớ được".
 */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 0) {
    // Không phải IP hợp lệ → coi là không an toàn. Thà từ chối nhầm còn hơn cho qua nhầm.
    return true;
  }

  if (version === 6) {
    const normalized = address.toLowerCase();

    // IPv4 NHÚNG TRONG IPv6 — cách qua mặt phổ biến nhất.
    // `::ffff:127.0.0.1` là loopback nhưng mọi phép kiểm IPv4 thuần đều không thấy nó.
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateIpv4(mapped[1]);

    // Dạng hex của IPv4-mapped: ::ffff:7f00:1
    const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex?.[1] && mappedHex[2]) {
      const high = Number.parseInt(mappedHex[1], 16);
      const low = Number.parseInt(mappedHex[2], 16);
      return isPrivateIpv4(
        `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`,
      );
    }

    if (normalized === '::' || normalized === '::1') return true;

    const firstGroup = Number.parseInt(normalized.split(':')[0] || '0', 16);
    // fc00::/7 — unique local address
    if ((firstGroup & 0xfe00) === 0xfc00) return true;
    // fe80::/10 — link-local
    if ((firstGroup & 0xffc0) === 0xfe80) return true;

    return false;
  }

  return isPrivateIpv4(address);
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true;
  }

  const [a = 0, b = 0] = parts;

  if (a === 0) return true; // 0.0.0.0/8 — "this network"
  if (a === 10) return true; // 10/8 — private
  if (a === 127) return true; // 127/8 — loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 — CGNAT
  if (a === 169 && b === 254) return true; // 169.254/16 — link-local VÀ metadata endpoint
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 — private
  if (a === 192 && b === 168) return true; // 192.168/16 — private
  if (a === 192 && b === 0) return true; // 192.0.0/24 và 192.0.2/24 — dành riêng
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 — benchmark
  if (a >= 224) return true; // 224/4 multicast, 240/4 dành riêng, 255.255.255.255

  return false;
}

/**
 * Hostname có phải loopback hay không — dùng CHO NGOẠI LỆ DEV, không phải cho bảo mật.
 *
 * Chặn theo tên là vô dụng với kẻ tấn công: `lvh.me` và vô số domain khác trỏ về
 * 127.0.0.1. Việc chặn thật nằm ở `isPrivateAddress` sau khi phân giải DNS.
 */
function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function findAllowedHost(
  hostname: string,
  allowedHosts: readonly AllowedHost[],
): AllowedHost | undefined {
  // Khớp CHÍNH XÁC. Không wildcard: `*.example.com` cho phép kẻ tấn công đăng ký
  // `evil.example.com` rồi lọt allowlist.
  return allowedHosts.find((entry) => entry.host.toLowerCase() === hostname);
}

/**
 * Dạng chuẩn để lưu và so khớp.
 *
 * Hai chuỗi khác nhau có thể trỏ cùng một nơi (`HTTPS://A.COM:443/x` và `https://a.com/x`).
 * Nếu lưu nguyên văn, việc so khớp allowlist redirect sẽ trượt ở chỗ không ai ngờ.
 */
export function canonicalize(url: URL): string {
  const clone = new URL(url.toString());
  clone.hostname = clone.hostname.toLowerCase();
  clone.protocol = clone.protocol.toLowerCase();

  // Bỏ cổng mặc định — `new URL` đã làm, nhưng viết ra để ý định rõ ràng.
  if (
    (clone.protocol === 'https:' && clone.port === '443') ||
    (clone.protocol === 'http:' && clone.port === '80')
  ) {
    clone.port = '';
  }

  // Fragment không bao giờ tới máy chủ nên không thuộc danh tính của URL.
  clone.hash = '';

  return clone.toString();
}

function reject(code: UrlRejectionCode, message: string): UrlPolicyResult {
  return { ok: false, code, message };
}

/**
 * Đọc allowlist từ chuỗi cấu hình.
 *
 * Định dạng: `host` hoặc `host!internal`, phân cách bằng dấu phẩy.
 *
 *     talosmine.vn, app.talosmine.vn, storage.internal!internal
 *
 * Dấu `!internal` phải viết TƯỜNG MINH — không suy đoán từ tên host, vì đoán sai là mở
 * lại đúng lỗ SSRF.
 */
export function parseAllowedHosts(raw: string | undefined): AllowedHost[] {
  if (!raw) return [];

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      const [host = '', flag] = entry.split('!');
      const parsed: AllowedHost = { host: host.trim().toLowerCase() };
      if (flag?.trim() === 'internal') parsed.internal = true;
      return parsed;
    })
    .filter((entry) => entry.host !== '');
}
