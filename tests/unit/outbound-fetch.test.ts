import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OutboundError, outboundFetch } from '../../apps/control-plane/src/shared/outbound-fetch';

/**
 * Test cho `outboundFetch` — đường ra ngoài DUY NHẤT của Control Plane (DEC-T27).
 *
 * VÌ SAO FILE NÀY QUAN TRỌNG: trước DEC-B17, Control Plane không gọi ra Internet ở bất kỳ
 * đâu, nên `checkResolvedAddresses` — phần chống SSRF nặng nhất của `url-policy.ts` — đã
 * viết xong, có test, mà **chưa từng được gọi**. Cờ `!internal` của allowlist do đó vô tác
 * dụng trên thực tế. DEC-T27 ghi việc nối nó vào là tiền đề bắt buộc; file này chứng minh
 * mối nối đó có thật và chặn đúng thứ cần chặn.
 *
 * KHÔNG MOCK `fetch`. Dựng HTTP server THẬT bằng `node:http` và để `outboundFetch` gọi ra
 * như production — cùng cách `oidc-verifier.test.ts` làm với JWKS server, đúng tinh thần
 * DEC-T05 áp cho mạng thay vì cho database.
 *
 * Phần lớn case là NEGATIVE có chủ đích: một wrapper viết vội sẽ pass hết "URL hợp lệ thì
 * gọi được" mà vẫn thủng ở redirect sang địa chỉ nội bộ — đúng lỗ mà `url-policy.ts` sinh
 * ra để chống.
 */

/** `127.0.0.1` là loopback, nên mọi test dưới đây phải bật NGOẠI LỆ dev một cách tường minh. */
const LOOPBACK_HOST = '127.0.0.1';

describe('outboundFetch — bốn lớp chặn trước khi ra Internet', () => {
  let server: Server;
  let port: number;
  /** Bộ đếm để test khẳng định server KHÔNG nhận được request nào khi bị chặn từ trước. */
  let hits: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(req.url ?? '');

      if (req.url === '/ok') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ hello: 'world' }));
        return;
      }
      if (req.url === '/redirect') {
        // Chuyển hướng sang một địa chỉ NỘI BỘ — đúng kịch bản SSRF kinh điển: endpoint
        // hợp lệ, nằm trong allowlist, nhưng trả 302 sang metadata endpoint của cloud.
        res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
        res.end();
        return;
      }
      if (req.url === '/huge') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        // Gửi nhiều hơn trần test đặt, theo từng khối để chứng minh việc cắt xảy ra trong
        // lúc đọc chứ không phải nhờ đọc `content-length`.
        for (let i = 0; i < 40; i += 1) res.write('x'.repeat(1024));
        res.end();
        return;
      }
      if (req.url === '/slow') {
        setTimeout(() => {
          res.writeHead(200);
          res.end('muon');
        }, 3000);
        return;
      }
      if (req.url === '/boom') {
        res.writeHead(503, { 'content-type': 'text/plain' });
        res.end('upstream het hoi');
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, LOOPBACK_HOST, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /**
   * Cấu hình cho phép gọi tới server test.
   *
   * `resolve` được TIÊM trả về địa chỉ công cộng: server test chạy trên loopback, mà
   * `isPrivateAddress` chặn đúng dải đó. Tiêm resolver là cách `url-policy.ts` thiết kế sẵn
   * cho tình huống này — cùng cơ chế production dùng, chỉ khác nguồn dữ liệu.
   */
  function allowOptions(overrides: Record<string, unknown> = {}) {
    return {
      allowedHosts: [{ host: LOOPBACK_HOST }],
      allowInsecureLoopback: true,
      timeoutMs: 5000,
      resolve: async () => ['93.184.216.34'],
      ...overrides,
    };
  }

  it('gọi được và trả về thân phản hồi khi mọi lớp đều đạt', async () => {
    const result = await outboundFetch(
      `http://${LOOPBACK_HOST}:${port}/ok`,
      { method: 'GET' },
      allowOptions(),
    );

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ hello: 'world' });
  });

  it('CHẶN host ngoài allowlist — và không gửi request nào đi', async () => {
    hits = [];

    await expect(
      outboundFetch(
        `http://${LOOPBACK_HOST}:${port}/ok`,
        { method: 'GET' },
        allowOptions({ allowedHosts: [{ host: 'khac.example.com' }] }),
      ),
    ).rejects.toMatchObject({ code: 'URL_REJECTED' });

    // Điểm mấu chốt: chặn phải xảy ra TRƯỚC khi gói tin rời tiến trình. Nếu server nhận
    // được request thì phép kiểm đã chạy quá muộn để có ý nghĩa.
    expect(hits).toEqual([]);
  });

  it('CHẶN khi DNS phân giải ra địa chỉ nội bộ — đây là mối nối chưa từng tồn tại trước DEC-T27', async () => {
    hits = [];

    await expect(
      outboundFetch(
        `http://${LOOPBACK_HOST}:${port}/ok`,
        { method: 'GET' },
        // Host nằm trong allowlist, cú pháp hợp lệ — chỉ DNS mới lộ ra rằng nó trỏ về
        // metadata endpoint. Không có lớp này thì request đã đi.
        allowOptions({ resolve: async () => ['169.254.169.254'] }),
      ),
    ).rejects.toMatchObject({ code: 'DNS_REJECTED' });

    expect(hits).toEqual([]);
  });

  it('CHẶN cả khi chỉ MỘT trong nhiều địa chỉ là nội bộ', async () => {
    await expect(
      outboundFetch(
        `http://${LOOPBACK_HOST}:${port}/ok`,
        { method: 'GET' },
        // Một host trả về cả IP công cộng lẫn 127.0.0.1 sẽ lọt nếu chỉ kiểm địa chỉ đầu.
        allowOptions({ resolve: async () => ['93.184.216.34', '127.0.0.1'] }),
      ),
    ).rejects.toMatchObject({ code: 'DNS_REJECTED' });
  });

  it('KHÔNG đi theo redirect — kể cả khi đích là địa chỉ nội bộ', async () => {
    hits = [];

    await expect(
      outboundFetch(`http://${LOOPBACK_HOST}:${port}/redirect`, { method: 'GET' }, allowOptions()),
    ).rejects.toMatchObject({ code: 'REDIRECT_NOT_ALLOWED' });

    // Đúng MỘT lần chạm server: request đầu tiên. Nếu có hai thì `redirect: 'manual'` đã
    // không có hiệu lực và ta vừa đi thẳng vào metadata endpoint.
    expect(hits).toEqual(['/redirect']);
  });

  it('CHẶN phản hồi vượt trần kích thước', async () => {
    await expect(
      outboundFetch(
        `http://${LOOPBACK_HOST}:${port}/huge`,
        { method: 'GET' },
        allowOptions({ maxResponseBytes: 4096 }),
      ),
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
  });

  it('DỪNG khi quá hạn thay vì chờ vô hạn', async () => {
    await expect(
      outboundFetch(
        `http://${LOOPBACK_HOST}:${port}/slow`,
        { method: 'GET' },
        allowOptions({ timeoutMs: 1000 }),
      ),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('TỪ CHỐI URL có userinfo — chiêu hiển thị tên miền giả', async () => {
    await expect(
      outboundFetch(
        `http://nguoidung:matkhau@${LOOPBACK_HOST}:${port}/ok`,
        { method: 'GET' },
        allowOptions(),
      ),
    ).rejects.toMatchObject({ code: 'URL_REJECTED' });
  });

  it('TỪ CHỐI http khi không bật ngoại lệ loopback — mặc định là bắt buộc https', async () => {
    await expect(
      outboundFetch(
        `http://${LOOPBACK_HOST}:${port}/ok`,
        { method: 'GET' },
        allowOptions({ allowInsecureLoopback: false }),
      ),
    ).rejects.toMatchObject({ code: 'URL_REJECTED' });
  });

  it('trả về status lỗi của upstream thay vì ném — quyết định thuộc về tầng gọi', async () => {
    // `outboundFetch` chỉ chịu trách nhiệm về VẬN CHUYỂN. Một phản hồi 5xx là kết quả hợp
    // lệ ở tầng này; adapter mới là nơi biết 503 nghĩa là gì với nghiệp vụ của nó.
    const result = await outboundFetch(
      `http://${LOOPBACK_HOST}:${port}/boom`,
      { method: 'GET' },
      allowOptions(),
    );

    expect(result.status).toBe(503);
    expect(result.body).toContain('upstream');
  });

  it('URL dùng thẳng địa chỉ IP đi qua ĐÚNG phép kiểm địa chỉ nội bộ, không rơi vào lỗi DNS', async () => {
    // KHÔNG tiêm `resolve` — chạy bộ phân giải THẬT, đúng đường production đi.
    //
    // Hồi quy cho một lỗi thật: `dns.resolve4('127.0.0.1')` coi chuỗi đó là tên miền và tra
    // thất bại, nên bản đầu tiên trả `DNS_FAILED` cho MỌI URL dạng IP — kể cả IP công cộng
    // hợp lệ. Sai lầm nguy hiểm ở chỗ nó "trông như" đang chặn đúng: loopback vẫn bị từ
    // chối, chỉ là vì lý do khác hẳn, và một IP công cộng hợp lệ cũng bị chặn oan.
    const error = await outboundFetch(
      `http://${LOOPBACK_HOST}:${port}/ok`,
      { method: 'GET' },
      {
        allowedHosts: [{ host: LOOPBACK_HOST }],
        allowInsecureLoopback: true,
        timeoutMs: 5000,
      },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OutboundError);
    expect((error as OutboundError).code).toBe('DNS_REJECTED');
    // Thông điệp phải nói về địa chỉ nội bộ, KHÔNG phải "không phân giải được".
    expect((error as OutboundError).message).toContain('nội bộ');
  });

  it('ném OutboundError chứ không phải Error trần — tầng trên phân nhánh theo `code`', async () => {
    const error = await outboundFetch(
      `http://${LOOPBACK_HOST}:${port}/ok`,
      { method: 'GET' },
      allowOptions({ allowedHosts: [] }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OutboundError);
  });
});
