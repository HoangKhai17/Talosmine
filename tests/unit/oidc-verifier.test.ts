import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as jose from 'jose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { verifyIdToken } from '../../apps/control-plane/src/modules/identity/oidc-verifier';
import { resetEnvCache } from '../../apps/control-plane/src/shared/env';

/**
 * Test âm cho `verifyIdToken` — B1 của pending-work.md.
 *
 * TẠI SAO QUAN TRỌNG: đây là chỗ DUY NHẤT Control Plane tự chứng minh danh tính người gọi.
 * `auth.controller.ts` không tin `issuer`/`subject` do BFF khai — mọi thứ đến từ chữ ký đã
 * verify ở đây. File này trước khi có bộ test này có **0 tham chiếu** ở bất kỳ đâu trong
 * `tests/`: lớp tin cậy quan trọng nhất của hệ thống chưa từng được kiểm bằng test tự động.
 *
 * KHÔNG MOCK `jose`. Dựng một JWKS server THẬT bằng `node:http`, ký token bằng khoá THẬT,
 * và để `verifyIdToken` tự gọi `createRemoteJWKSet` qua HTTP như production — đúng tinh
 * thần "không mock, dùng phụ thuộc thật" của DEC-T05, áp cho mạng thay vì cho database.
 *
 * Phần lớn case dưới đây là NEGATIVE: một hàm verify viết vội sẽ pass hết "token hợp lệ thì
 * qua" mà vẫn thủng ở alg confusion hay chữ ký ký bằng khoá khác nhưng khai đúng `kid` thật.
 *
 * NGOÀI PHẠM VI FILE NÀY: `state`/`nonce`/`code_verifier` (PKCE) và callback replay không
 * được kiểm ở đây — chúng được `openid-client` xác minh ở tầng BFF
 * (`apps/web/app/auth/callback/route.ts`), TRƯỚC khi id_token tới được hàm này. Đó là một
 * lớp tin cậy khác, việc của chúng ta ở đó là đảm bảo THẤT BẠI của `openid-client` luôn dẫn
 * tới `failure()` (dọn cookie, không tạo phiên) — xem lượt kế tiếp của B1.
 */

const KEY_ID = 'test-key-1';
const AUDIENCE = 'test-client';

describe('verifyIdToken — test âm cho OIDC', () => {
  let server: Server;
  let issuerUrl: string;
  let primaryPrivateKey: CryptoKey;
  let primaryPublicKey: CryptoKey;
  let otherPrivateKey: CryptoKey;

  beforeAll(async () => {
    const primary = await jose.generateKeyPair('RS256', { extractable: true });
    primaryPrivateKey = primary.privateKey;
    primaryPublicKey = primary.publicKey;

    const other = await jose.generateKeyPair('RS256', { extractable: true });
    otherPrivateKey = other.privateKey;

    const jwk = await jose.exportJWK(primaryPublicKey);
    jwk.kid = KEY_ID;
    jwk.alg = 'RS256';
    jwk.use = 'sig';

    // Server THẬT, chỉ phục vụ đúng một tài liệu JWKS — đủ để `createRemoteJWKSet` của jose
    // tự fetch/refetch qua HTTP y hệt cách nó nói chuyện với Logto lúc chạy thật.
    server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    issuerUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    resetEnvCache();
  });

  beforeEach(() => {
    // `loadEnv()` đòi DATABASE_URL hợp lệ dù `verifyIdToken` không chạm DB — giá trị này
    // không bao giờ được dùng để kết nối, chỉ để qua được z.object của env schema.
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.OIDC_ISSUER_URL = issuerUrl;
    delete process.env.OIDC_CLIENT_ID;
    resetEnvCache();
  });

  afterEach(() => {
    delete process.env.OIDC_CLIENT_ID;
  });

  function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }

  /** Payload hợp lệ mặc định — mỗi test chỉ ghi đè đúng claim mình đang kiểm. */
  function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const iat = nowSeconds();
    return { iss: issuerUrl, sub: 'user-1', aud: AUDIENCE, iat, exp: iat + 3600, ...overrides };
  }

  async function signToken(
    payload: Record<string, unknown>,
    options?: { key?: CryptoKey; kid?: string; alg?: string },
  ): Promise<string> {
    return new jose.SignJWT(payload)
      .setProtectedHeader({ alg: options?.alg ?? 'RS256', kid: options?.kid ?? KEY_ID })
      .sign(options?.key ?? primaryPrivateKey);
  }

  function base64url(input: string): string {
    return Buffer.from(input).toString('base64url');
  }

  describe('đường hợp lệ — chốt baseline trước khi kiểm các đường từ chối', () => {
    it('token đúng chữ ký, đúng issuer/audience → verify thành công, trả đúng claim', async () => {
      const token = await signToken(
        validPayload({ email: 'user@example.com', email_verified: true, name: 'Nguyễn Văn A' }),
      );

      await expect(verifyIdToken(token)).resolves.toEqual({
        issuer: issuerUrl,
        subject: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'Nguyễn Văn A',
      });
    });

    it('KHÔNG kiểm audience khi OIDC_CLIENT_ID chưa cấu hình — hành vi có chủ đích', async () => {
      // OIDC_CLIENT_ID đã bị `delete` ở beforeEach. Token mang audience bất kỳ vẫn phải qua.
      const token = await signToken(validPayload({ aud: 'mot-client-bat-ky' }));
      await expect(verifyIdToken(token)).resolves.toMatchObject({ subject: 'user-1' });
    });
  });

  describe('từ chối theo claim chuẩn OIDC', () => {
    it('TỪ CHỐI token đã hết hạn', async () => {
      const token = await signToken(validPayload({ exp: nowSeconds() - 60 }));
      await expect(verifyIdToken(token)).rejects.toThrow();
    });

    it('TỪ CHỐI token CHƯA có hiệu lực (`nbf` ở tương lai)', async () => {
      const token = await signToken(validPayload({ nbf: nowSeconds() + 3600 }));
      await expect(verifyIdToken(token)).rejects.toThrow();
    });

    it('TỪ CHỐI sai issuer — token của một IdP khác', async () => {
      const token = await signToken(validPayload({ iss: 'http://attacker.example' }));
      await expect(verifyIdToken(token)).rejects.toThrow();
    });

    it('TỪ CHỐI sai audience khi OIDC_CLIENT_ID ĐÃ cấu hình — token phát cho app khác', async () => {
      process.env.OIDC_CLIENT_ID = AUDIENCE;
      resetEnvCache();

      const token = await signToken(validPayload({ aud: 'mot-client-khac' }));
      await expect(verifyIdToken(token)).rejects.toThrow();
    });

    it('TỪ CHỐI thiếu `sub` — chữ ký/issuer/audience đều đúng, chỉ thiếu định danh', async () => {
      const payload = validPayload();
      delete payload.sub;
      const token = await signToken(payload);

      await expect(verifyIdToken(token)).rejects.toThrow(/sub/i);
    });
  });

  describe('từ chối giả mạo chữ ký — nơi một hàm verify viết vội hay thủng nhất', () => {
    it('TỪ CHỐI ký bằng khoá KHÁC nhưng khai đúng `kid` thật (giả mạo danh tính)', async () => {
      const token = await signToken(validPayload(), { key: otherPrivateKey });
      await expect(verifyIdToken(token)).rejects.toThrow();
    });

    it('TỪ CHỐI `kid` không tồn tại trong JWKS', async () => {
      const token = await signToken(validPayload(), { kid: 'khong-ton-tai' });
      await expect(verifyIdToken(token)).rejects.toThrow();
    });

    it('TỪ CHỐI alg:none — token tự chế, không có chữ ký thật', async () => {
      // Hand-craft: jose.SignJWT không cho ký với alg "none" — đúng như một verifier tốt
      // phải làm — nên kẻ tấn công phải tự dựng chuỗi compact JWS mà không qua jose.
      const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
      const payload = base64url(JSON.stringify(validPayload()));
      const token = `${header}.${payload}.`;

      await expect(verifyIdToken(token)).rejects.toThrow();
    });

    it('TỪ CHỐI alg confusion — RS256 → HS256, dùng CHÍNH public key làm secret HMAC', async () => {
      // Đòn tấn công JWT kinh điển: verifier tin `alg` trong header, tra khoá RS256 công
      // khai theo `kid` rồi lại dùng nó làm khoá đối xứng để verify HS256 — mà public key
      // là CÔNG KHAI nên kẻ tấn công tự ký được bất kỳ payload nào.
      const spkiPem = await jose.exportSPKI(primaryPublicKey);
      const secret = new TextEncoder().encode(spkiPem);

      const token = await new jose.SignJWT(validPayload())
        .setProtectedHeader({ alg: 'HS256', kid: KEY_ID })
        .sign(secret);

      await expect(verifyIdToken(token)).rejects.toThrow();
    });
  });

  describe('`email_verified` chỉ được tin khi là boolean `true` — database-schema mục 4.1', () => {
    it('chuỗi "true" KHÔNG được coi là đã xác minh — chỉ boolean thật mới được tin', async () => {
      const token = await signToken(
        validPayload({ email: 'user@example.com', email_verified: 'true' }),
      );
      const claims = await verifyIdToken(token);
      expect(claims.emailVerified).toBe(false);
    });

    it('thiếu claim `email` → `emailVerified` cũng `undefined`, không suy luận từ email_verified', async () => {
      const token = await signToken(validPayload({ email_verified: true }));
      const claims = await verifyIdToken(token);
      expect(claims.email).toBeUndefined();
      expect(claims.emailVerified).toBeUndefined();
    });
  });
});
