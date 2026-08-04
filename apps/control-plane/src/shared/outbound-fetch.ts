import { resolve4, resolve6 } from 'node:dns/promises';
import { isIP } from 'node:net';
import { checkResolvedAddresses, checkUrlSyntax, type UrlPolicyOptions } from './url-policy.js';

/**
 * ĐƯỜNG RA NGOÀI DUY NHẤT được phép của Control Plane (DEC-T27).
 *
 * Trước migration 0017, Control Plane KHÔNG gọi ra Internet ở bất kỳ đâu — `url-policy.ts`
 * chỉ dùng để kiểm URL trước khi LƯU. Vì vậy `checkResolvedAddresses` (phần chống SSRF nặng
 * nhất của file đó) đã viết xong và có test nhưng **chưa từng được gọi**, và cờ `!internal`
 * của allowlist trên thực tế vô tác dụng.
 *
 * DEC-B17 mở đường cho Hub tự gọi API nhà cung cấp thứ ba. Kể từ đó, khoảng hở trên trở
 * thành lỗ hổng thật, nên DEC-T27 ghi việc nối `checkResolvedAddresses` là TIỀN ĐỀ BẮT BUỘC
 * trước lời gọi outbound đầu tiên. File này là chỗ nối đó.
 *
 * BỐN LỚP, theo đúng thứ tự rẻ-trước-đắt-sau:
 *
 *   1. Cú pháp + scheme + userinfo + allowlist host  (không chạm mạng)
 *   2. Phân giải DNS và kiểm MỌI địa chỉ trả về      (chạm mạng, nhưng chưa gửi gì đi)
 *   3. Gửi request với timeout                        (mới thật sự ra ngoài)
 *   4. Đọc phản hồi có trần kích thước
 *
 * THUẦN VÀ TIÊM PHỤ THUỘC, cùng phong cách `url-policy.ts`: mọi cấu hình đi qua tham số,
 * không đọc env trực tiếp. Nhờ vậy test dựng được HTTP server thật thay vì mock `fetch` —
 * đúng tinh thần DEC-T05.
 */

/** Lý do một lời gọi ra ngoài bị từ chối. Máy đọc được. */
export type OutboundRejectionCode =
  | 'URL_REJECTED'
  | 'DNS_REJECTED'
  | 'REDIRECT_NOT_ALLOWED'
  | 'TIMEOUT'
  | 'RESPONSE_TOO_LARGE'
  | 'NETWORK_ERROR';

export class OutboundError extends Error {
  constructor(
    readonly code: OutboundRejectionCode,
    message: string,
  ) {
    super(message);
    this.name = 'OutboundError';
  }
}

export interface OutboundFetchOptions extends UrlPolicyOptions {
  /** Trần thời gian cho cả lượt gọi, tính bằng mili giây. */
  timeoutMs: number;
  /** Trần kích thước phản hồi, tính bằng byte. Mặc định 1 MiB. */
  maxResponseBytes?: number;
  /**
   * Bộ phân giải DNS. Tiêm được để test kiểm cả những trường hợp không dựng thật được
   * (host trả nhiều bản ghi, IPv4 nhúng trong IPv6…), giống hệt `checkResolvedAddresses`.
   */
  resolve?: (hostname: string) => Promise<string[]>;
}

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

/**
 * Phân giải mặc định: gộp cả A và AAAA.
 *
 * PHẢI hỏi cả hai họ địa chỉ. Chỉ hỏi A thì một host chỉ có bản ghi AAAA trỏ `::1` sẽ đi
 * lọt vì `resolve4` ném lỗi "không có bản ghi" và ta tưởng là không phân giải được.
 * Ngược lại, chỉ hỏi AAAA thì bỏ sót toàn bộ dải IPv4 nội bộ.
 */
async function resolveBothFamilies(hostname: string): Promise<string[]> {
  // URL DÙNG THẲNG ĐỊA CHỈ IP: `dns.resolve4('127.0.0.1')` KHÔNG trả về `127.0.0.1` — nó
  // coi đó là một tên miền và tra thất bại. Nếu không xử lý riêng thì mọi URL dạng IP đều
  // rơi vào `DNS_FAILED`, kể cả IP hoàn toàn hợp lệ.
  //
  // Đúng cách là coi chính địa chỉ đó là kết quả phân giải: `checkResolvedAddresses` vẫn
  // đưa nó qua `isPrivateAddress` như mọi địa chỉ khác, nên `https://127.0.0.1/` hay
  // `https://169.254.169.254/` vẫn bị chặn — chỉ khác là bị chặn vì ĐÚNG lý do (địa chỉ nội
  // bộ) thay vì vì một lỗi DNS gây hiểu nhầm.
  //
  // Bỏ ngoặc vuông trước khi kiểm: `new URL('https://[::1]/').hostname` trả về `[::1]`, mà
  // `isIP` không nhận dạng được chuỗi có ngoặc.
  const bare =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  if (isIP(bare) !== 0) return [bare];

  const settled = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  const addresses = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

  // Cả hai cùng thất bại = thật sự không phân giải được. Trả mảng rỗng để
  // `checkResolvedAddresses` từ chối bằng `DNS_FAILED`, thay vì ném lỗi kiểu khác.
  return addresses;
}

/**
 * Gọi ra ngoài sau khi đã qua đủ bốn lớp kiểm. Ném `OutboundError` nếu bất kỳ lớp nào chặn.
 */
export async function outboundFetch(
  rawUrl: string,
  init: RequestInit,
  options: OutboundFetchOptions,
): Promise<{ status: number; body: string }> {
  const syntax = checkUrlSyntax(rawUrl, options);
  if (!syntax.ok || !syntax.canonical) {
    throw new OutboundError('URL_REJECTED', syntax.message ?? 'URL không hợp lệ.');
  }

  const url = new URL(syntax.canonical);
  const dns = await checkResolvedAddresses(
    url.hostname,
    options,
    options.resolve ?? resolveBothFamilies,
  );
  if (!dns.ok) {
    throw new OutboundError('DNS_REJECTED', dns.message ?? 'Tên miền không được phép.');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      // `manual` là BẮT BUỘC, không phải tuỳ chọn: để `fetch` tự đi theo redirect nghĩa là
      // đích cuối cùng KHÔNG đi qua ba lớp kiểm ở trên — một endpoint hợp lệ trả 302 sang
      // `http://169.254.169.254/` là đi thẳng vào metadata endpoint. Đó đúng là lỗ hổng mà
      // `url-policy.ts` sinh ra để chống, và nó sẽ mở lại ở đây nếu dùng `follow`.
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new OutboundError('TIMEOUT', 'Nhà cung cấp không phản hồi kịp thời hạn.');
    }
    throw new OutboundError('NETWORK_ERROR', 'Không kết nối được tới nhà cung cấp.');
  }

  // 3xx tới đây nghĩa là upstream muốn chuyển hướng. Ta KHÔNG đi theo (xem trên) và cũng
  // không im lặng trả về một phản hồi rỗng — báo rõ để người cấu hình sửa endpoint.
  if (response.status >= 300 && response.status < 400) {
    throw new OutboundError(
      'REDIRECT_NOT_ALLOWED',
      'Nhà cung cấp trả về chuyển hướng; endpoint phải là địa chỉ cuối cùng.',
    );
  }

  const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const body = await readCapped(response, maxBytes);

  return { status: response.status, body };
}

/**
 * Đọc thân phản hồi với trần kích thước.
 *
 * KHÔNG tin `content-length`: nó do phía bên kia khai và có thể sai hoặc vắng mặt. Đếm số
 * byte THẬT SỰ đã nhận và cắt kết nối ngay khi vượt trần — nếu chỉ kiểm header thì một
 * phản hồi chunked vô hạn vẫn kéo được tiến trình này tới hết bộ nhớ.
 */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new OutboundError('RESPONSE_TOO_LARGE', 'Phản hồi của nhà cung cấp quá lớn.');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof OutboundError) throw error;
    throw new OutboundError('NETWORK_ERROR', 'Lỗi khi đọc phản hồi từ nhà cung cấp.');
  }

  return new TextDecoder().decode(concat(chunks, total));
}

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
