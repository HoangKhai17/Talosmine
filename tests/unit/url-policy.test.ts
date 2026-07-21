import { describe, expect, it } from 'vitest';
import {
  canonicalize,
  checkResolvedAddresses,
  checkUrlSyntax,
  isPrivateAddress,
  parseAllowedHosts,
  type UrlPolicyOptions,
} from '../../apps/control-plane/src/shared/url-policy';

/**
 * Chính sách URL (P3, DEC-T12).
 *
 * Phần lớn test ở đây là NEGATIVE: chúng mô tả các cách qua mặt cụ thể. Một hàm kiểm URL
 * viết vội sẽ pass hết test "URL hợp lệ thì cho qua" mà vẫn thủng ở `::ffff:127.0.0.1`.
 */

const OPTIONS: UrlPolicyOptions = {
  allowedHosts: [{ host: 'app.example.com' }, { host: 'storage.internal', internal: true }],
};

describe('checkUrlSyntax', () => {
  it('chấp nhận https tới host đã allowlist', () => {
    const result = checkUrlSyntax('https://app.example.com/launch', OPTIONS);
    expect(result.ok).toBe(true);
    expect(result.canonical).toBe('https://app.example.com/launch');
  });

  it('từ chối http', () => {
    const result = checkUrlSyntax('http://app.example.com/', OPTIONS);
    expect(result.code).toBe('SCHEME_NOT_ALLOWED');
  });

  it('từ chối scheme lạ — javascript: là vector XSS khi render thành link', () => {
    for (const raw of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
      expect(checkUrlSyntax(raw, OPTIONS).ok).toBe(false);
    }
  });

  it('TỪ CHỐI userinfo — công cụ lừa đảo kinh điển', () => {
    // Chuỗi này hiển thị "talosmine.vn" ở đầu nhưng trình duyệt đi tới app.example.com.
    // Ở đây host đích còn nằm trong allowlist, nên nếu không chặn userinfo thì nó lọt.
    const result = checkUrlSyntax('https://talosmine.vn@app.example.com/', OPTIONS);
    expect(result.code).toBe('USERINFO_NOT_ALLOWED');
  });

  it('từ chối host ngoài allowlist', () => {
    expect(checkUrlSyntax('https://evil.com/', OPTIONS).code).toBe('HOST_NOT_ALLOWED');
  });

  it('KHÔNG hỗ trợ wildcard — subdomain không tự động được phép', () => {
    // `*.example.com` sẽ cho phép kẻ tấn công đăng ký `evil.example.com`.
    expect(checkUrlSyntax('https://evil.app.example.com/', OPTIONS).code).toBe('HOST_NOT_ALLOWED');
  });

  it('allowlist rỗng thì từ chối MỌI host — mặc định nghiêng về an toàn', () => {
    const result = checkUrlSyntax('https://app.example.com/', { allowedHosts: [] });
    expect(result.code).toBe('HOST_NOT_ALLOWED');
  });

  it('so khớp host không phân biệt hoa thường', () => {
    expect(checkUrlSyntax('https://APP.EXAMPLE.COM/x', OPTIONS).ok).toBe(true);
  });

  it('từ chối chuỗi không phải URL', () => {
    expect(checkUrlSyntax('không phải url', OPTIONS).code).toBe('MALFORMED');
  });

  it('http tới loopback CHỈ được phép khi bật ngoại lệ dev', () => {
    const dev: UrlPolicyOptions = {
      allowedHosts: [{ host: 'localhost' }],
      allowInsecureLoopback: true,
    };
    expect(checkUrlSyntax('http://localhost:3000/cb', dev).ok).toBe(true);

    // Cùng cấu hình dev nhưng host KHÁC loopback thì vẫn phải là https —
    // điều kiện là hostname, không phải môi trường.
    const devOther: UrlPolicyOptions = {
      allowedHosts: [{ host: 'app.example.com' }],
      allowInsecureLoopback: true,
    };
    expect(checkUrlSyntax('http://app.example.com/', devOther).code).toBe('SCHEME_NOT_ALLOWED');
  });
});

describe('isPrivateAddress — các cách qua mặt', () => {
  it('chặn dải IPv4 nội bộ theo IANA', () => {
    const blocked = [
      '0.0.0.0',
      '10.0.0.5',
      '100.64.1.1', // CGNAT
      '127.0.0.1',
      '169.254.169.254', // metadata endpoint của cloud — lộ credential IAM
      '172.16.0.1',
      '172.31.255.254',
      '192.168.1.1',
      '192.0.0.1',
      '198.18.0.1',
      '224.0.0.1',
      '255.255.255.255',
    ];
    for (const address of blocked) {
      expect(isPrivateAddress(address), `${address} phải bị chặn`).toBe(true);
    }
  });

  it('cho qua IPv4 công cộng', () => {
    for (const address of ['1.1.1.1', '8.8.8.8', '203.0.113.10', '172.32.0.1']) {
      expect(isPrivateAddress(address), `${address} phải được phép`).toBe(false);
    }
  });

  it('CHẶN IPv4 nhúng trong IPv6 — cách qua mặt phổ biến nhất', () => {
    // `::ffff:127.0.0.1` là loopback, nhưng mọi phép kiểm IPv4 thuần đều không thấy nó.
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:169.254.169.254')).toBe(true);

    // Dạng hex của cùng địa chỉ: ::ffff:7f00:1 == 127.0.0.1
    expect(isPrivateAddress('::ffff:7f00:1')).toBe(true);

    // IPv4-mapped của địa chỉ công cộng thì vẫn cho qua.
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('chặn IPv6 nội bộ', () => {
    for (const address of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1']) {
      expect(isPrivateAddress(address), `${address} phải bị chặn`).toBe(true);
    }
  });

  it('cho qua IPv6 công cộng', () => {
    expect(isPrivateAddress('2001:4860:4860::8888')).toBe(false);
  });

  it('chuỗi không phải IP thì coi là KHÔNG an toàn', () => {
    // Thà từ chối nhầm còn hơn cho qua nhầm.
    expect(isPrivateAddress('không phải ip')).toBe(true);
    expect(isPrivateAddress('')).toBe(true);
  });
});

describe('checkResolvedAddresses', () => {
  it('cho qua khi mọi địa chỉ đều công cộng', async () => {
    const result = await checkResolvedAddresses('app.example.com', OPTIONS, async () => [
      '203.0.113.10',
    ]);
    expect(result.ok).toBe(true);
    expect(result.addresses).toEqual(['203.0.113.10']);
  });

  it('CHẶN khi MỘT trong nhiều địa chỉ là nội bộ', async () => {
    // Kẻ tấn công cho host trả về cả IP công cộng lẫn 127.0.0.1. Kiểm mỗi địa chỉ đầu
    // tiên sẽ lọt.
    const result = await checkResolvedAddresses('app.example.com', OPTIONS, async () => [
      '203.0.113.10',
      '127.0.0.1',
    ]);
    expect(result.code).toBe('PRIVATE_ADDRESS');
  });

  it('TRẢ VỀ địa chỉ đã kiểm để caller kết nối bằng chính nó — chống DNS rebinding', async () => {
    // Nếu caller để hệ thống phân giải lại lúc kết nối, DNS có thể đã đổi sang 127.0.0.1
    // trong khoảng giữa hai lần. Trả địa chỉ ra là cách đóng khe hở đó.
    const result = await checkResolvedAddresses('app.example.com', OPTIONS, async () => [
      '203.0.113.10',
      '203.0.113.11',
    ]);
    expect(result.addresses).toHaveLength(2);
  });

  it('host nội bộ của chính dự án BỎ QUA kiểm địa chỉ', async () => {
    // Supabase Storage chạy trong private network (DEC-T12). Kiểm địa chỉ nội bộ tồn tại
    // để chặn URL LẠ, còn hạ tầng của mình thì ta biết nó ở đâu.
    let resolved = false;
    const result = await checkResolvedAddresses('storage.internal', OPTIONS, async () => {
      resolved = true;
      return ['10.0.0.5'];
    });
    expect(result.ok).toBe(true);
    expect(resolved, 'không cần phân giải DNS cho host nội bộ').toBe(false);
  });

  it('host ngoài allowlist bị chặn TRƯỚC khi chạm DNS', async () => {
    let resolved = false;
    const result = await checkResolvedAddresses('evil.com', OPTIONS, async () => {
      resolved = true;
      return ['203.0.113.10'];
    });
    expect(result.code).toBe('HOST_NOT_ALLOWED');
    expect(resolved, 'không được gọi DNS cho host chưa allowlist').toBe(false);
  });

  it('DNS lỗi → từ chối, không cho qua', async () => {
    const result = await checkResolvedAddresses('app.example.com', OPTIONS, async () => {
      throw new Error('ENOTFOUND');
    });
    expect(result.code).toBe('DNS_FAILED');
  });

  it('DNS trả rỗng → từ chối', async () => {
    const result = await checkResolvedAddresses('app.example.com', OPTIONS, async () => []);
    expect(result.code).toBe('DNS_FAILED');
  });
});

describe('canonicalize', () => {
  it('hạ chữ thường host và bỏ cổng mặc định', () => {
    expect(canonicalize(new URL('HTTPS://App.Example.COM:443/Path'))).toBe(
      'https://app.example.com/Path',
    );
  });

  it('giữ nguyên path — path PHÂN BIỆT hoa thường', () => {
    // Hạ chữ thường cả path sẽ làm `/Admin` và `/admin` thành một, trong khi nhiều máy chủ
    // coi chúng là hai tài nguyên khác nhau.
    expect(canonicalize(new URL('https://app.example.com/Admin'))).toContain('/Admin');
  });

  it('bỏ fragment — nó không bao giờ tới máy chủ', () => {
    expect(canonicalize(new URL('https://app.example.com/x#section'))).toBe(
      'https://app.example.com/x',
    );
  });

  it('giữ cổng khác mặc định', () => {
    expect(canonicalize(new URL('https://app.example.com:8443/x'))).toBe(
      'https://app.example.com:8443/x',
    );
  });
});

describe('parseAllowedHosts', () => {
  it('đọc danh sách phân cách bằng dấu phẩy', () => {
    expect(parseAllowedHosts('a.com, b.com')).toEqual([{ host: 'a.com' }, { host: 'b.com' }]);
  });

  it('cờ `!internal` phải viết TƯỜNG MINH', () => {
    // Không suy đoán từ tên host: đoán sai là mở lại đúng lỗ SSRF.
    expect(parseAllowedHosts('storage.internal')).toEqual([{ host: 'storage.internal' }]);
    expect(parseAllowedHosts('storage.internal!internal')).toEqual([
      { host: 'storage.internal', internal: true },
    ]);
  });

  it('chuỗi rỗng hoặc thiếu → danh sách rỗng (từ chối mọi thứ)', () => {
    expect(parseAllowedHosts(undefined)).toEqual([]);
    expect(parseAllowedHosts('')).toEqual([]);
    expect(parseAllowedHosts('  ,  ')).toEqual([]);
  });

  it('hạ chữ thường host', () => {
    expect(parseAllowedHosts('APP.Example.COM')).toEqual([{ host: 'app.example.com' }]);
  });
});
