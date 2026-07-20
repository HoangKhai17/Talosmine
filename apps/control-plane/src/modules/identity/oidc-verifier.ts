import { loadEnv } from '../../shared/env.js';

/**
 * `jose` 6 là package ESM-only, còn Control Plane cố ý biên dịch ra CommonJS (xem
 * tsconfig.json: ESM + emitDecoratorMetadata + Fastify adapter là tổ hợp dễ vỡ).
 * `import` tĩnh sẽ thành `require()` và nổ lúc chạy, nên nạp bằng dynamic import —
 * cách chính thức để CJS gọi ESM. Hàm verify vốn đã async nên không mất gì.
 */
// `resolution-mode: 'import'` là bắt buộc: từ file CJS, TypeScript mặc định phân giải
// type theo nhánh `require` — mà jose không có nhánh đó. Attribute này bảo nó đọc
// đúng nhánh ESM, khớp với `import()` động ở dưới.
type Jose = typeof import('jose', { with: { 'resolution-mode': 'import' }});

let josePromise: Promise<Jose> | undefined;

function loadJose(): Promise<Jose> {
  // Giữ lại promise chứ không phải module: nhiều request song song lần đầu chỉ import một lần.
  josePromise ??= import('jose');
  return josePromise;
}

/**
 * Xác minh ID token do identity provider phát (DEC-T22: Logto self-host).
 *
 * NGUYÊN TẮC CỐT LÕI: Control Plane **tự verify chữ ký**, KHÔNG tin `issuer`/`subject`
 * do BFF gửi lên. Nếu tin BFF, bất kỳ ai gọi được endpoint đều có thể khai mình là
 * người khác. Chữ ký của IdP là thứ duy nhất chứng minh danh tính.
 *
 * Dùng `jose` + JWKS chuẩn OIDC — không có gì riêng của Logto. Đổi provider chỉ cần đổi
 * `OIDC_ISSUER_URL`.
 */

export interface VerifiedIdentityClaims {
  issuer: string;
  subject: string;
  email?: string | undefined;
  emailVerified?: boolean | undefined;
  name?: string | undefined;
}

/**
 * JWKS được cache theo issuer. `createRemoteJWKSet` tự cache khoá và tự tải lại khi gặp
 * `kid` lạ (lúc IdP xoay khoá) — không tự viết cache để tránh giữ khoá cũ sau khi xoay.
 */
type JwkSet = ReturnType<Jose['createRemoteJWKSet']>;

const jwksCache = new Map<string, JwkSet>();

function getJwks(jose: Jose, issuerUrl: string): JwkSet {
  const cached = jwksCache.get(issuerUrl);
  if (cached) return cached;

  // Chuẩn OIDC: JWKS nằm ở <issuer>/jwks với Logto; dùng discovery sẽ tổng quát hơn nhưng
  // thêm một vòng request mỗi lần khởi động. Đường dẫn lấy từ discovery đã kiểm chứng.
  const jwks = jose.createRemoteJWKSet(new URL(`${issuerUrl.replace(/\/$/, '')}/jwks`));
  jwksCache.set(issuerUrl, jwks);
  return jwks;
}

/**
 * Verify ID token và trả về claim đã được chứng thực.
 *
 * Ném lỗi nếu: chữ ký sai, hết hạn, sai issuer, sai audience, hoặc thiếu `sub`.
 * Mọi trường hợp đều là "token không hợp lệ" — caller không được đi tiếp.
 */
export async function verifyIdToken(idToken: string): Promise<VerifiedIdentityClaims> {
  const env = loadEnv();

  const issuerUrl = env.OIDC_ISSUER_URL;
  if (!issuerUrl) {
    throw new Error('Thiếu OIDC_ISSUER_URL — không thể xác minh token.');
  }

  const jose = await loadJose();

  const { payload } = await jose.jwtVerify(idToken, getJwks(jose, issuerUrl), {
    issuer: issuerUrl,
    // audience của ID token là client ID của ứng dụng. Kiểm để một token phát cho app
    // KHÁC không dùng được ở đây.
    ...(env.OIDC_CLIENT_ID ? { audience: env.OIDC_CLIENT_ID } : {}),
  });

  const subject = payload.sub;
  if (!subject) {
    throw new Error('Token thiếu `sub` — không xác định được danh tính.');
  }

  // `email_verified` chỉ được tin khi là boolean true. Thiếu/null/chuỗi đều coi là chưa
  // xác minh (database-schema mục 4.1).
  const emailVerified = payload.email_verified === true;
  const email = typeof payload.email === 'string' ? payload.email : undefined;
  const name = typeof payload.name === 'string' ? payload.name : undefined;

  return {
    issuer: payload.iss ?? issuerUrl,
    subject,
    email,
    emailVerified: email !== undefined ? emailVerified : undefined,
    name,
  };
}
