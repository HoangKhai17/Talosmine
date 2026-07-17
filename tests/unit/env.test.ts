import { beforeEach, describe, expect, it } from 'vitest';
import { loadEnv, resetEnvCache } from '../../apps/control-plane/src/shared/env';

/**
 * Contract: phase-1 mục 9 — thiếu biến bắt buộc thì FAIL FAST, không chạy với default ngầm.
 *
 * `loadEnv` cache kết quả ở module scope, nên mọi case phải reset trước khi chạy.
 * Không reset thì case sau đọc lại state của case trước và test trở thành vô nghĩa.
 */
beforeEach(() => {
  resetEnvCache();
});

const VALID_DATABASE_URL = 'postgres://talosmine_runtime.talosmine@127.0.0.1:56543/postgres';

function baseEnv(): NodeJS.ProcessEnv {
  return { DATABASE_URL: VALID_DATABASE_URL };
}

describe('loadEnv — fail fast khi thiếu biến bắt buộc', () => {
  it('thiếu DATABASE_URL thì NÉM LỖI, không trả default ngầm', () => {
    expect(() => loadEnv({})).toThrow();
  });

  it('DATABASE_URL undefined tường minh cũng ném lỗi', () => {
    expect(() => loadEnv({ DATABASE_URL: undefined })).toThrow();
  });

  it('thông điệp lỗi nêu đúng TÊN biến thiếu', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('DATABASE_URL rỗng thì ném lỗi — chuỗi rỗng không phải URL hợp lệ', () => {
    expect(() => loadEnv({ DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('DATABASE_URL không parse được thành URL thì ném lỗi', () => {
    expect(() => loadEnv({ DATABASE_URL: 'không phải url' })).toThrow(/DATABASE_URL/);
  });

  it('KHÔNG cache kết quả lỗi — gọi lại vẫn ném, không âm thầm pass', () => {
    expect(() => loadEnv({})).toThrow();
    expect(() => loadEnv({})).toThrow();
  });
});

describe('loadEnv — scheme của DATABASE_URL phải là postgres', () => {
  // Lịch sử: đây từng là characterization test ghi lại một GAP — `z.string().url()` chỉ hỏi
  // `new URL(value)` có parse được không, mà `new URL('localhost:5432')` parse THÀNH CÔNG
  // (`localhost:` thành scheme, `5432` thành pathname). Owner `backend` đã quyết định siết,
  // vì để một DATABASE_URL vô nghĩa lọt qua cửa fail-fast rồi vỡ ở tầng connect chính là
  // thứ env.ts sinh ra để ngăn. Test nay assert CONTRACT, không còn ghi lại gap.

  it('từ chối chuỗi không có scheme postgres', () => {
    expect(() => loadEnv({ DATABASE_URL: 'localhost:5432' })).toThrow();
  });

  it('từ chối scheme sai', () => {
    expect(() => loadEnv({ DATABASE_URL: 'http://localhost:5432/postgres' })).toThrow();
    expect(() => loadEnv({ DATABASE_URL: 'mysql://localhost:3306/db' })).toThrow();
  });

  it('từ chối chuỗi không parse được thành URL', () => {
    expect(() => loadEnv({ DATABASE_URL: 'khong-phai-url' })).toThrow();
  });

  it('chấp nhận cả postgresql:// và postgres://', () => {
    // postgres.js và drizzle-kit đều nhận cả hai scheme.
    expect(() =>
      loadEnv({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/postgres' }),
    ).not.toThrow();

    // loadEnv cache kết quả nên phải reset trước khi thử scheme thứ hai.
    resetEnvCache();
    expect(() => loadEnv({ DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/postgres' })).not.toThrow();
  });

  it('thông điệp lỗi nêu scheme nhận được nhưng KHÔNG in cả URL', () => {
    // URL chứa password. Nêu scheme là đủ để người vận hành sửa; in cả chuỗi thì biến
    // một lỗi cấu hình thành một lần rò rỉ credential.
    const url = 'http://user:sUp3r-s3cr3t@localhost:5432/db';
    try {
      loadEnv({ DATABASE_URL: url });
      throw new Error('đáng lẽ phải ném');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain('http://');
      expect(message).not.toContain('sUp3r-s3cr3t');
      expect(message).not.toContain(url);
    }
  });
});

describe('loadEnv — thông điệp lỗi KHÔNG được lộ giá trị biến', () => {
  // Vì sao quan trọng: thông điệp này đi vào stdout/stderr, vào log aggregator và vào CI
  // output — tất cả đều là nơi secret không được xuất hiện. Nêu tên biến + lý do là đủ để
  // sửa; in giá trị ra thì biến một lỗi cấu hình thành một lần rò rỉ credential.

  const SECRET = 'sUp3r-s3cr3t-P@ssw0rd-do-not-log';

  function messageOf(source: NodeJS.ProcessEnv): string {
    try {
      loadEnv(source);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error('loadEnv đáng lẽ phải ném lỗi nhưng đã pass');
  }

  it('không in giá trị DATABASE_URL sai định dạng', () => {
    const message = messageOf({ DATABASE_URL: `postgres-invalid-${SECRET}` });

    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain(SECRET);
  });

  it('không in giá trị MIGRATION_DATABASE_URL sai định dạng', () => {
    const message = messageOf({
      ...baseEnv(),
      MIGRATION_DATABASE_URL: `migration-invalid-${SECRET}`,
    });

    expect(message).toContain('MIGRATION_DATABASE_URL');
    expect(message).not.toContain(SECRET);
  });

  it('không in giá trị AUTH0_ISSUER_URL sai định dạng', () => {
    const message = messageOf({ ...baseEnv(), AUTH0_ISSUER_URL: `issuer-invalid-${SECRET}` });

    expect(message).toContain('AUTH0_ISSUER_URL');
    expect(message).not.toContain(SECRET);
  });

  it('không in giá trị của biến enum sai (NODE_ENV)', () => {
    const message = messageOf({ ...baseEnv(), NODE_ENV: `staging-${SECRET}` });

    expect(message).toContain('NODE_ENV');
    expect(message).not.toContain(SECRET);
  });

  it('không in giá trị của biến số sai (API_PORT)', () => {
    const message = messageOf({ ...baseEnv(), API_PORT: `70000${SECRET}` });

    expect(message).toContain('API_PORT');
    expect(message).not.toContain(SECRET);
  });

  it('báo hết mọi biến sai trong một lần, không dừng ở cái đầu tiên', () => {
    // Fail-fast từng biến một sẽ biến việc sửa config thành nhiều vòng thử-sai.
    const message = messageOf({ NODE_ENV: 'staging', API_PORT: '0' });

    expect(message).toContain('NODE_ENV');
    expect(message).toContain('API_PORT');
    expect(message).toContain('DATABASE_URL');
  });
});

describe('loadEnv — default chỉ áp cho biến KHÔNG bắt buộc', () => {
  it('áp default khi chỉ có DATABASE_URL', () => {
    const env = loadEnv(baseEnv());

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 3001,
      API_HOST: '0.0.0.0',
      LOG_LEVEL: 'info',
      DATABASE_URL: VALID_DATABASE_URL,
    });
  });

  it('API_PORT được coerce từ string sang number', () => {
    const env = loadEnv({ ...baseEnv(), API_PORT: '8080' });

    expect(env.API_PORT).toBe(8080);
    expect(typeof env.API_PORT).toBe('number');
  });

  it('biến Auth0 là optional ở P1 (DEC-B03 chưa chốt tenant thật)', () => {
    const env = loadEnv(baseEnv());

    expect(env.AUTH0_ISSUER_URL).toBeUndefined();
    expect(env.AUTH0_AUDIENCE).toBeUndefined();
  });

  it('từ chối API_PORT ngoài dải hợp lệ', () => {
    expect(() => loadEnv({ ...baseEnv(), API_PORT: '70000' })).toThrow(/API_PORT/);
  });

  it('từ chối NODE_ENV ngoài enum — không im lặng rơi về development', () => {
    expect(() => loadEnv({ ...baseEnv(), NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('từ chối LOG_LEVEL ngoài enum', () => {
    expect(() => loadEnv({ ...baseEnv(), LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });
});

describe('loadEnv — cache', () => {
  it('trả cùng một object giữa các lần gọi', () => {
    const first = loadEnv(baseEnv());
    const second = loadEnv(baseEnv());

    expect(second).toBe(first);
  });

  it('resetEnvCache thật sự xoá cache', () => {
    const first = loadEnv(baseEnv());
    resetEnvCache();
    const second = loadEnv({ ...baseEnv(), API_PORT: '9999' });

    expect(second).not.toBe(first);
    expect(second.API_PORT).toBe(9999);
  });
});
