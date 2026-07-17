import { describe, expect, it } from 'vitest';
import {
  CORRELATION_HEADER,
  getCorrelationId,
  isValidCorrelationId,
  resolveCorrelationId,
  runWithCorrelationId,
} from '../../apps/control-plane/src/shared/correlation';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('correlation — header name', () => {
  it('dùng đúng tên header đã freeze, lowercase', () => {
    expect(CORRELATION_HEADER).toBe('x-correlation-id');
  });
});

describe('resolveCorrelationId — input hợp lệ thì giữ nguyên', () => {
  // Correlation ID chỉ để truy vết. Giữ nguyên giá trị client gửi là điều kiện cần
  // để trace nối được xuyên BFF -> API -> worker.
  const validIds = [
    ['UUIDv4', '9f8e7d6c-5b4a-4938-8271-6a5b4c3d2e1f'],
    ['UUIDv7', '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'],
    ['nil UUID', '00000000-0000-0000-0000-000000000000'],
    ['chữ hoa', '9F8E7D6C-5B4A-4938-8271-6A5B4C3D2E1F'],
  ] as const;

  for (const [label, id] of validIds) {
    it(`giữ nguyên ${label}`, () => {
      expect(resolveCorrelationId(id)).toBe(id);
    });
  }
});

describe('resolveCorrelationId — input rác thì sinh mới, KHÔNG ném lỗi', () => {
  // Hợp đồng (correlation.ts): định dạng sai KHÔNG làm fail request. Làm hỏng một request
  // hợp lệ vì một header truy vết xấu là đánh đổi sai — client không kiểm soát được
  // header này trong mọi trường hợp (proxy, retry, tooling đều có thể chèn rác).
  const garbage: Array<readonly [string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['chuỗi rỗng', ''],
    ['không phải uuid', 'not-a-uuid'],
    ['thiếu ký tự', '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5'],
    ['thừa ký tự', '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5bb'],
    ['ký tự ngoài hex', '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4azz'],
    ['số', 12345],
    ['object', { id: 'x' }],
    ['mảng', ['0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b']],
    ['SQL injection attempt', "'; DROP TABLE accounts; --"],
    ['CRLF injection (log forging)', '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b\r\nX-Injected: 1'],
    ['khoảng trắng thừa', ' 0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b '],
  ];

  for (const [label, input] of garbage) {
    it(`sinh UUID mới cho ${label} thay vì ném lỗi`, () => {
      let result: string | undefined;
      expect(() => {
        result = resolveCorrelationId(input);
      }).not.toThrow();

      expect(result).toMatch(UUID_SHAPE);
      expect(result).not.toBe(input);
    });
  }

  it('mỗi lần sinh ra một ID khác nhau', () => {
    const ids = new Set(Array.from({ length: 50 }, () => resolveCorrelationId('rác')));
    expect(ids.size).toBe(50);
  });

  it('ID sinh mới là UUIDv7 (DEC-T06) — version nibble = 7', () => {
    const generated = resolveCorrelationId(undefined);
    // Ký tự thứ 15 (index 14) là version nibble theo RFC 4122/9562.
    expect(generated[14]).toBe('7');
  });

  it('ID sinh mới luôn được chính isValidCorrelationId chấp nhận', () => {
    // Nếu sai, correlation ID sinh ra ở hop này sẽ bị hop sau vứt bỏ và trace đứt đoạn.
    for (let i = 0; i < 20; i++) {
      expect(isValidCorrelationId(resolveCorrelationId(null))).toBe(true);
    }
  });
});

describe('isValidCorrelationId', () => {
  it('nhận UUID hợp lệ', () => {
    expect(isValidCorrelationId('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBe(true);
  });

  it('từ chối non-string mà không ném lỗi', () => {
    for (const value of [undefined, null, 42, {}, [], true]) {
      expect(isValidCorrelationId(value)).toBe(false);
    }
  });
});

describe('correlation context (AsyncLocalStorage)', () => {
  it('trả undefined khi ngoài request scope', () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it('trả đúng ID bên trong scope', () => {
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    const seen = runWithCorrelationId(id, () => getCorrelationId());
    expect(seen).toBe(id);
  });

  it('context sống xuyên await — nếu vỡ thì log của async handler mất trace', async () => {
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

    const seen = await runWithCorrelationId(id, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return getCorrelationId();
    });

    expect(seen).toBe(id);
  });

  it('hai scope lồng nhau không rò rỉ sang nhau', () => {
    const outer = '11111111-1111-7111-8111-111111111111';
    const inner = '22222222-2222-7222-8222-222222222222';

    const result = runWithCorrelationId(outer, () => {
      const before = getCorrelationId();
      const nested = runWithCorrelationId(inner, () => getCorrelationId());
      const after = getCorrelationId();
      return { before, nested, after };
    });

    expect(result).toEqual({ before: outer, nested: inner, after: outer });
  });

  it('hai scope song song không trộn lẫn ID', async () => {
    const a = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb';

    const withDelay = (id: string, ms: number) =>
      runWithCorrelationId(id, async () => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return getCorrelationId();
      });

    // A ngủ lâu hơn B: nếu context bị chia sẻ nhầm, A sẽ trả về ID của B.
    const [seenA, seenB] = await Promise.all([withDelay(a, 20), withDelay(b, 1)]);

    expect(seenA).toBe(a);
    expect(seenB).toBe(b);
  });

  it('context được dọn sau khi scope kết thúc', () => {
    runWithCorrelationId('33333333-3333-7333-8333-333333333333', () => getCorrelationId());
    expect(getCorrelationId()).toBeUndefined();
  });
});
